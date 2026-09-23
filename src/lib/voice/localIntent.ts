// Jùlaba Voice Intent Parser — support français de marché, nouchi léger, oral
// abbreviations. Orchestrateur (DET-001 tranche 8, MODE-994) : l'ancien
// monolithe (1070 lignes) vit dans src/lib/voice/intent/ (types, nombres,
// quantités+unités, produits, déclencheurs, PIN, transcript, parse-intent,
// clarify). Cette façade ré-exporte l'intégralité de l'API publique — tous
// les consommateurs (voice-modal, confirmations, prodIntent, routes API,
// tests) restent inchangés. Preuves : scripts/mode994_intent_split.py.

export type { IntentType, ParsedIntent } from './intent/types'
export { TATA_GOODBYE } from './intent/types'
export { parseFrenchNumber, extractAmount } from './intent/numbers'
export type { QuantityWithUnit } from './intent/quantities'
export { extractQuantity, extractQuantityWithUnit } from './intent/quantities'
export { extractProduct, searchProducts, getAllProducts } from './intent/products'
export { parseVoicePin } from './intent/pin'
export { parseIntent } from './intent/parse-intent'
export { buildClarifyingIntent } from './intent/clarify'

/**
 * Format amount as FCFA string — SOURCE UNIQUE déplacée vers
 * src/lib/utils.ts (NORM-304) ; ce ré-export préserve tous les imports
 * existants des écrans marchands (le comportement est identique).
 */
import { formatFCFA } from '@/lib/utils'
export { formatFCFA }
