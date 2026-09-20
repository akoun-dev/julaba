import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { useAppStore } from '@/lib/stores/app-store'
import { rateLitteratie } from '@/lib/litteratie'

/**
 * Retour vocal + haptique canonique des actions métier de l'espace PRODUCTEUR
 * (audit UI-MP-004 ; WF4 « jamais d'écriture silencieuse »).
 *
 * Avant ce helper, les écrans producteur écrivaient leurs mutations
 * (commandes, récoltes, carnet de champ) sans AUCUN retour oral ni vibration :
 * l'utilisateur peu lettré n'avait aucun accusé que son action avait été
 * prise en compte, alors que la navigation producteur est déjà narrée
 * (page.tsx). Chaque mutation doit appeler ce helper APRÈS son verdict.
 *
 * Les libellés suivent le registre « Voice Copy » de la référence design
 * (phrase courte, objet nommé, résultat annoncé).
 *
 * MODE-930 (dictée assistée) — le débit suit le niveau de littératie
 * recueilli à l'onboarding : ralenti pour « un peu » / « non », inchangé
 * pour « oui » (la base reste le débit choisi par l'utilisateur).
 */
export function announceProducteurAction(
  text: string,
  kind: 'success' | 'error' | 'medium' | 'light' = 'success',
): void {
  const { voiceRate, litteratieNiveau } = useAppStore.getState()
  tataSpeak(text, undefined, rateLitteratie(voiceRate, litteratieNiveau))
  haptic(kind)
}
