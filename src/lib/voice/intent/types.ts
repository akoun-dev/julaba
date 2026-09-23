// Jùlaba Voice Intent Parser — types publics et goodbye Tata.
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

export type IntentType =
  | 'sale'
  | 'expense'
  | 'restock'
  | 'order'
  | 'stock_check'
  | 'stock_loss'
  | 'stock_adjust'
  | 'stock_production'
  | 'margin_check'
  | 'purchase'
  | 'navigation'
  | 'back'
  | 'consultation'
  | 'credit_block'
  // MODE-906 (§21-22) — crédit clients à la voix : « <nom> me doit <montant> »
  // (nouvelle dette) et « <nom> m'a payé <montant> » (remboursement).
  | 'credit_doit'
  | 'credit_paye'
  | 'loyalty_balance'
  | 'loyalty_rewards'
  | 'loyalty_level'
  // MODE-909 (§28) — annulation de vente à la voix : « annule la dernière
  // vente », « annule la vente ». OPÉRATION INVERSE append-only — jamais
  // une suppression ; la confirmation orale reste côté voice-modal.
  | 'annule_vente'
  | 'auth_name'
  | 'auth_pin'
  | 'yes'
  | 'no'
  | 'cancel'
  | 'end'
  | 'unknown'

/**
 * Formule de fin de conversation (VOCAL-607) : Tata ne dit JAMAIS
 * « bonne journée » après une action réussie (vente, dépense, consultation…)
 * — la marchande peut enchaîner. Cette phrase n'est prononcée que lorsque
 * l'intent 'end' (ou une sortie explicite non/stop) clôt l'échange.
 */
export const TATA_GOODBYE = "D'accord, à bientôt et bonne journée !"

export interface ParsedIntent {
  type: IntentType
  confidence: number
  product?: string
  amount?: number
  quantity?: number
  /** Code canonique de l'unité orale (STK-807 : « 2 sacs » → 'sac',
   * « 1,5 kilo » → 'kg') — résolu via le catalogue units.ts. */
  unit?: string
  unitPrice?: number
  category?: string
  description?: string
  /** Client nommé d'une intent de crédit (credit_doit / credit_paye). */
  client?: string
  targetRoute?: string
  supplier?: string
  rawTranscript: string
  responseText: string
}
