"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Étape 2 du wizard d'enrôlement : photo acteur, type d'acteur, identité pré-remplie, adhésion coopérative.
import React from 'react'
import {
  Camera,
  Users,
  FileText,
  RotateCcw,
  Loader2,
  Check,
  AlertTriangle,
  Handshake,
  Sprout,
  Store,
  UserRound,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ZONES,
  activitesPour,
  type ActorType,
  type Dossier,
} from '@/lib/stores/identificateur-store'
import { MARCHAND_CATEGORIES_META, MARCHAND_CATEGORIES_BY_POSITION, type MarchandCategorie } from '@/lib/marchand-categories'
import {
  StepHero,
  SectionTitle,
  IDENT_COLOR,
} from './parts'

interface StepIdentiteProps {
  dossier: Dossier
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  handlePhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void
  captureActorPhoto: () => void
  photoInputRef: React.RefObject<HTMLInputElement | null>
  checkingPhoto: boolean
  photoWarnings: string[]
  basculerAdhesion: (coche: boolean) => void
  chargerCooperatives: () => void
  cooperativesEtat: 'idle' | 'chargement' | 'pret' | 'erreur'
  cooperativesListe: Array<{ id: string; nom: string }>
  sexeLabels: Record<string, string>
  identDarkMode: boolean
  soleilMode: boolean
}

