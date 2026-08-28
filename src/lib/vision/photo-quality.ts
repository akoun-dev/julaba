// On-device enrollment photo quality check for identificateur field capture.
// Two independent checks, both best-effort and non-blocking:
//
// 1. Blur detection — pure canvas pixel math (Laplacian variance), no
//    model, no network, always available offline.
// 2. Face presence — MediaPipe FaceDetector (WASM + ~230KB tflite model,
//    self-hosted at /models/blaze_face_short_range.tflite). The WASM
//    runtime itself is loaded from jsdelivr on first use (~12MB, cached by
//    the browser after) rather than committed to the repo — this app
//    already requires network to load its shell (Capacitor "hybrid
//    remote" mode), so this isn't a regression in offline capability.
//
// Neither check should ever block an identificateur from submitting a
// dossier in the field — poor lighting, an old Android camera, or a
// blocked network are all realistic conditions here. Failures degrade to
// "no verdict" rather than an error.
import type { FaceDetector as FaceDetectorType } from '@mediapipe/tasks-vision'

export interface PhotoQualityResult {
  isBlurry: boolean
  blurScore: number
  faceCheckAvailable: boolean
  faceCount: number | null
  warnings: string[]
}

const BLUR_THRESHOLD = 60 // Laplacian variance below this ~= visibly blurry
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
const MODEL_URL = '/models/blaze_face_short_range.tflite'

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Laplacian-variance blur estimate on a downscaled grayscale copy of the
 * image. Cheap enough to run synchronously on every capture.
 */
async function computeBlurScore(dataUrl: string): Promise<number | null> {
  try {
    const img = await loadImage(dataUrl)
    const maxDim = 320
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    const gray = new Float32Array(w * h)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }

    // 3x3 Laplacian kernel convolution, variance of the response.
    let sum = 0
    let sumSq = 0
    let count = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x
        const lap =
          -4 * gray[idx] +
          gray[idx - 1] +
          gray[idx + 1] +
          gray[idx - w] +
          gray[idx + w]
        sum += lap
        sumSq += lap * lap
        count++
      }
    }
    if (count === 0) return null
    const mean = sum / count
    return sumSq / count - mean * mean
  } catch {
    return null
  }
}

let detectorPromise: Promise<FaceDetectorType | null> | null = null

function loadFaceDetector(): Promise<FaceDetectorType | null> {
  if (detectorPromise) return detectorPromise

  detectorPromise = (async () => {
    if (typeof window === 'undefined') return null
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL)
      return await FaceDetector.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      })
    } catch (err) {
      console.warn('[photo-quality] Détecteur de visage indisponible:', err)
      return null
    }
  })()

  return detectorPromise
}

async function detectFaceCount(dataUrl: string): Promise<number | null> {
  try {
    const detector = await loadFaceDetector()
    if (!detector) return null
    const img = await loadImage(dataUrl)
    const result = detector.detect(img)
    return result.detections.length
  } catch (err) {
    console.warn('[photo-quality] Détection de visage échouée:', err)
    return null
  }
}

/**
 * Runs both checks and returns a combined verdict with French warning
 * messages meant to be shown inline, never as a blocking error.
 */
export async function checkEnrollmentPhoto(dataUrl: string): Promise<PhotoQualityResult> {
  const [blurScore, faceCount] = await Promise.all([
    computeBlurScore(dataUrl),
    detectFaceCount(dataUrl),
  ])

  const warnings: string[] = []
  const isBlurry = blurScore !== null && blurScore < BLUR_THRESHOLD
  if (isBlurry) warnings.push('Photo floue, reprenez si possible.')
  if (faceCount === 0) warnings.push('Aucun visage détecté sur la photo.')
  if (faceCount !== null && faceCount > 1) warnings.push('Plusieurs visages détectés, cadrez sur l\'acteur seul.')

  return {
    isBlurry,
    blurScore: blurScore ?? 0,
    faceCheckAvailable: faceCount !== null,
    faceCount,
    warnings,
  }
}
