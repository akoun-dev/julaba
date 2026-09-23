// PIN vocal 4 chiffres (auth par la voix).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

/**
 * Parse voice PIN (exactly 4 digits)
 */
export function parseVoicePin(transcription: string): number[] | null {
  const mapping: Record<string, number> = {
    'zéro': 0, 'zero': 0, 'un': 1, 'une': 1,
    'deux': 2, 'trois': 3, 'quatre': 4,
    'cinq': 5, 'six': 6, 'sept': 7,
    'huit': 8, 'neuf': 9
  }
  
  const chiffres: number[] = []
  const words = transcription.toLowerCase().split(/\s+/)
  
  for (const word of words) {
    if (mapping[word] !== undefined) {
      chiffres.push(mapping[word])
    }
    const num = parseInt(word)
    if (!isNaN(num) && num >= 0 && num <= 9) chiffres.push(num)
  }
  
  return chiffres.length === 4 ? chiffres : null
}
