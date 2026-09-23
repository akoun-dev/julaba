"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { MARCHAND_CATEGORIES_META } from '@/lib/marchand-categories'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { type MerchantProfile } from '@/lib/marchand-profile-data'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN: COMMERCE
// ============================================================


export function CommerceSubScreen({
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
  // Classification marchand posée à l'enrôlement (détaillant / semi-grossiste /
  // grossiste) : vérité serveur, affichée en lecture seule — le backoffice
  // seul peut la corriger, les prix de gros en dépendent.
  const merchantCategorie = useAppStore((s) => s.merchantCategorie)
  const categorieMeta = merchantCategorie
    ? MARCHAND_CATEGORIES_META[merchantCategorie]
    : null
  const [form, setForm] = useState({
    name: profile.commerce.name,
    type: profile.commerce.type,
    products: profile.commerce.products.join('|'),
    hours: profile.commerce.hours,
  })
  const [newProduct, setNewProduct] = useState('')
  const products = form.products ? form.products.split('|').map((p) => p.trim()).filter(Boolean) : []

  const handleSave = () => {
    const updated = {
      ...profile,
      commerce: {
        ...profile.commerce,
        name: form.name,
        type: form.type,
        products,
        hours: form.hours,
      },
    }
    setProfile(updated)
    tataSpeak("C'est enregistré !")
    haptic('success')
    onBack()
  }

  const addProduct = () => {
    if (newProduct.trim()) {
      setForm((prev) => ({
        ...prev,
        products: prev.products ? `${prev.products}|${newProduct.trim()}` : newProduct.trim(),
      }))
      setNewProduct('')
      haptic('light')
    }
  }

  const removeProduct = (index: number) => {
    const updated = products.filter((_, i) => i !== index)
    setForm((prev) => ({ ...prev, products: updated.join('|') }))
    haptic('light')
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Mon commerce</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {categorieMeta && (
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${soleilMode ? 'border-black/30' : ''}`}>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${tc}`}>Catégorie du marchand</p>
              <p className="text-xs text-muted-foreground">Définie lors de votre enrôlement</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${categorieMeta.badgeClass}`}>
              {categorieMeta.label}
            </span>
          </div>
        )}
        <div className="space-y-2">
          <Label className={tc}>Nom du commerce</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Boutique d'Awa"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label className={tc}>Type de commerce</Label>
          <Input
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            placeholder="Ex: Alimentation"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>

        {/* Products list */}
        <div className="space-y-2">
          <Label className={tc}>Produits</Label>
          <div className="flex gap-2">
            <Input
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              placeholder="Ajouter un produit"
              className={soleilMode ? 'text-base' : ''}
              onKeyDown={(e) => { if (e.key === 'Enter') addProduct() }}
            />
            <Button variant="outline" onClick={addProduct} className="shrink-0">
              +
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {products.map((product, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => removeProduct(i)}
              >
                {product} ×
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className={tc}>Horaires</Label>
          <Input
            value={form.hours}
            onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
            placeholder="06:00 - 18:00"
            className={soleilMode ? 'text-base' : ''}
          />
        </div>

        <div className="space-y-2">
          <Label className={tc}>Jours d'ouverture</Label>
          <div className="flex flex-wrap gap-1.5">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => {
              const isSelected = profile.commerce.days.includes(day)
              return (
                <Badge
                  key={day}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer',
                    isSelected && 'bg-[#C66A2C] hover:bg-[#B55E25] text-white border-[#C66A2C]'
                  )}
                  onClick={() => {
                    haptic('light')
                    const updated = {
                      ...profile,
                      commerce: {
                        ...profile.commerce,
                        days: isSelected
                          ? profile.commerce.days.filter((d) => d !== day)
                          : [...profile.commerce.days, day],
                      },
                    }
                    setProfile(updated)
                  }}
                >
                  {day}
                </Badge>
              )
            })}
          </div>
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
