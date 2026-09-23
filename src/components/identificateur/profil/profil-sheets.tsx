/**
 * MODE-998 (DET-001 tranche 10) — Sheets Verrouillage automatique,
 * Affectation zone, Academy et Support de ident-profil-screen.tsx,
 * déplacées VERBATIM (DOM inchangé, props de mêmes noms). Les données
 * statiques academyCards / faqItems voyagent avec elles (indentation
 * d'origine conservée).
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GraduationCap, Phone, Mail, ClipboardList, Camera, FileEdit, CheckCircle2 } from 'lucide-react'
import { useIdentificateurStore, ZONES } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'
import { FaqItem, IDENT_COLOR } from './profil-parts'

  // ─── Academy data ──────────────────────────────────────────────────────────
  const academyCards = [
    {
      icon: ClipboardList,
      title: 'Comment identifier un acteur',
      description: '1. Demandez le nom complet et le numéro de téléphone. 2. Prenez une photo claire du visage. 3. Complétez les informations sur l\'activité. 4. Vérifiez et soumettez le dossier.',
    },
    {
      icon: Camera,
      title: 'Photographie professionnelle',
      description: 'Assurez-vous que le visage est bien éclairé et centré. Évitez les ombres et les arrière-plans chargés. Prenez la photo de face, à hauteur des yeux.',
    },
    {
      icon: FileEdit,
      title: 'Gérer les brouillons',
      description: 'Les dossiers incomplets sont sauvegardés automatiquement en brouillon. Retrouvez-les dans l\'onglet « Brouillons » et complétez-les à tout moment.',
    },
    {
      icon: CheckCircle2,
      title: 'Bonnes pratiques',
      description: 'Identifiez chaque acteur avec précision. Ne créez jamais de doublons. Vérifiez les informations avant de soumettre. Respectez la confidentialité des données.',
    },
  ]

  // ─── Support FAQ data ─────────────────────────────────────────────────────
  const faqItems = [
    {
      question: 'Comment réinitialiser mon code PIN ?',
      answer: 'Allez dans Mon Profil > Changer mon code PIN. Vous devrez saisir votre code actuel, puis définir un nouveau code à 4 chiffres.',
    },
    {
      question: 'Mes dossiers ne s\'envoient pas',
      answer: 'Vérifiez votre connexion internet. Les dossiers sont d\'abord sauvegardés localement en tant que brouillons. Ils seront envoyés automatiquement lorsque la connexion sera rétablie.',
    },
    {
      question: 'Comment changer de zone ?',
      answer: 'Allez dans Mon Profil > Paramètres > Affectation zone. Sélectionnez votre nouvelle zone et le marché correspondant, puis enregistrez.',
    },
    {
      question: 'Puis-je utiliser l\'application hors ligne ?',
      answer: 'Oui, tous vos dossiers sont sauvegardés localement sur votre appareil. Vous pouvez continuer à identifier des acteurs même sans connexion internet.',
    },
  ]

interface ProfilSheetsProps {
  showAutoLockSheet: boolean
  setShowAutoLockSheet: (open: boolean) => void
  tempAutoLock: string
  setTempAutoLock: (value: string) => void
  handleAutoLockSave: () => void
  showZoneSheet: boolean
  setShowZoneSheet: (open: boolean) => void
  tempZone: string
  setTempZone: (value: string) => void
  tempMarche: string
  setTempMarche: (value: string) => void
  handleZoneSave: () => void
  showAcademySheet: boolean
  setShowAcademySheet: (open: boolean) => void
  showSupportSheet: boolean
  setShowSupportSheet: (open: boolean) => void
  textClass: string
  identDarkMode: boolean
  soleilMode: boolean
}

export function ProfilSheets({ showAutoLockSheet, setShowAutoLockSheet, tempAutoLock, setTempAutoLock, handleAutoLockSave, showZoneSheet, setShowZoneSheet, tempZone, setTempZone, tempMarche, setTempMarche, handleZoneSave, showAcademySheet, setShowAcademySheet, showSupportSheet, setShowSupportSheet, textClass, identDarkMode, soleilMode }: ProfilSheetsProps) {
  return (
    <>
      {/* ─── 2. Sheet: Verrouillage automatique ───────────────────────────── */}
      <Sheet open={showAutoLockSheet} onOpenChange={setShowAutoLockSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Verrouillage automatique</SheetTitle>
            <SheetDescription>Choisissez après combien de temps l\'application se verrouille.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <RadioGroup
              value={tempAutoLock}
              onValueChange={setTempAutoLock}
              className="space-y-3"
            >
              {[
                { value: '5', label: '5 min' },
                { value: '10', label: '10 min' },
                { value: '15', label: '15 min' },
                { value: '30', label: '30 min' },
                { value: '0', label: 'Désactivé' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                    tempAutoLock === opt.value ? 'border-[#9F8170] bg-[#9F8170]/5' : 'border-border',
                  )}
                >
                  <RadioGroupItem value={opt.value} />
                  <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </RadioGroup>
            <SheetFooter className="pt-4">
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: IDENT_COLOR }}
                onClick={handleAutoLockSave}
              >
                Enregistrer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 3. Sheet: Affectation zone ───────────────────────────────────── */}
      <Sheet open={showZoneSheet} onOpenChange={setShowZoneSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Affectation zone</SheetTitle>
            <SheetDescription>Modifiez votre zone et votre marché d\'affectation.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className={cn(textClass)}>Zone</Label>
              <Select value={tempZone} onValueChange={setTempZone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionnez une zone" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {ZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className={cn(textClass)}>Marché</Label>
              <Input
                value={tempMarche}
                onChange={(e) => setTempMarche(e.target.value)}
                placeholder="Nom du marché"
                className={cn(textClass)}
              />
            </div>
            <SheetFooter>
              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: IDENT_COLOR }}
                onClick={handleZoneSave}
              >
                Enregistrer
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 6. Sheet: Academy ────────────────────────────────────────────── */}
      <Sheet open={showAcademySheet} onOpenChange={setShowAcademySheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}><GraduationCap className="mr-2 inline size-5" /> Academy</SheetTitle>
            <SheetDescription>Guides et conseils pour améliorer vos identifications sur le terrain.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            {academyCards.map((card, idx) => (
              <Card key={idx} className={cn(identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]')}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <card.icon className="mt-0.5 size-6 shrink-0 text-[#9F8170]" />
                    <div>
                      <h3 className={cn('font-semibold text-sm mb-1.5', textClass)}>{card.title}</h3>
                      <p className={cn('text-xs text-muted-foreground leading-relaxed', soleilMode && 'text-sm')}>
                        {card.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── 7. Sheet: Support ────────────────────────────────────────────── */}
      <Sheet open={showSupportSheet} onOpenChange={setShowSupportSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={cn(textClass)}>Support</SheetTitle>
            <SheetDescription>Contactez-nous ou consultez la FAQ.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {/* Contact info */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>+225 07 00 00 00 00</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>support@julaba.ci</span>
              </div>
            </div>

            <h3 className={cn('font-semibold text-sm mb-3', textClass)}>Questions fréquentes</h3>

            {/* FAQ */}
            <div className="space-y-2">
              {faqItems.map((faq, idx) => (
                <FaqItem key={idx} faq={faq} textClass={textClass} soleilMode={soleilMode} />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
