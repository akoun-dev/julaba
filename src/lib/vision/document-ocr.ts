// On-device OCR for identificateur document capture (CNI, registre de
// commerce, etc.) using Tesseract.js. Runs fully client-side in a Web
// Worker — no document image or extracted text ever leaves the device.
//
// Self-hosted (public/): the worker script (~110KB) and the French
// language data (~600KB, "fast" trained model). The Tesseract WASM core
// itself (~2.8MB) stays on tesseract.js's default jsdelivr CDN — same
// self-host-the-small-stuff, CDN-for-the-big-runtime split used for the
// MediaPipe vision WASM in photo-quality.ts, since this app's Capacitor
// shell already requires network to load at all.
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
        gzip: true,
      })
    } catch (err) {
      console.warn('[document-ocr] Worker Tesseract indisponible:', err)
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
 * Best-effort extraction of a Côte d'Ivoire CNI number from OCR'd text
 * (format: CI followed by 9-12 digits, sometimes spaced/dashed).
 */
export function extractCniNumber(text: string): string | null {
  const match = text.match(/C[I1]\s*[-]?\s*(\d[\d\s-]{7,13}\d)/i)
  if (!match) return null
  return `CI${match[1].replace(/[\s-]/g, '')}`
}
