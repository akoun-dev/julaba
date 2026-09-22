"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Étape 5 du wizard d'enrôlement : vérification du dossier + PIN/schéma/code visuel.
import React from 'react'
import {
  FileText,
  Check,
  Lock,
  Grid3X3,
  ImageIcon,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PatternLock } from '@/components/marchand/pattern-lock'
import { VisualCodeGrid } from '@/components/marchand/visual-code-grid'
import {
  StepHero,
  ReviewRow,
  IDENT_COLOR,
} from './parts'

import type { Dossier } from '@/lib/stores/identificateur-store'

interface StepAutorisationProps {
  dossier: Dossier
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>
  soleilMode: boolean
  pinValue: string
  setPinValue: React.Dispatch<React.SetStateAction<string>>
  pinConfirm: string
  setPinConfirm: React.Dispatch<React.SetStateAction<string>>
  pinVisible: boolean
  setPinVisible: React.Dispatch<React.SetStateAction<boolean>>
  pinDone: boolean
  setPinDone: React.Dispatch<React.SetStateAction<boolean>>
  patternDone: boolean
  setPatternDone: React.Dispatch<React.SetStateAction<boolean>>
  patternError: boolean
  setPatternError: React.Dispatch<React.SetStateAction<boolean>>
  visualDone: boolean
  setVisualDone: React.Dispatch<React.SetStateAction<boolean>>
  visualError: boolean
  setVisualError: React.Dispatch<React.SetStateAction<boolean>>
  visualGridKey: number
  setVisualGridKey: React.Dispatch<React.SetStateAction<number>>
  handlePinSubmit: () => void
  handlePatternComplete: (pattern: number[]) => void
  handleVisualComplete: (sequence: string[]) => void
}

