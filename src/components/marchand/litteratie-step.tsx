'use client'

/**
 * Étape d'onboarding « Savez-vous lire et écrire ? » — réponse VOCALE.
 *
 * Principe produit (demande explicite) : le micro s'active AUTOMATIQUEMENT
 * pour recueillir la réponse parmi « Oui », « Non », « Un peu », puis une
 * logique de guidage adaptée (guidanceLitteratie) oriente vers l'étape
 * suivante (Mode Soleil, guidage vocal renforcé).
 *
 * Contraintes d'ingénierie respectées :
 *  - ON N'ÉCOUTE JAMAIS PENDANT QUE TATA PARLE : l'ASR capterait sa propre
 *    voix. L'écoute s'arme donc à la FIN de la narration de la question
 *    (détection true→false de la prop `narrationEnCours`), ou après un court
 *    délai si aucune narration n'a lieu (voix coupée, blocage autoplay).
 *  - L'utilisateur n'est JAMAIS bloqué : trois gros boutons tactiles
 *    (Oui / Un peu / Non) servent de repli si le micro échoue, plus un
 *    bouton « Réessayer » après une erreur ou une réponse non comprise.
 *  - Pas de spinner : l'écoute animée suit le pattern contractuel du bouton
 *    micro (#D2622A + ring-4 + animate-pulse).
 *  - La réponse est mémorisée dans app-store (`litteratieNiveau`, persisté)
 *    pour que le profilage d'aide survive à l'onboarding.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Check, RotateCcw, Volume2 } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { startSmartSingleShotSTT, describeSTTError, type STTSession } from '@/lib/voice/stt-factory'
import { tataSpeakWeb, tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
import {
  parseLitteratieReponse,
  guidanceLitteratie,
  type LitteratieNiveau,
  type GuidanceLitteratie,
} from '@/lib/litteratie'

type EtatEcoute = 'attente' | 'active' | 'fini'

const OPTIONS: { niveau: LitteratieNiveau; libelle: string }[] = [
  { niveau: 'oui', libelle: 'Oui' },
  { niveau: 'un_peu', libelle: 'Un peu' },
  { niveau: 'non', libelle: 'Non' },
]

/** Garde-fou : si rien n'est entendu après 15 s, on rend la main (boutons). */
const DELAI_SILENCE_MS = 15_000
/** Délai d'armement quand aucune narration n'est attendue (voix coupée). */
const DELAI_ARMEMENT_MS = 600

