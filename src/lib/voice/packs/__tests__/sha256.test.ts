import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IncrementalSha256, sha256Hex } from '../sha256'

/**
 * A11-F03 (AUDIT-011) — le downloader des packs vocaux s'appuie sur ce
 * hash incrémental pour refuser tout fichier dont l'empreinte diverge
 * AVANT le marquage « installé ». Une erreur d'implémentation accepterait
 * un modèle corrompu → crash sherpa exit(). Les vecteurs FIPS ancrent la
 * conformité ; la propriété différentielle contre node:crypto couvre les
 * découpages de blocs réels (réseau 512 Ko, reliquats, blocs de 0 octet).
 */

describe('IncrementalSha256 — vecteurs FIPS 180-4', () => {
  it('chaîne vide → e3b0c442…', () => {
    expect(sha256Hex([new Uint8Array(0)])).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('"abc" → ba7816bf…', () => {
    expect(sha256Hex([new TextEncoder().encode('abc')])).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('vecteur deux-blocs (448 bits) → 248d6a61…', () => {
    const msg =
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(sha256Hex([new TextEncoder().encode(msg)])).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })
})

describe('IncrementalSha256 — propriété différentielle vs node:crypto', () => {
  const sizes = [0, 1, 31, 63, 64, 65, 127, 128, 55, 56, 119, 1000, 512 * 1024 + 7]
  const chunkSizes = [1, 7, 64, 555, 512 * 1024] as const

  for (const size of sizes) {
    for (const chunkSize of chunkSizes) {
      it(`taille ${size} octets, blocs de ${chunkSize}`, () => {
        const data = new Uint8Array(randomBytes(size))
        const incremental = new IncrementalSha256()
        for (let offset = 0; offset < size; offset += chunkSize) {
          incremental.update(data.subarray(offset, Math.min(offset + chunkSize, size)))
        }
        const expected = createHash('sha256').update(data).digest('hex')
        expect(incremental.digestHex()).toBe(expected)
      })
    }
  }

  it('update après digestHex est rejeté (contrat instance-par-fichier)', () => {
    const hash = new IncrementalSha256()
    hash.update(new Uint8Array([1, 2, 3]))
    hash.digestHex()
    expect(() => hash.update(new Uint8Array([4]))).toThrow(/finalisé/i)
  })
})
