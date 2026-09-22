"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Étape 1 du wizard d'enrôlement : CNI recto/verso + OCR sur l'appareil.
import React from 'react'
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import {
  StepHero,
  CniSlot,
  SectionTitle,
  IDENT_COLOR,
} from './parts'

import type { Dossier } from '@/lib/stores/identificateur-store'

interface StepCniProps {
  dossier: Dossier
  captureCniSide: (side: 'cniRecto' | 'cniVerso') => void
  removeCniSide: (side: 'cniRecto' | 'cniVerso') => void
  handleCniFile: (side: 'cniRecto' | 'cniVerso') => (e: React.ChangeEvent<HTMLInputElement>) => void
  cniRectoInputRef: React.RefObject<HTMLInputElement | null>
  cniVersoInputRef: React.RefObject<HTMLInputElement | null>
  ocrStatus: 'idle' | 'analyzing' | 'success' | 'failure'
  runCniOcr: (recto?: string, verso?: string) => Promise<void>
  goNext: () => void
  identDarkMode: boolean
  soleilMode: boolean
}

export function StepCni({ dossier, captureCniSide, removeCniSide, handleCniFile, cniRectoInputRef, cniVersoInputRef, ocrStatus, runCniOcr, goNext, identDarkMode, soleilMode }: StepCniProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  return (
            <div className="space-y-5">
              <StepHero
                step={1}
                icon={<CreditCard className="size-5" />}
                title="Pièce d'identité (CNI)"
              description="Scannez le recto de la CNI pour pré-remplir le dossier. Ajoutez le verso si nécessaire : tout reste modifiable."
              />

              {/* ---- Scan recto & verso ---- */}
              <section>
                <SectionTitle icon={<CreditCard className="size-4" />} title="SCAN CNI — RECTO & VERSO" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <CniSlot
                    label="Recto"
                    image={dossier.cniRecto}
                    onCapture={() => captureCniSide('cniRecto')}
                    onRemove={() => removeCniSide('cniRecto')}
                  />
                  <CniSlot
                    label="Verso"
                    image={dossier.cniVerso}
                    onCapture={() => captureCniSide('cniVerso')}
                    onRemove={() => removeCniSide('cniVerso')}
                  />
                </div>
                <input ref={cniRectoInputRef} type="file" accept="image/*" capture="environment" onChange={handleCniFile('cniRecto')} className="hidden" />
                <input ref={cniVersoInputRef} type="file" accept="image/*" capture="environment" onChange={handleCniFile('cniVerso')} className="hidden" />
                {dossier.cniRecto && !dossier.cniVerso && (
                  <p className={`${txt} mt-2 text-xs text-muted-foreground`}>Recto enregistré — lecture automatique en cours. Ajoutez le verso si la carte contient d'autres informations.</p>
                )}
                {!dossier.cniRecto && dossier.cniVerso && (
                  <p className={`${txt} mt-2 text-xs text-muted-foreground`}>Verso enregistré — lecture automatique en cours. Ajoutez le recto pour compléter l'identité.</p>
                )}
              </section>

              {/* ---- Statut de l'analyse OCR ---- */}
              {ocrStatus === 'analyzing' && (
                <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-[#F5F0EB]'}`} role="status">
                  <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: IDENT_COLOR }} />
                  <p className={`${txt} text-muted-foreground`}>Lecture de la carte en cours...</p>
                </div>
              )}
              {ocrStatus === 'success' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5" role="status">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-green-600" />
                  <p className={`${txt} text-green-800`}>Informations lues automatiquement — vérifiez-les et corrigez si besoin avant de continuer.</p>
                </div>
              )}
              {ocrStatus === 'failure' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5" role="status">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className={`${txt} text-amber-800`}>Lecture impossible sur cette photo. Complétez les informations manuellement ci-dessous, ou reprenez les photos.</p>
                    <button type="button" onClick={() => runCniOcr()} className="mt-1 text-xs font-semibold underline" style={{ color: IDENT_COLOR }}>
                      Analyser à nouveau
                    </button>
                  </div>
                </div>
              )}

              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${identDarkMode ? 'bg-stone-900' : 'bg-[#F5F0EB]'}`}>
                <ScanLine className="mt-0.5 size-4 shrink-0" style={{ color: IDENT_COLOR }} />
                <p className={`${txt} text-muted-foreground`}>
                  Les informations de la CNI seront préremplies à l&apos;étape suivante. Vous pourrez tout vérifier et corriger au même endroit.
                </p>
              </div>

              {/* ---- Confidentialité + passer ---- */}
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${identDarkMode ? 'bg-stone-900' : 'bg-[#F5F0EB]'}`}>
                <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: IDENT_COLOR }} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  L'analyse se fait entièrement sur votre téléphone — les photos de la CNI ne quittent jamais l'appareil et restent attachées au dossier.
                </p>
              </div>
              <button type="button" onClick={goNext} className="w-full py-1 text-center text-xs font-medium underline text-muted-foreground transition-colors hover:text-foreground">
                Continuer sans scanner la CNI
              </button>
            </div>
  )
}
