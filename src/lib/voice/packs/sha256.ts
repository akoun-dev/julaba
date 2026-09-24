// SHA-256 incrémental (FIPS 180-4) — pure TS, zéro dépendance.
//
// A11-F03 (AUDIT-011) : le downloader des packs vocaux doit refuser tout
// fichier dont l'empreinte diverge AVANT de considérer le pack « installé »
// (l'état installé vient de la sonde native sur les fichiers disque — un
// fichier corrompu Accepté = crash sherpa exit(), la voie « corrompu » du
// crash corrigé par 32b70a8).
//
// POURQUOI PAS crypto.subtle ? L'API WebCrypto ne sait hasher qu'en UN
// BLOC (digest(byte[])) : lire un fichier de 349 Mo en mémoire juste pour
// le hash déclencherait un OOM sur les appareils d'entrée de gamme ciblés
// par Jùlaba. Le downloader met donc à jour le hash AU FIL du streaming
// (update() par blocs réseau reçus, mémoire constante) et ne compare le
// digest qu'à la fin du téléchargement.

/** Constantes K de FIPS 180-4 §4.2.2 (64 mots de 32 bits). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

/**
 * Hash SHA-256 alimenté par blocs arbitraires (update) puis finalisé
 * (digestHex). digestHex finalise implicitement (padding + longueur) et
 * reste idempotent ; tout update après finalisation est une erreur de
 * programmation (le contrat du downloader hash chaque fichier avec une
 * instance neuve).
 */
export class IncrementalSha256 {
  private readonly h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  private readonly w = new Uint32Array(64)
  private readonly block = new Uint8Array(64)
  private blockLength = 0
  private totalLength = 0
  private finalized = false
  private digestCache: string | null = null

  /** Ingère un bloc de taille quelconque (0 octet = no-op valide). */
  update(data: Uint8Array): this {
    if (this.finalized) {
      throw new Error('SHA-256 déjà finalisé — utilisez une nouvelle instance par fichier')
    }
    if (data.length === 0) return this
    this.totalLength += data.length
    let offset = 0
    // Compléter d'abord le bloc partiel en cours.
    if (this.blockLength > 0) {
      const take = Math.min(64 - this.blockLength, data.length)
      this.block.set(data.subarray(0, take), this.blockLength)
      this.blockLength += take
      offset = take
      if (this.blockLength === 64) {
        this.processBlock(this.block, 0)
        this.blockLength = 0
      }
    }
    // Blocs pleins directement depuis data (copie évitée).
    while (offset + 64 <= data.length) {
      this.processBlock(data, offset)
      offset += 64
    }
    // Reliquat → bloc partiel.
    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0)
      this.blockLength = data.length - offset
    }
    return this
  }

  /** Empreinte hexadécimale (64 caractères) — finalise au premier appel. */
  digestHex(): string {
    if (this.digestCache) return this.digestCache
    if (!this.finalized) {
      // Padding FIPS 180-4 §5.1 : 0x80, zéros, longueur en bits sur 64 bits
      // big-endian — un bloc de fin aligné à 64 octets.
      const bits = this.totalLength * 8
      const bitsHi = Math.floor(bits / 0x100000000)
      const bitsLo = bits % 0x100000000
      const tail = new Uint8Array((this.blockLength < 56 ? 64 : 128) - this.blockLength)
      tail[0] = 0x80
      const view = new DataView(tail.buffer)
      view.setUint32(tail.length - 8, bitsHi)
      view.setUint32(tail.length - 4, bitsLo)
      this.feed(tail)
      this.finalized = true
    }
    let hex = ''
    for (let i = 0; i < 8; i++) {
      hex += this.h[i].toString(16).padStart(8, '0')
    }
    this.digestCache = hex
    return this.digestCache
  }

  /** Identique à update() mais sans le garde de finalisation (padding). */
  private feed(data: Uint8Array): void {
    if (data.length === 0) return
    this.totalLength += data.length
    let offset = 0
    if (this.blockLength > 0) {
      const take = Math.min(64 - this.blockLength, data.length)
      this.block.set(data.subarray(0, take), this.blockLength)
      this.blockLength += take
      offset = take
      if (this.blockLength === 64) {
        this.processBlock(this.block, 0)
        this.blockLength = 0
      }
    }
    while (offset + 64 <= data.length) {
      this.processBlock(data, offset)
      offset += 64
    }
    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0)
      this.blockLength = data.length - offset
    }
  }

  private processBlock(data: Uint8Array, offset: number): void {
    const w = this.w
    for (let i = 0; i < 16; i++) {
      const j = offset + 4 * i
      w[i] =
        ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]
      const y = w[i - 2]
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = this.h[0]
    let b = this.h[1]
    let c = this.h[2]
    let d = this.h[3]
    let e = this.h[4]
    let f = this.h[5]
    let g = this.h[6]
    let h = this.h[7]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    this.h[0] = (this.h[0] + a) >>> 0
    this.h[1] = (this.h[1] + b) >>> 0
    this.h[2] = (this.h[2] + c) >>> 0
    this.h[3] = (this.h[3] + d) >>> 0
    this.h[4] = (this.h[4] + e) >>> 0
    this.h[5] = (this.h[5] + f) >>> 0
    this.h[6] = (this.h[6] + g) >>> 0
    this.h[7] = (this.h[7] + h) >>> 0
  }
}

/** Empreinte SHA-256 d'un ensemble de blocs (one-shot, tests et petits fichiers). */
export function sha256Hex(chunks: readonly Uint8Array[]): string {
  const hash = new IncrementalSha256()
  for (const chunk of chunks) hash.update(chunk)
  return hash.digestHex()
}
