'use client'

/**
 * MODE-901 (§4-5) + MODE-903 (§6) — activation et configuration du Mode
 * Marché. Copies conformes au cahier des charges :
 * - §4 écran d'activation (texte exact + bouton « Activer le Mode Marché ») ;
 * - §5.2 trois modes d'emplacement + liste de marchés + « Autre » libre ;
 * - §6 permission de localisation demandée UNIQUEMENT si « position
 *   actuelle », avec explication simple ; un refus ne bloque JAMAIS.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ShoppingBasket, Check, Loader2, MapPin, ShieldCheck } from 'lucide-react'
import { useMarketModeStore } from '@/lib/market-mode/market-mode-store'
import { captureCurrentPosition } from '@/lib/market-mode/geo'
import { MARKET_OPTIONS, PROVISIONAL_MARKETS, resolveMarketName, type MarketChoice } from '@/lib/market-mode/markets'
import { haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'

type Step = 'intro' | 'config' | 'gps'
type OptionId = 'gps' | 'select' | 'none' | 'autre'

export function MarketModeActivationModal() {
  const activateMarketMode = useMarketModeStore((s) => s.activateMarketMode)
  const setPosition = useMarketModeStore((s) => s.setPosition)
  const markGpsRefused = useMarketModeStore((s) => s.markGpsRefused)
  const markGpsUnavailable = useMarketModeStore((s) => s.markGpsUnavailable)

  const [step, setStep] = useState<Step>('intro')
  const [option, setOption] = useState<OptionId>('select')
  const [marketChoice, setMarketChoice] = useState<MarketChoice>('adjame')
  const [customName, setCustomName] = useState('')
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)

  const finish = (mode: 'gps' | 'select' | 'none', name: string | null) => {
    haptic('success')
    activateMarketMode({ marketName: name, locationMode: mode })
  }

  const handleActivate = () => {
    haptic('light')
    setStep('config')
  }

  const handleOptionChange = (id: OptionId) => {
    setOption(id)
    setGpsNotice(null)
    // §6 — la demande de permission n'arrive qu'au moment utile : quand
    // l'utilisatrice choisit explicitement « Utiliser ma position actuelle ».
    if (id === 'gps') setStep('gps')
  }

  const handleAuthorizeGps = async () => {
    setGpsBusy(true)
    setGpsNotice(null)
    try {
      const result = await captureCurrentPosition()
      if (result.status === 'captured') {
        setPosition(result.position)
        // Position obtenue : on peut finaliser immédiatement.
        finish('gps', null)
        return
      }
      // §6 — refus ou indisponibilité : le Mode Marché continue de
      // fonctionner, la position sera simplement retentée à l'ouverture
      // de la journée. JAMAIS bloquant.
      setGpsNotice(
        result.status === 'refused'
          ? "Position non autorisée. Aucun souci — le Mode Marché fonctionne sans, et vous pourrez autoriser la position plus tard."
          : "Position indisponible pour l'instant. Le Mode Marché fonctionne sans elle.",
      )
      if (result.status === 'refused') markGpsRefused()
      else markGpsUnavailable()
    } finally {
      setGpsBusy(false)
    }
  }

  const canFinish = (): boolean => {
    if (option === 'none') return true
    if (option === 'gps') return true
    if (option === 'select') return resolveMarketName(marketChoice, null) != null
    return resolveMarketName('autre', customName) != null
  }

  const handleFinish = () => {
    if (!canFinish()) return
    if (option === 'none') return finish('none', null)
    if (option === 'gps') return finish('gps', null)
    if (option === 'select') return finish('select', resolveMarketName(marketChoice, null))
    finish('select', resolveMarketName('autre', customName))
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activer le Mode Marché"
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        {step === 'intro' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2D1B0E]">
              <ShoppingBasket className="h-7 w-7 text-[#E8833A]" aria-hidden="true" />
            </div>
            <h2 className="text-center text-xl font-bold text-[#241509]">Activer le Mode Marché</h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-[#5C4A3A]">
              Continuez à gérer votre activité même sans connexion Internet.
            </p>
            <p className="mt-2 text-center text-sm leading-relaxed text-[#5C4A3A]">
              Vos opérations seront enregistrées sur votre téléphone et
              synchronisées automatiquement lorsque la connexion reviendra.
            </p>
            <Button
              className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-b from-[#D2691E] to-[#C05621] text-base font-bold text-white shadow-lg shadow-[#C05621]/30 transition-transform active:scale-[0.98]"
              onClick={handleActivate}
            >
              Activer le Mode Marché
            </Button>
          </>
        )}

        {step === 'config' && (
          <>
            <h2 className="text-lg font-bold text-[#241509]">Où travaillez-vous aujourd&apos;hui ?</h2>
            <p className="mt-1 text-sm text-[#8C7B6B]">
              Vos opérations seront associées à cet emplacement. Vous pouvez changer à tout moment.
            </p>

            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Emplacement du marché">
              {MARKET_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition-colors',
                    option === opt.id
                      ? 'border-[#D2622A] bg-[#FBE3D0]/60'
                      : 'border-[#F0E4D3] bg-white hover:border-[#D2622A]/40',
                  )}
                >
                  <input
                    type="radio"
                    name="market-location"
                    className="mt-0.5 h-4 w-4 accent-[#D2622A]"
                    checked={option === opt.id}
                    onChange={() => handleOptionChange(opt.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#241509]">{opt.label}</span>
                    <span className="block text-xs text-[#8C7B6B]">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {option === 'select' && (
              <div className="mt-3">
                <label htmlFor="market-select" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5C4A3A]">
                  Votre marché
                </label>
                <select
                  id="market-select"
                  value={marketChoice}
                  onChange={(e) => setMarketChoice(e.target.value)}
                  className="h-11 w-full rounded-2xl border-2 border-[#F0E4D3] bg-white px-3 text-sm font-medium text-[#241509] focus:border-[#D2622A] focus:outline-none"
                >
                  {PROVISIONAL_MARKETS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {option === 'autre' && (
              <div className="mt-3">
                <label htmlFor="market-custom" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5C4A3A]">
                  Nom de votre marché
                </label>
                <input
                  id="market-custom"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Ex. Marché de Bouaké"
                  maxLength={120}
                  className="h-11 w-full rounded-2xl border-2 border-[#F0E4D3] bg-white px-3 text-sm font-medium text-[#241509] placeholder:text-[#B3A493] focus:border-[#D2622A] focus:outline-none"
                />
              </div>
            )}

            {gpsNotice && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#FBE3D0]/70 p-3 text-xs text-[#8C7B6B]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C66A2C]" aria-hidden="true" />
                <span>{gpsNotice}</span>
              </div>
            )}

            <Button
              className="mt-5 h-13 w-full rounded-2xl bg-gradient-to-b from-[#D2691E] to-[#C05621] py-3.5 text-base font-bold text-white shadow-lg shadow-[#C05621]/30 transition-transform active:scale-[0.98] disabled:opacity-50"
              disabled={!canFinish()}
              onClick={handleFinish}
            >
              Commencer
            </Button>
          </>
        )}

        {step === 'gps' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBE3D0]">
              <MapPin className="h-6 w-6 text-[#C66A2C]" aria-hidden="true" />
            </div>
            <h2 className="text-center text-lg font-bold text-[#241509]">Autoriser la localisation</h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-[#5C4A3A]">
              Jùlaba peut utiliser votre position pour associer vos opérations
              au lieu où vous travaillez.
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-[#8C7B6B]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#BC5A2E]" aria-hidden="true" />
              Votre position n&apos;est utilisée qu&apos;à l&apos;ouverture de votre journée — jamais en continu.
            </p>

            {gpsNotice && (
              <div className="mt-3 rounded-2xl bg-[#FBE3D0]/70 p-3 text-xs text-[#8C7B6B]">{gpsNotice}</div>
            )}

            <Button
              className="mt-5 h-14 w-full rounded-2xl bg-gradient-to-b from-[#D2691E] to-[#C05621] text-base font-bold text-white shadow-lg shadow-[#C05621]/30 transition-transform active:scale-[0.98]"
              disabled={gpsBusy}
              onClick={() => void handleAuthorizeGps()}
            >
              {gpsBusy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Recherche de la position…
                </>
              ) : (
                'Autoriser'
              )}
            </Button>
            <button
              type="button"
              className="mt-2 w-full rounded-2xl py-2.5 text-sm font-semibold text-[#8C7B6B] transition-colors hover:text-[#5C4A3A]"
              onClick={() => {
                setOption('select')
                setStep('config')
              }}
            >
              Choisir un marché à la place
            </button>
          </>
        )}
      </div>
    </div>
  )
}
