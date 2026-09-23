// Questions de clarification (fallback ML nlu-ml — classifier sans entités).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import type { IntentType, ParsedIntent } from './types'

/**
 * Build a clarifying-question intent from a coarse ML type guess (see
 * nlu-ml.ts) when the regex parser found no entities at all. The ML
 * fallback only classifies *which kind* of utterance this is — it can't
 * extract amount/product/quantity — so instead of guessing further we ask
 * a targeted follow-up instead of the generic "je n'ai pas compris".
 */
export function buildClarifyingIntent(type: IntentType, transcript: string, confidence: number): ParsedIntent {
  const prompts: Partial<Record<IntentType, string>> = {
    sale: 'Vous voulez enregistrer une vente ? Dites le produit et le prix, par exemple "tomates 2000 francs".',
    expense: 'Vous voulez enregistrer une dépense ? Dites le montant, par exemple "dépensé 1000 francs transport".',
    restock: 'Vous voulez signaler un stock reçu ? Dites le produit et la quantité.',
    order: 'Que voulez-vous commander ? Dites par exemple « commander deux sacs de riz ».',
    navigation: 'Où voulez-vous aller ? Par exemple "ma caisse" ou "mes ventes".',
    consultation: 'Quel total voulez-vous consulter ?',
  }
  const responseText = prompts[type] ?? 'Je n\'ai pas bien compris. Pouvez-vous répéter ?'
  return {
    type: 'unknown',
    confidence,
    rawTranscript: transcript,
    responseText,
  }
}
