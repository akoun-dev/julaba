import { haptic, playBeep, tataSpeak, tataStop } from './tata-tts'

/**
 * Feedback audio canonique des parcours vocaux Marchand/Producteur.
 * Les bips et vibrations restent locaux et la parole est centralisée par
 * tataSpeak, qui annule l'ancienne narration avant la suivante.
 */
export function voiceListeningStart(): void {
  tataStop()
  playBeep('start')
  haptic('light')
}

export function voiceListeningStop(): void {
  playBeep('stop')
  haptic('light')
}

export function voiceSuccess(message: string): void {
  playBeep('success')
  haptic('success')
  tataSpeak(message)
}

export function voiceError(message: string): void {
  playBeep('error')
  haptic('error')
  tataSpeak(message)
}

export function voiceOffline(message = 'Vous êtes hors connexion. Votre action reste disponible sur le téléphone si elle peut être enregistrée hors ligne.'): void {
  playBeep('error')
  haptic('error')
  tataSpeak(message)
}

export function voiceProcessingStop(): void {
  tataStop()
}
