import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureCurrentPosition } from '../geo'

// MODE-903 (§6) — géolocalisation au moment utile. Règles du cahier des
// charges : demander la permission uniquement quand c'est utile, le refus ne
// bloque JAMAIS le Mode Marché, ne pas collecter en continu. Le contrat
// technique (pattern biometric-auth) : ne jamais throw, états explicites
// captured / refused / unavailable, Capacitor natif d'abord, repli web.

const geoMock = vi.hoisted(() => ({ getCurrentPosition: vi.fn() }))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: geoMock,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  geoMock.getCurrentPosition.mockReset()
})

describe('captureCurrentPosition (§6)', () => {
  it('capture via le moteur natif Capacitor (prioritaire)', async () => {
    geoMock.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 5.35995, longitude: -4.00809, accuracy: 12.5 },
      timestamp: 1_700_000_000_000,
    })
    const result = await captureCurrentPosition()
    expect(result.status).toBe('captured')
    if (result.status === 'captured') {
      expect(result.position).toEqual({
        lat: 5.35995,
        lng: -4.00809,
        accuracy: 12.5,
        timestamp: 1_700_000_000_000,
      })
    }
    expect(geoMock.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('repli web si le natif échoue (shell non natif)', async () => {
    geoMock.getCurrentPosition.mockRejectedValue(new Error('unimplemented'))
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({
            coords: { latitude: 5.3, longitude: -4.0, accuracy: 30 },
            timestamp: 1_700_000_001_000,
          }),
      },
    })
    const result = await captureCurrentPosition()
    expect(result.status).toBe('captured')
    if (result.status === 'captured') expect(result.position.lat).toBe(5.3)
  })

  it('permission refusée côté web → refused (jamais une erreur bloquante)', async () => {
    geoMock.getCurrentPosition.mockRejectedValue(new Error('unimplemented'))
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _ok: (p: unknown) => void,
          err: (e: { code: number }) => void,
        ) => err({ code: 1 }), // GeolocationPositionError.PERMISSION_DENIED
      },
    })
    const result = await captureCurrentPosition()
    expect(result).toEqual({ status: 'refused' })
  })

  it('aucun moteur disponible → unavailable (sans throw)', async () => {
    geoMock.getCurrentPosition.mockRejectedValue(new Error('unimplemented'))
    vi.stubGlobal('navigator', {})
    const result = await captureCurrentPosition()
    expect(result).toEqual({ status: 'unavailable' })
  })

  it('erreur web non permission → unavailable', async () => {
    geoMock.getCurrentPosition.mockRejectedValue(new Error('unimplemented'))
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _ok: (p: unknown) => void,
          err: (e: { code: number }) => void,
        ) => err({ code: 2 }), // POSITION_UNAVAILABLE
      },
    })
    const result = await captureCurrentPosition()
    expect(result).toEqual({ status: 'unavailable' })
  })

  it('une précision native absente reste tolérée (accuracy optionnelle)', async () => {
    geoMock.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 5.36, longitude: -4.01 },
      timestamp: 1_700_000_002_000,
    })
    const result = await captureCurrentPosition()
    expect(result.status).toBe('captured')
    if (result.status === 'captured') expect(result.position.accuracy).toBeUndefined()
  })

  it('le natif reçoit une position haute précision avec timeout', async () => {
    geoMock.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 5.36, longitude: -4.01, accuracy: 8 },
      timestamp: 1,
    })
    await captureCurrentPosition()
    const opts = (geoMock.getCurrentPosition.mock.calls[0] as unknown[])[0] as {
      enableHighAccuracy?: boolean
      timeout?: number
    }
    expect(opts).toEqual(expect.objectContaining({ enableHighAccuracy: true, timeout: 10_000 }))
  })
})
