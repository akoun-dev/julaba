"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { type MerchantProfile } from '@/lib/marchand-profile-data'

// ============================================================
// SUB-SCREEN: INFORMATIONS
// ============================================================


export function InformationsSubScreen({
  profile,
  setProfile,
  soleilMode,
  onBack,
}: {
  profile: MerchantProfile
  setProfile: (p: MerchantProfile) => void
  soleilMode: boolean
  onBack: () => void
}) {
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    nickname: profile.nickname,
    market: profile.market,
    commune: profile.commune,
    ville: profile.ville,
    activity: profile.activity,
    experience: profile.experience,
  })

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    const updated = { ...profile, ...form }
    setProfile(updated)
    tataSpeak("C'est enregistré !")
    haptic('success')
    onBack()
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Mes informations</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="space-y-2">
          <Label className={tc}>Prénom</Label>
          <Input
            value={form.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            placeholder="Votre prénom"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Nom</Label>
          <Input
            value={form.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            placeholder="Votre nom"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Surnom</Label>
          <Input
            value={form.nickname}
            onChange={(e) => handleChange('nickname', e.target.value)}
            placeholder="Votre surnom"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Marché / Zone</Label>
          <Input
            value={form.market}
            onChange={(e) => handleChange('market', e.target.value)}
            placeholder="Ex: Marché d'Adjame"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Commune</Label>
          <Input
            value={form.commune}
            onChange={(e) => handleChange('commune', e.target.value)}
            placeholder="Ex: Cocody"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Ville</Label>
          <Input
            value={form.ville}
            onChange={(e) => handleChange('ville', e.target.value)}
            placeholder="Ex: Abidjan"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Activité</Label>
          <Input
            value={form.activity}
            onChange={(e) => handleChange('activity', e.target.value)}
            placeholder="Ex: Vente de tomates"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Années d'expérience</Label>
          <Input
            type="number"
            min={0}
            value={form.experience}
            onChange={(e) => handleChange('experience', Math.max(0, parseInt(e.target.value) || 0))}
            placeholder="0"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>

        <Button
          onClick={handleSave}
          className="w-full bg-[#C66A2C] hover:bg-[#B55E25] text-white"
          style={soleilMode ? { fontSize: '16px' } : {}}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