export function StepIdentite({ dossier, updateField, handlePhotoCapture, captureActorPhoto, photoInputRef, checkingPhoto, photoWarnings, basculerAdhesion, chargerCooperatives, cooperativesEtat, cooperativesListe, sexeLabels, identDarkMode, soleilMode }: StepIdentiteProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'
  return (
            <div className="space-y-6">
              <StepHero
                step={2}
                icon={<UserRound className="size-5" />}
                title="Photo & identité de l'acteur"
                description="Prenez la photo de l'acteur, choisissez son type d'activité, puis vérifiez les informations pré-remplies depuis la CNI."
              />
              {/* Photo */}
              <section>
                <SectionTitle icon={<Camera className="size-4" />} title="PHOTO ACTEUR" required />
                <div className="mt-3">
                  {dossier.photoBase64 ? (
                    <div className="relative">
                      <img
                        src={dossier.photoBase64}
                        alt="Photo acteur"
                        className="h-56 w-full rounded-xl border-2 object-cover"
                        style={{ borderColor: IDENT_COLOR }}
                      />
                      <button
                        onClick={captureActorPhoto}
                        className="absolute bottom-3 right-3 rounded-full border bg-white p-2.5 shadow-md transition-colors hover:bg-[#F5F0EB]"
                        style={{ borderColor: IDENT_COLOR }}
                        aria-label="Reprendre photo"
                      >
                        <RotateCcw className="size-3.5" style={{ color: IDENT_COLOR }} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={captureActorPhoto}
                      className="flex h-56 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors hover:bg-[#F5F0EB]"
                      style={{ borderColor: IDENT_COLOR }}
                    >
                      <Camera className="mb-2 size-12" style={{ color: IDENT_COLOR, opacity: 0.6 }} />
                      <span className={`${txt} text-muted-foreground`}>Prendre photo</span>
                    </button>
                  )}
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                  {dossier.photoBase64 && checkingPhoto && (
                    <p className={`${txt} text-muted-foreground mt-2 flex items-center gap-1.5`}>
                      <Loader2 className="size-3.5 animate-spin" />
                      Vérification de la photo...
                    </p>
                  )}
                  {dossier.photoBase64 && !checkingPhoto && photoWarnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {photoWarnings.map((w) => (
                        <p key={w} className={`${txt} text-amber-700 flex items-start gap-1.5`}>
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {!dossier.photoBase64 && (
                    <p className={`${txt} mt-2 max-w-xs text-muted-foreground`}>La photo peut être ajoutée plus tard. Elle sera nécessaire pour envoyer le dossier.</p>
                  )}
                </div>
              </section>

              {/* Type acteur */}
              {/* Type acteur */}
              <section>
                <SectionTitle icon={<UserRound className="size-4" />} title="TYPE ACTEUR" required />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                       { type: 'marchand' as ActorType, icon: Store, label: 'Marchand' },
                       { type: 'producteur' as ActorType, icon: Sprout, label: 'Producteur' },
                       { type: 'cooperative' as ActorType, icon: Handshake, label: 'Coopérative' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => updateField('actorType', item.type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        dossier.actorType === item.type ? 'border-current shadow-sm' : identDarkMode ? 'border-stone-700 hover:border-stone-600' : 'border-[#E7E0D8] hover:border-[#D9CFC4]'
                      }`}
                      style={dossier.actorType === item.type ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                    >
                       <item.icon className="size-6" aria-hidden="true" />
                      <span className={`${txt} font-medium`} style={{ color: dossier.actorType === item.type ? IDENT_COLOR : undefined }}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Classification marchand : détaillant / semi-grossiste /
                  grossiste. N'apparaît que pour les marchands — c'est la
                  réponse à « où se situe-t-il dans la chaîne de
                  distribution ? », qui pilera tarifs, volumes et
                  recommandations fournisseurs. */}
              {dossier.actorType === 'marchand' && (
                <section>
                  <SectionTitle icon={<Store className="size-4" />} title="CATÉGORIE MARCHAND" required />
                  <p className={`${txt} text-muted-foreground mt-1`}>
                    Où se situe ce commerce dans la chaîne de distribution ?
                  </p>
                  <div className="mt-3 space-y-2">
                    {MARCHAND_CATEGORIES_BY_POSITION.map((catId) => {
                      const meta = MARCHAND_CATEGORIES_META[catId as MarchandCategorie]
                      const selected = dossier.categorieMarchand === catId
                      return (
                        <button
                          key={catId}
                          type="button"
                          onClick={() => updateField('categorieMarchand', catId)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                            selected ? 'border-current shadow-sm' : identDarkMode ? 'border-stone-700 hover:border-stone-600' : 'border-[#E7E0D8] hover:border-[#D9CFC4]'
                          }`}
                          style={selected ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                          aria-pressed={selected}
                        >
                          <span
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              selected ? 'border-transparent' : identDarkMode ? 'border-stone-600' : 'border-[#D9CFC4]'
                            }`}
                            style={selected ? { backgroundColor: IDENT_COLOR } : undefined}
                            aria-hidden="true"
                          >
                            {selected && <Check className="size-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`${txt} block font-semibold`} style={{ color: selected ? IDENT_COLOR : undefined }}>
                              {meta.label}
                            </span>
                            <span className={`${txt} block text-muted-foreground`}>{meta.description}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* DET-COOP-007 (MODE-978) — adhésion coopérative à
                  l'enrôlement (julaba-app §7) : l'agent coche, choisit la
                  coopérative, le serveur crée l'adhésion (actif, rôle
                  membre) dès la soumission du dossier. Optionnel : un
                  marchand hors coopérative s'enrôle exactement comme
                  avant. */}
              {dossier.actorType === 'marchand' && (
                <section>
                  <SectionTitle icon={<Users className="size-4" />} title="ADHÉSION COOPÉRATIVE" />
                  <div className={`mt-3 flex items-start gap-3 p-3 rounded-lg border ${dossier.estMembreCooperative ? 'border-current' : identDarkMode ? 'border-stone-700' : 'border-[#E7E0D8]'}`} style={dossier.estMembreCooperative ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}>
                    <Checkbox
                      id="adhesion-coop"
                      checked={!!dossier.estMembreCooperative}
                      onCheckedChange={(v) => basculerAdhesion(v === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="adhesion-coop" className="min-w-0 cursor-pointer">
                      <span className={`${txt} block font-semibold`}>Ce marchand souhaite adhérer à une coopérative</span>
                      <span className={`${txt} block text-muted-foreground`}>
                        L'adhésion sera créée dès l'envoi du dossier (compte actif, rôle membre). Le président la voit directement dans ses membres.
                      </span>
                    </label>
                  </div>
                  {dossier.estMembreCooperative && (
                    <div className="mt-3">
                      {cooperativesEtat === 'chargement' && (
                        <p className={`${txt} flex items-center gap-2 text-muted-foreground`}>
                          <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement des coopératives…
                        </p>
                      )}
                      {cooperativesEtat === 'erreur' && (
                        <div className="space-y-2">
                          <p className={`${txt} flex items-center gap-2 text-amber-700`}>
                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                            Liste indisponible (hors ligne ?). Réessayez ou décochez pour continuer sans adhésion.
                          </p>
                          <Button type="button" variant="outline" size="sm" onClick={() => void chargerCooperatives()}>
                            <RotateCcw className="size-4" aria-hidden /> Réessayer
                          </Button>
                        </div>
                      )}
                      {cooperativesEtat === 'pret' && cooperativesListe.length === 0 && (
                        <p className={`${txt} text-muted-foreground`}>Aucune coopérative active pour le moment — décochez pour continuer.</p>
                      )}
                      {cooperativesEtat === 'pret' && cooperativesListe.length > 0 && (
                        <div className="space-y-2" role="radiogroup" aria-label="Choix de la coopérative">
                          {cooperativesListe.map((coop) => {
                            const selected = dossier.cooperativeId === coop.id
                            return (
                              <button
                                key={coop.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => { updateField('cooperativeId', coop.id); updateField('cooperativeNom', coop.nom) }}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                                  selected ? 'border-current shadow-sm' : identDarkMode ? 'border-stone-700 hover:border-stone-600' : 'border-[#E7E0D8] hover:border-[#D9CFC4]'
                                }`}
                                style={selected ? { borderColor: IDENT_COLOR, backgroundColor: `${IDENT_COLOR}10` } : undefined}
                              >
                                <span
                                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                    selected ? 'border-transparent' : identDarkMode ? 'border-stone-600' : 'border-[#D9CFC4]'
                                  }`}
                                  style={selected ? { backgroundColor: IDENT_COLOR } : undefined}
                                  aria-hidden="true"
                                >
                                  {selected && <Check className="size-3 text-white" />}
                                </span>
                                <span className={`${txt} min-w-0 truncate font-medium`} style={{ color: selected ? IDENT_COLOR : undefined }}>
                                  {coop.nom}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Informations obligatoires — pré-remplies depuis la CNI
                  quand elle a été scannée à l'étape 1. */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="IDENTITÉ ET COORDONNÉES" required />
                {(dossier.cniRecto || dossier.cniVerso) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <Sparkles className="size-3.5 shrink-0" aria-hidden />
                    Pré-rempli depuis la CNI scannée — vérifiez chaque champ.
                  </p>
                )}
                <div className="mt-3 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Prénom <span className="text-red-500">*</span></Label>
                    <Input className={txt} placeholder="Prénom de l'acteur" value={dossier.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Nom <span className="text-red-500">*</span></Label>
                    <Input className={txt} placeholder="Nom de l'acteur" value={dossier.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Sexe</Label>
                    <div className="flex gap-4">
                      {(['masculin', 'feminin', 'autre'] as const).map((s) => (
                        <label key={s} className={`flex items-center gap-2 cursor-pointer ${txt}`}>
                          <input type="radio" name="sexe" value={s} checked={dossier.sexe === s} onChange={() => updateField('sexe', s)} className="accent-[#9F8170]" />
                          {sexeLabels[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>N° CNI</Label>
                      <Input className={`${txt} font-mono`} placeholder="CI0000000000" value={dossier.cniNumero || ''} onChange={(e) => updateField('cniNumero', e.target.value.toUpperCase())} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>NNI</Label>
                      <Input className={`${txt} font-mono`} placeholder="0000000000" inputMode="numeric" value={dossier.nni || ''} onChange={(e) => updateField('nni', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Téléphone <span className="text-red-500">*</span></Label>
                    <div className="flex items-center">
                      <span className={`${txt} px-3 py-2 rounded-l-md border border-r-0 ${identDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-[#F5F0EB] text-[#78716C]'}`}>+225</span>
                      <Input className={`${txt} rounded-l-none`} type="tel" placeholder="0X XX XX XX XX" value={dossier.phone} onChange={(e) => updateField('phone', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Activité <span className="text-red-500">*</span></Label>
                    {/* Liste scindée par profil : un détaillant ne devrait pas
                        avoir à choisir « Culture de cacao ». */}
                    <Select value={dossier.activite} onValueChange={(val) => updateField('activite', val)}>
                      <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir une activité" /></SelectTrigger>
                      <SelectContent>{activitesPour(dossier.actorType).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Zone / Marché <span className="text-red-500">*</span></Label>
                    <Select value={dossier.zone} onValueChange={(val) => updateField('zone', val)}>
                      <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir une zone ou un marché" /></SelectTrigger>
                      <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>
  )
}
