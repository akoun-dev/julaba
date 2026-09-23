import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { sousVerrouVente, venteEnCours } from '../sale-lock'

// MODE-988 (audit Freebuff F-01) — verrou anti double-soumission de la
// vente caisse : la 2e invocation pendant le `await fetch` lève AVANT de
// générer un clientId neuf (l'idempotence client_id ne peut rien contre
// deux ids neufs). Le verrou est TOUJOURS libéré au finally, même en
// cas d'échec de la vente.

describe('sousVerrouVente — verrou anti double-soumission (MODE-988, F-01)', () => {
  beforeEach(() => {
    expect(venteEnCours()).toBe(false) // hygiène inter-tests : verrou libre
  })

  afterEach(() => {
    expect(venteEnCours()).toBe(false) // libéré dans tous les scénarios
  })

  it('un appel seul s\'exécute et retourne son résultat, verrou libéré ensuite', async () => {
    const result = await sousVerrouVente(async () => 'vente-ok')
    expect(result).toBe('vente-ok')
  })

  it('un second appel PENDANT le traitement lève SALE_IN_PROGRESS immédiatement', async () => {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })

    const first = sousVerrouVente(async () => {
      await barrier
      return 1
    })

    // Le premier appel a pris le verrou (synchrone avant son await).
    expect(venteEnCours()).toBe(true)

    // Le second tap est refusé SANS attendre la fin du premier.
    await expect(sousVerrouVente(async () => 2)).rejects.toThrow('SALE_IN_PROGRESS')

    release()
    await expect(first).resolves.toBe(1)
  })

  it('le verrou est LIBÉRÉ quand l\'opération échoue (finally)', async () => {
    await expect(
      sousVerrouVente(async () => {
        throw new Error('réseau coupé')
      }),
    ).rejects.toThrow('réseau coupé')

    // L'échec de la vente n'a pas laissé le verrou pris pour toujours.
    await expect(sousVerrouVente(async () => 'retry')).resolves.toBe('retry')
  })

  it('les deux taps simultanés d\'un double-clic : un seul passe, l\'autre lève', async () => {
    let resolveFirst!: () => void
    const gate = new Promise<void>((resolve) => { resolveFirst = resolve })

    const tap1 = sousVerrouVente(async () => {
      await gate
      return 'première'
    })
    const tap2 = sousVerrouVente(async () => 'deuxième')

    await expect(tap2).rejects.toThrow('SALE_IN_PROGRESS')
    resolveFirst()
    await expect(tap1).resolves.toBe('première')
  })
})
