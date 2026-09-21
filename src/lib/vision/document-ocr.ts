// On-device OCR for identificateur document capture (CNI, registre de
// commerce, etc.) using Tesseract.js. Runs fully client-side in a Web
// Worker — no document image or extracted text ever leaves the device.
//
// Self-hosted (public/): worker, French language data and Tesseract WASM
// core. The core is copied from tesseract.js-core by `bun run prepare:ocr`
// before development and production builds. OCR must not need a CDN once
// the native application is open.
//
// Best-effort: any failure (worker spawn, model download, recognition
// error) resolves to null rather than throwing — OCR here is a
// convenience prefill for the identificateur, never a blocker to
// attaching the raw document photo.
import type { Worker as TesseractWorker } from 'tesseract.js'

export interface OcrResult {
  text: string
  confidence: number
}

let workerPromise: Promise<TesseractWorker | null> | null = null

function getWorker(): Promise<TesseractWorker | null> {
  if (workerPromise) return workerPromise

  workerPromise = (async () => {
    if (typeof window === 'undefined') return null
    try {
      const { createWorker } = await import('tesseract.js')
      return await createWorker('fra', 1, {
        workerPath: '/tesseract/worker.min.js',
        langPath: '/tessdata',
        corePath: '/tesseract/core',
        gzip: true,
      })
    } catch (err) {
      console.warn('[document-ocr] Worker Tesseract indisponible:', err)
      // A transient load failure (for example, a just-restored connection)
      // must not make the visible “Analyser à nouveau” action permanently
      // ineffective for the rest of the enrollment session.
      workerPromise = null
      return null
    }
  })()

  return workerPromise
}

/**
 * Extracts text from a captured document image (data URL or Blob).
 * Returns null on any failure — callers should treat OCR as an optional
 * prefill, not a requirement.
 */
export async function extractDocumentText(image: string | Blob): Promise<OcrResult | null> {
  try {
    const worker = await getWorker()
    if (!worker) return null
    const { data } = await worker.recognize(image)
    const text = data.text.trim()
    if (!text) return null
    return { text, confidence: data.confidence }
  } catch (err) {
    console.warn('[document-ocr] Reconnaissance échouée:', err)
    return null
  }
}

/**
 * Extracts a Côte d'Ivoire CNI number from OCR'd text
 * (format: CI followed by 9-12 digits, sometimes spaced/dashed).
 */
export function extractCniNumber(text: string): string | null {
  const match = text.match(/C[I1]\s*[-]?\s*(\d[\d\s-]{7,13}\d)/i)
  if (!match) return null
  return `CI${match[1].replace(/[\s-]/g, '')}`
}

export interface CniFields {
  lastName?: string
  firstName?: string
  sexe?: 'masculin' | 'feminin'
  cniNumero?: string
  nni?: string
}

// Names on a CNI are printed in caps (sometimes OCR'd with a trailing
// punctuation or a stray digit). Keep letters, spaces, apostrophes and
// hyphens; require at least 2 letters so stray tokens don't match.
const NAME_VALUE = "[A-ZÀÁÂÄÉÈÊËÍÎÏÓÔÖÙÚÛÜÇ' -]{2,40}"

function cleanName(raw: string): string | undefined {
  const value = raw
    .replace(/\d/g, '')
    .replace(/[^A-ZÀÁÂÄÉÈÊËÍÎÏÓÔÖÙÚÛÜÇa-zà-ÿ' -]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (value.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) return undefined
  // "KONE AWA" printed all-caps reads back all-caps; display in title case
  // (Kone) but keep compound forms ("Kone-Bamba", "Dje Kofi").
  return value
    .toLowerCase()
    .split(' ')
    .map((part) =>
      part
        .split('-')
        .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
        .join('-')
    )
    .join(' ')
}

/**
 * Best-effort parsing of a Côte d'Ivoire CNI from raw OCR text, handling
 * both the classic layout (labeled "NOM :", "PRENOMS :", "SEXE :", "NNI :")
 * and the numbered one ("1. NOM", "2. PRENOMS", "3. SEXE", "5. NNI").
 * Every field is optional — partial reads are fine, the wizard lets the
 * agent correct or complete everything by hand.
 */
export function parseCniFields(text: string): CniFields {
  const fields: CniFields = {}
  if (!text) return fields

  // --- Nom : ligne "NOM ..." (écarte "NOM DE JEUNE FILLE", "NOM D'USAGE"
  // reste acceptable, et surtout "PRENOM" qui contient "NOM"). On matche
  // "NOM" en début de ligne (numérotation optionnelle) suivi de la valeur.
  const lastNameMatch =
    text.match(new RegExp(`(?:^|\\n)\\s*(?:1\\s*[).:\\-]?\\s*)?NOM(?!.*PRE)(?:\\s*DE\\s*FAMILLE)?\\s*[:.\\-]?\\s*(${NAME_VALUE})`, 'i')) ||
    text.match(new RegExp(`(?:^|\\n)\\s*NOM\\s*[:.\\-]?\\s*(${NAME_VALUE})`, 'i'))
  if (lastNameMatch) fields.lastName = cleanName(lastNameMatch[1])

  // --- Prénom(s) : "PRENOM(S)" avec ou sans accent, valeur jusqu'à la fin
  // de ligne (les CNI listent souvent plusieurs prénoms).
  const firstNameMatch = text.match(
    new RegExp(`PR(?:É|E)NOMS?\\s*[:.\\-]?\\s*(${NAME_VALUE}(?:\\s+${NAME_VALUE})*)`, 'i')
  )
  if (firstNameMatch) {
    const value = firstNameMatch[1].trim()
    if (value.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2) {
      // Plusieurs prénoms → on ne garde que le premier (le champ dossier
      // est un prénom simple, "Awa" et non "Awa Fatoumata K.").
      fields.firstName = cleanName(value.split(/\s{2,}|\s(?=[A-ZÀ-ÿ]{2,}\b)/)[0] || value)
    }
  }

  // --- Sexe : "SEXE : F", "SEXE M", ou libellé complet MASCULIN/FEMININ.
  const sexeMatch = text.match(/SEXE\s*[:.\-]?\s*(MASCULIN|F[ÉE]MININ|M|F)\b/i)
  if (sexeMatch) fields.sexe = sexeMatch[1].toUpperCase().startsWith('M') ? 'masculin' : 'feminin'

  // --- NNI : étiquette explicite d'abord (10 chiffres), sinon le premier
  // nombre isolé de 10 chiffres du texte (le NNI ivoirien en a 10).
  const nniLabeled = text.match(/N\.?\s?N\.?\s?I\.?\s*[:.\-]?\s*(\d{10})\b/i)
  const nniBare = text.match(/(?:^|[^:\d])(\d{10})(?:[^:\d]|$)/)
  const nni = nniLabeled?.[1] ?? nniBare?.[1]
  if (nni) fields.nni = nni

  // --- N° CNI : "CI" + 9-12 chiffres (recto ou verso).
  fields.cniNumero = extractCniNumber(text) ?? undefined

  return fields
}