export function StepAutorisation({ dossier, updateField, setCurrentStep, soleilMode, pinValue, setPinValue, pinConfirm, setPinConfirm, pinVisible, setPinVisible, pinDone, setPinDone, patternDone, setPatternDone, patternError, setPatternError, visualDone, setVisualDone, visualError, setVisualError, visualGridKey, setVisualGridKey, handlePinSubmit, handlePatternComplete, handleVisualComplete }: StepAutorisationProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'
  return (
            <div className="space-y-6">
              <StepHero
                step={5}
                icon={<Lock className="size-5" />}
                title="Autorisation & envoi"
                description="Le schéma est recommandé, mais vous pouvez configurer l'autorisation plus tard si l'acteur n'est pas disponible. Vérifiez le dossier puis envoyez-le."
              />
              <Card className="border-[#9F8170]/30 bg-[#FDF3ED] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold" style={{ color: IDENT_COLOR }}>Vérifier le dossier</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Les éléments obligatoires doivent être complétés avant l’envoi.</p>
                  </div>
                  <FileText className="size-5 shrink-0" style={{ color: IDENT_COLOR }} />
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <ReviewRow label="CNI (recto & verso)" complete={!!dossier.cniRecto && !!dossier.cniVerso} onEdit={() => setCurrentStep(1)} detail={dossier.cniRecto && dossier.cniVerso ? 'Scannée' : 'Optionnelle — non scannée'} />
                  <ReviewRow label="Photo" complete={!!dossier.photoBase64} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Identité et activité" complete={!!dossier.firstName && !!dossier.lastName && !!dossier.phone && !!dossier.actorType && !!dossier.activite} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Zone / marché" complete={!!dossier.zone} onEdit={() => setCurrentStep(2)} required />
                  <ReviewRow label="Localisation" complete={!!dossier.gps} onEdit={() => setCurrentStep(4)} detail={dossier.gps ? 'Position capturée' : 'À compléter plus tard'} />
                  <ReviewRow label="Autorisation" complete={!!dossier.pinHash || !!dossier.patternHash || !!dossier.visualCodeHash} onEdit={() => undefined} detail={dossier.pinHash || dossier.patternHash || dossier.visualCodeHash ? 'Configurée' : 'À configurer plus tard'} />
                </div>
              </Card>

              {/* ---- 1. Schéma (recommandé) ---- */}
              <Card className="p-4 space-y-3 border-2" style={{ borderColor: patternDone ? '#16A34A' : IDENT_COLOR }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: patternDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {patternDone ? <Check className="size-4 text-green-600" /> : <Grid3X3 className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`${txtLabel}`} style={{ color: patternDone ? '#16A34A' : IDENT_COLOR }}>1. Schéma</h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white rounded-full px-2 py-0.5" style={{ backgroundColor: IDENT_COLOR }}>
                          Recommandé
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Dessinez un schéma (min. 4 points)</p>
                    </div>
                  </div>
                  {patternDone && (
                    <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setPatternDone(false); setPatternError(false); updateField('patternHash', undefined) }}>
                      Changer
                    </Button>
                  )}
                </div>

                {!patternDone && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <div className={patternError ? 'animate-[shake_0.4s_ease-in-out]' : ''}>
                      <PatternLock
                        onComplete={handlePatternComplete}
                        color={IDENT_COLOR}
                        size={220}
                        error={patternError}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Connecter au moins 4 points</p>
                  </div>
                )}
              </Card>

              {/* ---- 2. Code PIN ---- */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pinDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                      {pinDone ? <Check className="size-4 text-green-600" /> : <Lock className="size-4" style={{ color: IDENT_COLOR }} />}
                    </div>
                    <div>
                      <h3 className={`${txtLabel}`} style={{ color: pinDone ? '#16A34A' : IDENT_COLOR }}>2. Code PIN</h3>
                      <p className="text-xs text-muted-foreground">Code secret à chiffres (4-6 chiffres)</p>
                    </div>
                  </div>
                  {pinDone && (
                    <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setPinDone(false); setPinValue(''); setPinConfirm(''); updateField('pinHash', undefined) }}>
                      Changer
                    </Button>
                  )}
                </div>

                {!pinDone && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Code PIN</Label>
                      <div className="relative">
                        <Input
                          className={`${txt} pr-10`}
                          type={pinVisible ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••"
                          value={pinValue}
                          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
                        />
                        <button type="button" onClick={() => setPinVisible(!pinVisible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {pinVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Confirmer le code</Label>
                      <Input
                        className={txt}
                        type={pinVisible ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••"
                        value={pinConfirm}
                        onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full text-white"
                      style={{ backgroundColor: IDENT_COLOR }}
                      onClick={handlePinSubmit}
                      disabled={pinValue.length < 4 || !pinConfirm}
                    >
                      <Lock className="size-4 mr-1" /> Enregistrer le code PIN
                    </Button>
                  </div>
                )}
              </Card>

              {/* ---- 3. Code Visuel (Image) — marchand only, never offered for producteur ---- */}
              {dossier.actorType !== 'producteur' && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: visualDone ? '#16A34A20' : `${IDENT_COLOR}15` }}>
                        {visualDone ? <Check className="size-4 text-green-600" /> : <ImageIcon className="size-4" style={{ color: IDENT_COLOR }} />}
                      </div>
                      <div>
                        <h3 className={`${txtLabel}`} style={{ color: visualDone ? '#16A34A' : IDENT_COLOR }}>3. Code Visuel</h3>
                        <p className="text-xs text-muted-foreground">Choisir 4 images dans l'ordre</p>
                      </div>
                    </div>
                    {visualDone && (
                      <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => { setVisualDone(false); setVisualError(false); setVisualGridKey((k) => k + 1); updateField('visualCodeHash', undefined) }}>
                        Changer
                      </Button>
                    )}
                  </div>

                  {!visualDone && (
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <div className={visualError ? 'animate-[shake_0.4s_ease-in-out]' : ''}>
                        <VisualCodeGrid
                          key={visualGridKey}
                          onComplete={handleVisualComplete}
                          requiredLength={3}
                          gridSize={3}
                          soleilMode={soleilMode}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Sélectionnez 3 symboles dans le bon ordre</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
  )
}
