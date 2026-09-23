// Normalisation du transcript (wake-words Tata/Julaba, remplissage, apostrophes).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

/**
 * Main intent parser - analyzes voice transcript and returns structured intent
 */
export function normalizeVoiceTranscript(transcript: string): string {
  let text = transcript
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  // Défense en profondeur : le parseur peut aussi être appelé sans passer
  // par WakeWordManager (bouton micro, test, reprise offline). Dans ce cas,
  // Tata/Julaba et les mots de remplissage ne doivent pas masquer l'intent.
  text = text
    .replace(/^\s*(?:assistant|madame)\s+/iu, '')
    .replace(/^\s*(?:tata+|tatah+|ta[\s'-]*ta|t[\s'-]*ata|t['’]ata|julaba|djulaba|jula[\s'-]*ba|jou[\s'-]*laba)(?:[\s,;:!?-]+|$)/iu, '')
    .replace(/^(?:eh|hé|hey|bonjour|dis|dites|s['’]il te plaît|stp|svp|please)\s+/iu, '')
    .trim()
  return text
}