export function LitteratieStep({ narrationEnCours }: { narrationEnCours: boolean }) {
  const setLitteratieNiveau = useAppStore((s) => s.setLitteratieNiveau)
  const toggleSoleil = useAppStore((s) => s.toggleSoleil)
  const toggleVoice = useAppStore((s) => s.toggleVoice)

  const [ecoute, setEcoute] = useState<EtatEcoute>('attente')
  const [entendu, setEntendu] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [reponse, setReponse] = useState<LitteratieNiveau | null>(null)
  const [guidage, setGuidage] = useState<GuidanceLitteratie | null>(null)

  // Refs miroir pour les callbacks STT (créés une seule fois — cf. pattern
  // startListeningRef de voice-modal : les closures ne vieillissent pas).
  const monteRef = useRef(true)
  const ecouteRef = useRef<EtatEcoute>('attente')
  const reponseRef = useRef<LitteratieNiveau | null>(null)
  const narrationPrecedenteRef = useRef(narrationEnCours)
  const narrationRef = useRef(narrationEnCours)
  const sessionRef = useRef<STTSession | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const traiterTranscriptRef = useRef<(transcript: string) => void>(() => {})

  const poserEtat = useCallback((e: EtatEcoute) => {
    ecouteRef.current = e
    if (monteRef.current) setEcoute(e)
  }, [])

  const arreterSilence = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  /** Applique la réponse (voix OU toucher) : mémoire + guidage adapté. */
  const appliquerReponse = useCallback(
    (niveau: LitteratieNiveau) => {
      // Couper l'écoute AVANT de parler le guidage (l'ASR capterait sinon
      // la voix de Tata elle-même).
      arreterSilence()
      sessionRef.current?.abort()
      sessionRef.current = null
      reponseRef.current = niveau
      poserEtat('fini')
      setErreur(null)
      setReponse(niveau)
      setLitteratieNiveau(niveau)

      const g = guidanceLitteratie(niveau)
      setGuidage(g)
      playBeep('success')
      haptic('success')

      // Guidage adapté — Mode Soleil pour « un peu » et « non » (texte plus
      // grand, contraste renforcé). Réversible dans Profil.
      if (g.soleil && !useAppStore.getState().soleilMode) toggleSoleil()

      // Le guidage est parlé seulement si la voix est active ; sinon il
      // reste affiché et un bouton dédié propose d'activer la voix.
      if (useAppStore.getState().voiceEnabled) {
        window.setTimeout(() => {
          if (!monteRef.current) return
          tataStop()
          tataSpeakWeb(g.message)
        }, 350)
      }
    },
    [arreterSilence, poserEtat, setLitteratieNiveau, toggleSoleil],
  )

  const appliquerReponseRef = useRef(appliquerReponse)
  useEffect(() => { appliquerReponseRef.current = appliquerReponse }, [appliquerReponse])

  /** Analyse un transcript vocal : réponse reconnue ou invitation à réessayer. */
  const traiterTranscript = useCallback(
    (transcript: string) => {
      arreterSilence()
      if (!monteRef.current) return
      setEntendu(transcript)
      const niveau = parseLitteratieReponse(transcript)
      if (!niveau) {
        poserEtat('fini')
        setErreur(
          'Je n\'ai pas bien compris. Dites « Oui », « Non » ou « Un peu », ou touchez votre réponse.',
        )
        return
      }
      appliquerReponseRef.current(niveau)
    },
    [arreterSilence, poserEtat],
  )

  useEffect(() => { traiterTranscriptRef.current = traiterTranscript }, [traiterTranscript])

  /** Démarre une session STT single-shot (fr) — jamais en double. */
  const demarrerEcoute = useCallback(() => {
    if (reponseRef.current) return
    if (ecouteRef.current === 'active') return
    sessionRef.current?.abort()
    sessionRef.current = null

    poserEtat('active')
    setErreur(null)
    setEntendu(null)

    silenceTimerRef.current = window.setTimeout(() => {
      // Rien entendu en 15 s : abort → onEnd rend la main (boutons visibles).
      sessionRef.current?.abort()
    }, DELAI_SILENCE_MS)

    sessionRef.current = startSmartSingleShotSTT(
      {
        onResult: (r) => {
          if (!r.isFinal || !r.transcript) return
          traiterTranscriptRef.current(r.transcript)
        },
        onError: (e) => {
          if (!monteRef.current) return
          arreterSilence()
          poserEtat('fini')
          setErreur(describeSTTError(e))
        },
        onEnd: () => {
          if (!monteRef.current) return
          arreterSilence()
          if (ecouteRef.current === 'active') poserEtat('fini')
          // Sortie silencieuse (no-speech) sans erreur ni résultat :
          // inviter explicitement à réessayer ou toucher une réponse.
          if (!reponseRef.current) {
            setErreur((prev) => prev ?? "Je n'ai rien entendu. Réessayez, ou touchez votre réponse.")
          }
        },
      },
      { lang: 'fr' },
    )
  }, [arreterSilence, poserEtat])

  /**
   * Armement automatique du micro.
   *  1) au mount : si la narration n'a pas démarré après DELAI_ARMEMENT_MS
   *     (voix coupée / narration bloquée), on démarre l'écoute directement ;
   *  2) sinon : l'écoute démarre à la FIN de la narration (true→false) —
   *     jamais pendant (l'ASR capterait la voix de Tata).
   *  3) après une réponse donnée, plus aucune écoute automatique.
   */
  useEffect(() => {
    narrationRef.current = narrationEnCours
    const prev = narrationPrecedenteRef.current
    narrationPrecedenteRef.current = narrationEnCours
    if (prev === true && narrationEnCours === false) demarrerEcoute()
  }, [narrationEnCours, demarrerEcoute])

  useEffect(() => {
    monteRef.current = true
    const timer = window.setTimeout(() => {
      if (!narrationRef.current) demarrerEcoute()
    }, DELAI_ARMEMENT_MS)
    return () => {
      window.clearTimeout(timer)
      monteRef.current = false
      // Quitter l'étape (Suivant, Retour, dots, skip) : couper TOUT.
      arreterSilence()
      sessionRef.current?.abort()
      sessionRef.current = null
      try { tataStop() } catch { /* safe */ }
    }
    // Mount/démontage de l'étape uniquement — tout accès d'état passe par refs.
  }, [])

  const reessayer = () => {
    if (reponseRef.current) return
    playBeep('start')
    haptic('light')
    poserEtat('attente')
    setErreur(null)
    setEntendu(null)
    demarrerEcoute()
  }

  const repondreAuToucher = (niveau: LitteratieNiveau) => {
    if (reponseRef.current) return
    appliquerReponse(niveau)
  }

  const reponseLibelle = reponse ? OPTIONS.find((o) => o.niveau === reponse)?.libelle : null

  return (
    <div className="mt-4 rounded-2xl border border-[#C66A2C]/15 bg-white/60 p-4 space-y-3">
      {/* Indicateur d'écoute / résultat reconnu */}
      {ecoute === 'active' && (
        <div className="flex items-center justify-center gap-3" role="status" aria-live="polite">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D2622A] shadow-md ring-4 ring-[#D2622A]/30 animate-pulse"
          >
            <Mic className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#C66A2C]">Je vous écoute...</p>
            <p className="text-xs text-muted-foreground">Dites « Oui », « Non » ou « Un peu »</p>
          </div>
        </div>
      )}

      {ecoute === 'fini' && reponse && (
        <p className="text-sm font-medium text-[#16A34A] flex items-center justify-center gap-1.5" role="status" aria-live="polite">
          <Check className="w-4 h-4" />
          J&apos;ai entendu : {reponseLibelle}
        </p>
      )}

      {/* Transcript non compris — montré tel quel pour la transparence */}
      {ecoute === 'fini' && erreur && entendu && !reponse && (
        <p className="text-xs italic text-muted-foreground text-center">
          Vous avez dit : « {entendu} »
        </p>
      )}

      {erreur && (
        <p className="text-xs text-destructive text-center" role="alert">{erreur}</p>
      )}

      {/* Réponses — au toucher (repli du micro, jamais de blocage) */}
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ niveau, libelle }) => {
          const choisi = reponse === niveau
          return (
            <button
              key={niveau}
              type="button"
              onClick={() => repondreAuToucher(niveau)}
              className={`min-h-12 rounded-xl border px-2 text-base font-semibold transition-colors ${
                choisi
                  ? 'border-[#C66A2C] bg-[#C66A2C] text-white shadow-md'
                  : 'border-[#C66A2C]/30 bg-card text-[#C66A2C] hover:bg-[#C66A2C]/10'
              }`}
              aria-pressed={choisi}
            >
              {libelle}
            </button>
          )
        })}
      </div>

      {/* Réessayer après échec / réponse non comprise */}
      {ecoute === 'fini' && erreur && !reponse && (
        <button
          type="button"
          onClick={reessayer}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-[#C66A2C] hover:text-[#B55D25] transition-colors py-1"
        >
          <RotateCcw className="w-4 h-4" />
          Réessayer le micro
        </button>
      )}

      {/* Guidage adapté — lu par Tata si la voix est active, sinon affiché */}
      {guidage && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-foreground leading-relaxed text-center">{guidage.message}</p>
          {guidage.proposerVoix && !useAppStore.getState().voiceEnabled && (
            <button
              type="button"
              onClick={toggleVoice}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-[#C66A2C] hover:text-[#B55D25] transition-colors py-1"
            >
              <Volume2 className="w-4 h-4" />
              Activer la voix de Tata
            </button>
          )}
        </div>
      )}
    </div>
  )
}
