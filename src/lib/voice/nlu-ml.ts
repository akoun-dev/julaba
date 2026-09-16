// Niveau 2 NLU: zero-shot ML fallback for utterances the regex parser in
// localIntent.ts can't classify at all ('unknown'). Runs entirely on-device
// via transformers.js (WASM/ONNX Runtime) — no server call, no API key.
//
// This only ever runs *after* the regex parser has already failed, so a
// missing/undownloaded model or an offline first run must degrade silently
// back to the existing "Je n'ai pas bien compris" behavior, never throw.
//
// Model: Xenova/distilbert-base-uncased-mnli, trained on English MNLI.
// Zero-shot NLI classifiers have some cross-lingual transfer but are
// noticeably weaker on French than on English; treat this as a coarse
// "which of these 5 buckets" signal, not a replacement for the regex
// parser's entity extraction (amount/product/quantity still come from
// localIntent.ts's own patterns). Swap in a multilingual NLI checkpoint
// here if one becomes available on the Xenova/HF hub.
import type { IntentType } from './localIntent'

type ZeroShotPipeline = (
  text: string,
  labels: string[]
) => Promise<{ labels: string[]; scores: number[] }>

const CANDIDATE_LABELS: { label: string; type: IntentType }[] = [
  { label: 'vente d\'un produit', type: 'sale' },
  { label: 'dépense ou achat', type: 'expense' },
  { label: 'réception de nouveau stock', type: 'restock' },
  { label: 'commander un produit chez le fournisseur', type: 'order' },
  { label: 'navigation vers un écran de l\'application', type: 'navigation' },
  { label: 'consultation d\'un résumé ou d\'un total', type: 'consultation' },
]

let pipelinePromise: Promise<ZeroShotPipeline | null> | null = null

function loadPipeline(): Promise<ZeroShotPipeline | null> {
  if (pipelinePromise) return pipelinePromise

  pipelinePromise = (async () => {
    if (typeof window === 'undefined') return null
    try {
      const { pipeline, env } = await import('@xenova/transformers')
      // Browser only: never look for local model files on a server filesystem.
      env.allowLocalModels = false
      const classifier = await pipeline(
        'zero-shot-classification',
        'Xenova/distilbert-base-uncased-mnli',
        { quantized: true }
      )
      return classifier as unknown as ZeroShotPipeline
    } catch (err) {
      console.warn('[nlu-ml] Modèle ML indisponible, fallback régle uniquement:', err)
      return null
    }
  })()

  return pipelinePromise
}

export interface MlIntentGuess {
  type: IntentType
  confidence: number
}

/**
 * Best-effort ML classification of an utterance the regex parser couldn't
 * handle. Returns null on any failure (offline, model not cached yet,
 * WASM unsupported, timeout) — callers must keep their existing
 * "je n'ai pas compris" path as the fallback of the fallback.
 */
export async function classifyIntentFallback(
  transcript: string,
  timeoutMs = 4000
): Promise<MlIntentGuess | null> {
  try {
    const classifier = await loadPipeline()
    if (!classifier) return null

    const result = await Promise.race([
      classifier(
        transcript,
        CANDIDATE_LABELS.map((c) => c.label)
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!result) return null

    const topLabel = result.labels[0]
    const topScore = result.scores[0]
    const match = CANDIDATE_LABELS.find((c) => c.label === topLabel)
    if (!match) return null

    return { type: match.type, confidence: topScore }
  } catch (err) {
    console.warn('[nlu-ml] Classification échouée:', err)
    return null
  }
}

/**
 * Whether the ML fallback is worth prompting the user with: a clear top
 * label and no ambiguity with a close second guess.
 */
export function isConfidentGuess(guess: MlIntentGuess): boolean {
  return guess.confidence >= 0.55
}
