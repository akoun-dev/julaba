"use client"

// MODE-989 (DET-001 tranche 3) — bloc déplacé VERBATIM de
// ident-identification-screen.tsx (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Étape 3 du wizard d'enrôlement : détails métier (étal, produits, production…).
import React from 'react'
import {
  Upload,
  Trash2,
  FileText,
  Handshake,
  Sprout,
  Store,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  PRODUITS,
  type Dossier,
} from '@/lib/stores/identificateur-store'
import {
  StepHero,
  SectionTitle,
  MultiSelectField,
  IDENT_COLOR,
} from './parts'

interface StepDetailsProps {
  dossier: Dossier
  updateField: <K extends keyof Dossier>(key: K, value: Dossier[K]) => void
  handleEtalPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void
  captureEtalPhoto: () => void
  etalInputRef: React.RefObject<HTMLInputElement | null>
  toggleProduit: (produit: string, field: 'produitsPrincipaux' | 'principalesCultures' | 'domainesActivite') => void
  typeCommerceLabels: Record<string, string>
  typeProductionLabels: Record<string, string>
  modeExploitationLabels: Record<string, string>
  soleilMode: boolean
}

export function StepDetails({ dossier, updateField, handleEtalPhoto, captureEtalPhoto, etalInputRef, toggleProduit, typeCommerceLabels, typeProductionLabels, modeExploitationLabels, soleilMode }: StepDetailsProps) {
  const txt = soleilMode ? 'text-base' : 'text-sm'
  const txtLabel = soleilMode ? 'text-base font-medium' : 'text-sm font-medium'
  return (
            <div className="space-y-6">
              <StepHero
                step={3}
                icon={<FileText className="size-5" />}
                title="Détails de l'activité"
                description="Informations complémentaires, puis champs spécifiques au type d'acteur choisi."
              />
              {/* Complementary info */}
              <section>
                <SectionTitle icon={<FileText className="size-4" />} title="INFORMATIONS COMPLÉMENTAIRES" />
                <div className="mt-3 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Date de naissance</Label>
                    <Input className={txt} type="date" value={dossier.dateNaissance || ''} onChange={(e) => updateField('dateNaissance', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Adresse complète</Label>
                    <Textarea className={txt} placeholder="Adresse complète de l'acteur" rows={2} value={dossier.adresse || ''} onChange={(e) => updateField('adresse', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Nombre d'employés</Label>
                    <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbEmployes ?? ''} onChange={(e) => updateField('nbEmployes', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={txtLabel}>Chiffre d'affaires estimé</Label>
                    <div className="relative">
                      <Input className={`${txt} pr-24`} type="number" min={0} placeholder="0" value={dossier.chiffreAffaires ?? ''} onChange={(e) => updateField('chiffreAffaires', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">FCFA / mois</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic fields by actor type */}
              {dossier.actorType === 'marchand' && (
                <section>
                  <SectionTitle icon={<Store className="size-4" />} title="INFORMATIONS MARCHAND" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nom du commerce</Label>
                      <Input className={txt} placeholder="Nom du commerce" value={dossier.nomCommerce || ''} onChange={(e) => updateField('nomCommerce', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Type de commerce</Label>
                      <Select value={dossier.typeCommerce || ''} onValueChange={(val) => updateField('typeCommerce', val as Dossier['typeCommerce'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un type de commerce" /></SelectTrigger>
                        <SelectContent>{Object.entries(typeCommerceLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <MultiSelectField
                      label="Produits principaux" max={5}
                      items={PRODUITS}
                      selected={dossier.produitsPrincipaux || []}
                      onToggle={(p) => toggleProduit(p, 'produitsPrincipaux')}
                      txtClass={txt}
                    />
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Heures d'ouverture</Label>
                      <Input className={txt} placeholder="eg. 7h - 18h" value={dossier.horaires || ''} onChange={(e) => updateField('horaires', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Stand / Emplacement</Label>
                      <Input className={txt} placeholder="Numéro ou description du stand" value={dossier.standEmplacement || ''} onChange={(e) => updateField('standEmplacement', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Photo de l'étal</Label>
                      {dossier.photoEtal ? (
                        <div className="relative inline-block">
                          <img src={dossier.photoEtal} alt="Photo de l'étal" className="w-28 h-28 rounded-lg object-cover border" style={{ borderColor: IDENT_COLOR }} />
                          <button onClick={() => updateField('photoEtal', undefined)} className="absolute -top-1 -right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors" aria-label="Retirer la photo de l'étal">
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={captureEtalPhoto} className="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed hover:bg-[#F5F0EB] transition-colors" style={{ borderColor: IDENT_COLOR }}>
                          <Upload className="size-4" style={{ color: IDENT_COLOR }} />
                          <span className={txt} style={{ color: IDENT_COLOR }}>Ajouter une photo de l'étal</span>
                        </button>
                      )}
                      <input ref={etalInputRef} type="file" accept="image/*" onChange={handleEtalPhoto} className="hidden" />
                    </div>
                  </div>
                </section>
              )}

              {dossier.actorType === 'producteur' && (
                <section>
                  <SectionTitle icon={<Sprout className="size-4" />} title="INFORMATIONS PRODUCTEUR" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Type de production</Label>
                      <Select value={dossier.typeProduction || ''} onValueChange={(val) => updateField('typeProduction', val as Dossier['typeProduction'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un type de production" /></SelectTrigger>
                        <SelectContent>{Object.entries(typeProductionLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Superficie</Label>
                      <div className="relative">
                        <Input className={`${txt} pr-20`} type="number" min={0} step={0.1} placeholder="0" value={dossier.superficie ?? ''} onChange={(e) => updateField('superficie', e.target.value ? parseFloat(e.target.value) : undefined)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ha</span>
                      </div>
                    </div>
                    <MultiSelectField
                      label="Cultures principales" max={5}
                      items={PRODUITS}
                      selected={dossier.principalesCultures || []}
                      onToggle={(p) => toggleProduit(p, 'principalesCultures')}
                      txtClass={txt}
                    />
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nombre de cycles / an</Label>
                      <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbCyclesAn ?? ''} onChange={(e) => updateField('nbCyclesAn', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Mode d'exploitation</Label>
                      <Select value={dossier.modeExploitation || ''} onValueChange={(val) => updateField('modeExploitation', val as Dossier['modeExploitation'])}>
                        <SelectTrigger className={`w-full ${txt}`}><SelectValue placeholder="Choisir un mode d'exploitation" /></SelectTrigger>
                        <SelectContent>{Object.entries(modeExploitationLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className={txtLabel}>Accès irrigation</Label>
                      <Switch checked={dossier.accesIrrigation || false} onCheckedChange={(val) => updateField('accesIrrigation', val)} className="data-[state=checked]:bg-[#9F8170]" />
                    </div>
                  </div>
                </section>
              )}

              {dossier.actorType === 'cooperative' && (
                <section>
                  <SectionTitle icon={<Handshake className="size-4" />} title="INFORMATIONS COOPÉRATIVE" />
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nom de la coopérative</Label>
                      <Input className={txt} placeholder="Nom de la coopérative" value={dossier.nomCooperative || ''} onChange={(e) => updateField('nomCooperative', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Numéro d'enregistrement</Label>
                      <Input className={txt} placeholder="Numéro d'enregistrement" value={dossier.numeroEnregistrement || ''} onChange={(e) => updateField('numeroEnregistrement', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Nombre de membres</Label>
                      <Input className={txt} type="number" min={0} placeholder="0" value={dossier.nbMembres ?? ''} onChange={(e) => updateField('nbMembres', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Adresse du siège</Label>
                      <Input className={txt} placeholder="Adresse du siège de la coopérative" value={dossier.adresseSiege || ''} onChange={(e) => updateField('adresseSiege', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={txtLabel}>Président / Responsable</Label>
                      <Input className={txt} placeholder="Nom du président ou responsable" value={dossier.president || ''} onChange={(e) => updateField('president', e.target.value)} />
                    </div>
                    <MultiSelectField
                      label="Domaines d'activité" max={5}
                      items={PRODUITS}
                      selected={dossier.domainesActivite || []}
                      onToggle={(p) => toggleProduit(p, 'domainesActivite')}
                      txtClass={txt}
                    />
                  </div>
                </section>
              )}
            </div>
  )
}
