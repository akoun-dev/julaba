"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Étape 4 du wizard d'enrôlement : GPS + documents joints.
// La carto ligne 1376 inclut aussi la section documents joints (input caché,
// liste, OCR) — déplacée telle quelle avec l'étape.
import React from 'react'
import {
  Upload,
  Trash2,
  MapPin,
  Map,
  FileText,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  StepHero,
  SectionTitle,
  IDENT_COLOR,
} from './parts'

import type { Dossier } from '@/lib/stores/identificateur-store'

interface StepLocalisationProps {
  dossier: Dossier
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  captureGPS: () => void
  gpsLoading: boolean
  handleDocumentAdd: (e: React.ChangeEvent<HTMLInputElement>) => void
  docInputRef: React.RefObject<HTMLInputElement | null>
  removeDocument: (index: number) => void
  identDarkMode: boolean
  soleilMode: boolean
}

export function StepLocalisation({ dossier, updateField, captureGPS, gpsLoading, handleDocumentAdd, docInputRef, removeDocument, identDarkMode, soleilMode }: StepLocalisationProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  return (
            <div className="space-y-6">
              <StepHero
                step={4}
                icon={<MapPin className="size-5" />}
                title="Localisation & pièces jointes"
                description="Capturez la position GPS de l'acteur, ajoutez des notes et les documents utiles au dossier."
              />
              {/* GPS */}
              <section>
                <SectionTitle icon={<MapPin className="size-4" />} title="GÉOLOCALISATION" required />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={captureGPS} disabled={gpsLoading}>
                    {gpsLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                    {gpsLoading ? 'Capture...' : 'Capturer ma position'}
                  </Button>
                  {dossier.gps && (
                    <Card className="p-3 space-y-1.5">
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Latitude:</span><span className="font-mono">{dossier.gps.lat.toFixed(6)}</span></div>
                      <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Longitude:</span><span className="font-mono">{dossier.gps.lon.toFixed(6)}</span></div>
                      {dossier.gps.accuracy && <div className={`flex justify-between ${txt}`}><span className="text-muted-foreground">Précision:</span><span className="font-mono">{Math.round(dossier.gps.accuracy)}m</span></div>}
                      <button className={`flex items-center gap-1 mt-2 ${txt} font-medium`} style={{ color: IDENT_COLOR }} type="button">
                        <Map className="size-4" /> Voir sur la carte
                      </button>
                    </Card>
                  )}
                  {!dossier.gps && dossier.gpsStatus && (
                    <p className={`${txt} text-amber-700`} role="status">Localisation à compléter : {dossier.gpsUnavailableReason || 'position indisponible'}.</p>
                  )}
                </div>
              </section>

              {/* Notes */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="NOTES" />
                <div className="mt-3">
                  <Textarea className={txt} placeholder="Commentaire libre..." rows={3} value={dossier.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
                </div>
              </section>

              {/* Documents */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="PIÈCES JOINTES" />
                <div className="mt-3 space-y-3">
                  <Button type="button" variant="outline" className={`w-full gap-2 ${txt}`} style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }} onClick={() => docInputRef.current?.click()}>
                    <Upload className="size-4" /> + Ajouter un document
                  </Button>
                  <input ref={docInputRef} type="file" multiple onChange={handleDocumentAdd} className="hidden" />
                  {dossier.documents && dossier.documents.length > 0 && (
                    <div className="space-y-2">
                      {dossier.documents.map((doc, idx) => (
                        <div key={`${doc.name}-${idx}`} className={`p-2.5 rounded-md border space-y-1.5 ${identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-[#F5F0EB]'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                              <span className={`${txt} truncate`}>{doc.name}</span>
                            </div>
                            <button onClick={() => removeDocument(idx)} className="p-2 -m-1 rounded-full hover:bg-red-50 text-red-500 transition-colors shrink-0" aria-label={`Supprimer ${doc.name}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          {doc.ocrText && (
                            <div className="pl-6 space-y-1">
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                Texte détecté : {doc.ocrText}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  updateField('notes', `${dossier.notes ? dossier.notes + '\n' : ''}[${doc.name}] ${doc.ocrText}`)
                                }
                                className="text-xs font-medium underline"
                                style={{ color: IDENT_COLOR }}
                              >
                                Ajouter aux notes
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
  )
}
