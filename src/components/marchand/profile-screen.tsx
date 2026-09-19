'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  ArrowLeft, User, Shield, Store, Mic, Sun, Moon, RefreshCw, Bell, GraduationCap,
  CircleHelp, BookOpen, LogOut, Trash2, ChevronRight, Camera,
  Eye, Lock, Clock, Phone, MessageCircle, Mail, Star,
  Search, Info, Delete, Heart,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { MARCHAND_CATEGORIES_META } from '@/lib/marchand-categories'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { VoixSettings } from '@/components/shared/voix-settings'
import { NotificationPreferencesScreen } from '@/components/shared/notification-preferences-screen'
import { cn } from '@/lib/utils'
import { cleanupMerchantData, cleanupAllData } from '@/lib/cleanup'

// ============================================================
// DATA MODEL
// ============================================================

interface MerchantProfile {
  firstName: string
  lastName: string
  nickname: string
  market: string
  commune: string
  ville: string
  activity: string
  experience: number
  preferences: {
    volume: number
    textSize: number
    notifications: Record<string, boolean>
    voiceConfirmation: 'always' | 'never' | 'high-amount'
  }
  commerce: {
    name: string
    type: string
    products: string[]
    hours: string
    days: string[]
  }
  photoDataUrl?: string
  memberSince: string
  score: number
  connectionHistory: { date: string; method: string }[]
}

const defaultProfile: MerchantProfile = {
  firstName: '',
  lastName: '',
  nickname: '',
  market: '',
  commune: '',
  ville: '',
  activity: '',
  experience: 0,
  preferences: {
    volume: 100,
    textSize: 1,
    notifications: {
      tontines: true,
      systeme: true,
    },
    voiceConfirmation: 'always',
  },
  commerce: {
    name: '',
    type: '',
    products: [],
    hours: '06:00 - 18:00',
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  },
  memberSince: new Date().toISOString().split('T')[0],
  score: 0,
  connectionHistory: [],
}

function loadMerchantProfile(phone: string): MerchantProfile {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    const raw = localStorage.getItem(`julaba-profile-${normalized}`)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MerchantProfile>
      return { ...defaultProfile, ...saved }
    }
  } catch {}
  return { ...defaultProfile }
}

function saveMerchantProfile(phone: string, profile: MerchantProfile) {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    localStorage.setItem(`julaba-profile-${normalized}`, JSON.stringify(profile))
  } catch {}
}

function loadMerchantAuthData(phone: string): { authMethod: string } | null {
  const normalized = phone.replace(/[^\d]/g, '')
  try {
    const raw = localStorage.getItem(`julaba-merchant-${normalized}`)
    if (raw) {
      const data = JSON.parse(raw)
      return { authMethod: data.authMethod || 'pin' }
    }
  } catch {}
  return null
}

// ============================================================
// SUB-SCREEN TYPE
// ============================================================

type SubScreen =
  | null
  | 'informations'
  | 'securite'
  | 'commerce'
  | 'voix'
  | 'affichage'
  | 'notifications'
  | 'faq'
  | 'apropos'

// ============================================================
// FAQ DATA
// ============================================================

const FAQ_ITEMS = [
  {
    q: 'Comment enregistrer une vente ?',
    a: 'Allez dans la Caisse du jour, ajoutez vos produits au panier, puis validez la vente. Vous pouvez aussi dire "Vente" à Tata pour la voix.',
  },
  {
    q: 'Comment gérer mon stock ?',
    a: 'Dans l\'onglet Stock, vous pouvez ajouter, modifier ou supprimer des produits. Tata peut aussi vous aider par la voix.',
  },
  {
    q: 'Mes données sont-elles sécurisées ?',
    a: 'Oui ! Toutes vos données sont stockées localement sur votre téléphone. Elles ne sont jamais envoyées sans votre accord.',
  },
  {
    q: 'Comment fonctionne le mode Soleil ?',
    a: 'Le mode Soleil augmente la taille du texte et le contraste pour une meilleure lisibilité en extérieur. Activez-le dans Profil > Affichage.',
  },
  {
    q: 'Comment changer mon code PIN ?',
    a: 'Allez dans Profil > Sécurité & Connexion, puis appuyez sur "Changer mon code PIN".',
  },
  {
    q: 'Jùlaba fonctionne-t-il sans internet ?',
    a: 'Oui, Jùlaba fonctionne entièrement hors ligne. Vos données sont sauvegardées localement sur votre téléphone.',
  },
  {
    q: 'Comment contacter le support ?',
    a: 'Vous pouvez nous appeler au +225 01 02 03 04, envoyer un message WhatsApp, ou écrire à support@julaba.ci.',
  },
  {
    q: 'Qu\'est-ce que la fidélité Jùlaba ?',
    a: 'Le programme de fidélité récompense vos ventes régulières. Plus vous vendez, plus vous gagnez de points et de badges.',
  },
]

// ============================================================
// MENU ITEM COMPONENT
// ============================================================

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  soleilMode,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  soleilMode: boolean
}) {
  return (
    <Card
      className="cursor-pointer active:scale-[0.98] transition-transform border-0 shadow-none hover:bg-muted/50"
      onClick={() => {
        haptic('light')
        onClick()
      }}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span
          className={cn(
            'flex-1 text-sm font-medium',
            danger ? 'text-destructive' : '',
            soleilMode && !danger ? 'text-black text-base' : ''
          )}
        >
          {label}
        </span>
        <ChevronRight className={cn('w-4 h-4', danger ? 'text-destructive' : 'text-muted-foreground')} />
      </CardContent>
    </Card>
  )
}

// ============================================================
// SECTION HEADER
// ============================================================

function SectionHeader({ children }: { children: string }) {
  return (
    <>
      <Separator className="my-2" />
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider px-1 mt-2 mb-1">
        {children}
      </p>
    </>
  )
}

// ============================================================
// SUB-SCREEN: INFORMATIONS
// ============================================================

function InformationsSubScreen({
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
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
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

// ============================================================
// SUB-SCREEN: SÉCURITÉ
// ============================================================

function SecuriteSubScreen({
  profile,
  setProfile,
  phone,
  soleilMode,
  onBack,
}: {
  profile: MerchantProfile
  setProfile: (p: MerchantProfile) => void
  phone: string
  soleilMode: boolean
  onBack: () => void
}) {
  const [pinStep, setPinStep] = useState<'idle' | 'old' | 'new' | 'confirm'>('idle')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPinVal, setConfirmPinVal] = useState('')
  const [error, setError] = useState('')

  const [authData] = useState(() => loadMerchantAuthData(phone))
  const authMethod = authData?.authMethod || 'pin'

  const handlePinDigit = (digit: string) => {
    if (pinStep === 'old') {
      if (pin.length < 4) {
        const next = pin + digit
        setPin(next)
        if (next.length === 4) {
          // Verify old PIN
          const merchantRaw = localStorage.getItem(`julaba-merchant-${phone}`)
          if (merchantRaw) {
            const merchant = JSON.parse(merchantRaw)
            const simpleHash = (str: string) => {
              let hash = 0
              for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i)
                hash = ((hash << 5) - hash) + char
                hash |= 0
              }
              return hash.toString()
            }
            if (simpleHash(next) === merchant.pinHash) {
              setPinStep('new')
              setError('')
            } else {
              setError('Code incorrect')
              setPin('')
              tataSpeak('Code incorrect')
              haptic('error')
            }
          }
        }
      }
    } else if (pinStep === 'new') {
      if (newPin.length < 4) {
        const next = newPin + digit
        setNewPin(next)
        if (next.length === 4) {
          setPinStep('confirm')
        }
      }
    } else if (pinStep === 'confirm') {
      if (confirmPinVal.length < 4) {
        const next = confirmPinVal + digit
        setConfirmPinVal(next)
        if (next.length === 4) {
          if (next === newPin) {
            // Save new PIN
            const merchantRaw = localStorage.getItem(`julaba-merchant-${phone}`)
            if (merchantRaw) {
              const merchant = JSON.parse(merchantRaw)
              const simpleHash = (str: string) => {
                let hash = 0
                for (let i = 0; i < str.length; i++) {
                  const char = str.charCodeAt(i)
                  hash = ((hash << 5) - hash) + char
                  hash |= 0
                }
                return hash.toString()
              }
              merchant.pinHash = simpleHash(next)
              localStorage.setItem(`julaba-merchant-${phone}`, JSON.stringify(merchant))
              // Add to connection history
              const updatedProfile = {
                ...profile,
                connectionHistory: [
                  { date: new Date().toISOString(), method: 'Changement PIN' },
                  ...profile.connectionHistory,
                ].slice(0, 5),
              }
              setProfile(updatedProfile)
              tataSpeak('Ton nouveau code est enregistré !')
              haptic('success')
              setPinStep('idle')
              setPin('')
              setNewPin('')
              setConfirmPinVal('')
              setError('')
            }
          } else {
            setError('Les codes ne correspondent pas')
            setConfirmPinVal('')
            setPinStep('new')
            tataSpeak('Les codes ne correspondent pas')
            haptic('error')
          }
        }
      }
    }
  }

  const handlePinDelete = () => {
    if (pinStep === 'old') setPin((p) => p.slice(0, -1))
    else if (pinStep === 'new') setNewPin((p) => p.slice(0, -1))
    else if (pinStep === 'confirm') setConfirmPinVal((p) => p.slice(0, -1))
  }

  const currentPin = pinStep === 'old' ? pin : pinStep === 'new' ? newPin : confirmPinVal

  const pinLabels: Record<string, string> = {
    idle: '',
    old: 'Entrez votre code actuel',
    new: 'Entrez le nouveau code',
    confirm: 'Confirmez le nouveau code',
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Sécurité & Connexion</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Current auth method */}
        <Card>
          <CardContent className="p-4">
            <p className={cn('text-xs text-muted-foreground mb-1', tc)}>Méthode de connexion</p>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#C66A2C]/10 text-[#C66A2C] border-0">
                {authMethod === 'pin' ? 'Code PIN' : authMethod === 'pattern' ? 'Motif' : 'PIN + Motif'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Change PIN */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Changer mon code PIN</span>
              </div>
              {pinStep === 'idle' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { haptic('light'); setPinStep('old'); setError(''); setPin(''); setNewPin(''); setConfirmPinVal('') }}
                >
                  Modifier
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { haptic('light'); setPinStep('idle'); setPin(''); setNewPin(''); setConfirmPinVal(''); setError('') }}
                >
                  Annuler
                </Button>
              )}
            </div>

            {pinStep !== 'idle' && (
              <div className="mt-4 space-y-4">
                <p className={cn('text-sm text-center font-medium', tc)}>{pinLabels[pinStep]}</p>

                {/* PIN dots */}
                <div className="flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all',
                        i < currentPin.length
                          ? 'bg-[#C66A2C] border-[#C66A2C]'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {i < currentPin.length && <div className="w-3 h-3 rounded-full bg-white" />}
                    </div>
                  ))}
                </div>

                {error && (
                  <p className="text-destructive text-sm text-center">{error}</p>
                )}

                {/* Numeric keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      className={cn('h-12 text-lg font-semibold', soleilMode && 'text-base')}
                      onClick={() => handlePinDigit(d)}
                    >
                      {d}
                    </Button>
                  ))}
                  <Button variant="ghost" className="h-12" onClick={handlePinDelete} aria-label="Effacer">
                    <Delete className="size-5" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 text-lg font-semibold"
                    onClick={() => handlePinDigit('0')}
                  >
                    0
                  </Button>
                  <div className="h-12" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connection history */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className={cn('text-sm font-medium', tc)}>Historique des connexions</p>
            </div>
            {profile.connectionHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Aucun historique</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {profile.connectionHistory.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={tc}>{entry.method}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(entry.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// SUB-SCREEN: COMMERCE
// ============================================================

function CommerceSubScreen({
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
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
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

// Sous-écran « Voix & Langue » — extrait vers le composant partagé
// src/components/shared/voix-settings.tsx (NORM-301 : les deux espaces
// marchand/producteur rendent exactement les mêmes cartes ; le marchand
// ajoute la carte « Confirmation vocale » (concerne les ventes) et le
// mode soleil).

// ============================================================
// SUB-SCREEN: AFFICHAGE
// ============================================================

function AffichageSubScreen({
  profile,
  setProfile,
  darkMode,
  soleilMode,
  onBack,
}: {
  profile: MerchantProfile
  setProfile: (p: MerchantProfile) => void
  darkMode: boolean
  soleilMode: boolean
  onBack: () => void
}) {
  const { toggleSoleil, toggleDarkMode } = useAppStore()
  const theme = darkMode ? 'sombre' : 'clair'

  const handleTextSizeChange = (value: number[]) => {
    const textSize = value[0]
    const updated = {
      ...profile,
      preferences: { ...profile.preferences, textSize },
    }
    setProfile(updated)
    // Apply zoom to root element
    document.documentElement.style.setProperty('--julaba-zoom', textSize.toString())
  }

  const handleThemeChange = (value: string) => {
    if (value === 'sombre' && !darkMode) toggleDarkMode()
    if (value === 'clair' && darkMode) toggleDarkMode()
    haptic('light')
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Affichage</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-6">
        {/* Text size */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm font-medium', tc)}>Taille du texte <span className="text-xs text-muted-foreground">(bientôt)</span></span>
              </div>
              <span className="text-sm text-muted-foreground">{profile.preferences.textSize.toFixed(1)}x</span>
            </div>
            <Slider
              value={[profile.preferences.textSize]}
              onValueChange={handleTextSizeChange}
              min={0.8}
              max={2.0}
              step={0.1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Petit</span>
              <span>Grand</span>
            </div>
          </CardContent>
        </Card>

        {/* Soleil mode */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className={cn('text-sm font-medium', tc)}>Mode Soleil</span>
                  <p className="text-xs text-muted-foreground">Contraste élevé pour l'extérieur</p>
                </div>
              </div>
              <Switch checked={soleilMode} onCheckedChange={toggleSoleil} />
            </div>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <span className={cn('text-sm font-medium', tc)}>Thème</span>
            <RadioGroup value={theme} onValueChange={handleThemeChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="clair" id="theme-clair" />
                <Label htmlFor="theme-clair" className={cn(tc, 'flex items-center gap-1.5')}><Sun className="size-4" /> Clair</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sombre" id="theme-sombre" />
                <Label htmlFor="theme-sombre" className={cn(tc, 'flex items-center gap-1.5')}><Moon className="size-4" /> Sombre</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="auto" id="theme-auto" disabled />
                <Label htmlFor="theme-auto" className={cn(tc, 'flex items-center gap-1.5 text-muted-foreground')}><RefreshCw className="size-4" /> Auto (bientôt)</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// SUB-SCREEN: NOTIFICATIONS
// ============================================================

// Only categories that actually gate a real notification (see
// src/lib/notification-preferences.ts) belong here — this used to list 8
// categories (ventes, stockBas, objectifs, promotions, academy…) that no
// notification ever existed for, so toggling them silently did nothing.
function NotificationsSubScreen({
  soleilMode,
  onBack,
}: {
  soleilMode: boolean
  onBack: () => void
}) {
  // Task 28 : préférences de notifications enrichies (une préférence par
  // catégorie : tout / important / jamais + toasts + historique + mode
  // silencieux), composant partagé avec l'espace producteur. Les anciennes
  // clés du profil marchand (tontines/systeme) sont reprises par la
  // migration v2 de notification-preferences.ts.
  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Notifications</h1>
        </div>
      </div>

      <div className="px-4 mt-4 pb-4">
        <NotificationPreferencesScreen accentColor="#C66A2C" onBack={onBack} />
      </div>
    </div>
  )
}

// ============================================================
// SUB-SCREEN: FAQ & AIDE
// ============================================================

function FaqSubScreen({
  soleilMode,
  onBack,
}: {
  soleilMode: boolean
  onBack: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = FAQ_ITEMS.filter(
    (item) =>
      item.q.toLowerCase().includes(search.toLowerCase()) ||
      item.a.toLowerCase().includes(search.toLowerCase())
  )

  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>FAQ & Aide</h1>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-9"
            style={soleilMode ? { fontSize: '16px' } : {}}
          />
        </div>

        {/* FAQ Accordion */}
        <Accordion type="single" collapsible className="space-y-1">
          {filtered.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className={cn('text-sm', tc)}>{item.q}</AccordionTrigger>
              <AccordionContent>
                <p className={cn('text-sm text-muted-foreground leading-relaxed', soleilMode && 'text-base')}>{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun résultat pour &quot;{search}&quot;
            </p>
          )}
        </Accordion>

        <Separator className="my-2" />

        {/* Contact section */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className={cn('text-sm font-semibold', tc)}>Nous contacter</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-[#C66A2C]" />
                <span className={tc}>+225 01 02 03 04</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MessageCircle className="w-4 h-4 text-[#C66A2C]" />
                <span className={tc}>WhatsApp: +225 01 02 03 04</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-[#C66A2C]" />
                <span className={tc}>support@julaba.ci</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// SUB-SCREEN: À PROPOS
// ============================================================

function AproposSubScreen({
  soleilMode,
  onBack,
}: {
  soleilMode: boolean
  onBack: () => void
}) {
  const tc = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>À propos de Jùlaba</h1>
        </div>
      </div>

      <div className="px-4 mt-6 flex flex-col items-center space-y-4">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg">
          <img src="/icon-only.png" alt="Jùlaba" className="w-full h-full object-contain" />
        </div>

        <div className="text-center">
          <h2 className={cn('text-lg font-bold', tc)}>Jùlaba</h2>
          <p className="text-sm text-muted-foreground">v2.0.0</p>
          <p className={cn('text-sm mt-1 italic', tc)}>Le commerce à portée de voix</p>
        </div>

        <Separator className="w-full my-2" />

        {/* Legal links */}
        <Card className="w-full">
          <CardContent className="p-0">
            {[
              { label: 'Conditions d\'utilisation', icon: BookOpen },
              { label: 'Politique de confidentialité', icon: Shield },
              { label: 'Licences open source', icon: Info },
            ].map((item) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 active:scale-[0.98] transition-transform"
                onClick={() => haptic('light')}
              >
                <item.icon className="w-4 h-4 text-muted-foreground" />
                <span className={cn('text-sm flex-1', tc)}>{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-4 flex items-center justify-center gap-1">
          © {new Date().getFullYear()} Jùlaba — Fait avec <Heart className="size-3 fill-current text-[#C66A2C]" /> en Côte d'Ivoire
        </p>
      </div>
    </div>
  )
}

// ============================================================
// MAIN PROFIL SCREEN
// ============================================================

export function ProfilScreen() {
  const {
    darkMode,
    soleilMode,
    goBack,
    merchantName,
    merchantPhone,
    navigate,
    logout,
  } = useAppStore()

  const [subScreen, setSubScreen] = useState<SubScreen>(null)
  const initialized = useRef(false)
  const profileRef = useRef<MerchantProfile>(defaultProfile)
  const [profile, setProfileState] = useState<MerchantProfile>(defaultProfile)

  // Load profile once when merchantPhone is available
  useEffect(() => {
    if (!merchantPhone || initialized.current) return
    initialized.current = true
    const loaded = loadMerchantProfile(merchantPhone)
    // Seed firstName from store if profile is fresh
    if (!loaded.firstName && merchantName) {
      loaded.firstName = merchantName
    }
    profileRef.current = loaded
    // Use rAF to defer setState out of effect sync
    requestAnimationFrame(() => {
      setProfileState(loaded)
    })
  }, [merchantPhone])

  const setProfile = useCallback(
    (updated: MerchantProfile) => {
      setProfileState(updated)
      if (merchantPhone) {
        saveMerchantProfile(merchantPhone, updated)
      }
    },
    [merchantPhone]
  )

  const handleLogout = () => {
    tataSpeak('À bientôt !')
    haptic('medium')
    // Logout ciblé : on ne purge que CE compte (cache unifié multiUser) —
    // les autres comptes enregistrés sur l'appareil restent connectables
    // hors ligne.
    cleanupMerchantData(merchantPhone || undefined)
    logout()
  }

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDeleteAccount = () => {
    cleanupAllData()
    haptic('heavy')
    logout()
  }

  const handlePhotoUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (file.size > 500 * 1024) {
        tataSpeak('Photo trop lourde. Choisissez une image de moins de 500 Ko.')
        haptic('error')
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        setProfile({ ...profile, photoDataUrl: dataUrl })
        haptic('success')
        tataSpeak('Belle photo !')
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleSubScreenOpen = (screen: SubScreen) => {
    haptic('light')
    setSubScreen(screen)
    const phrases: Record<string, string> = {
      informations: 'Tu peux modifier tes informations ici.',
      securite: 'Gère la sécurité de ton compte.',
      commerce: 'Modifie les informations de ton commerce.',
      voix: 'Paramètres de la voix et du langage.',
      affichage: 'Ajuste l\'affichage à ta convenance.',
      notifications: 'Choisis tes notifications.',
      faq: 'Trouve les réponses à tes questions.',
      apropos: 'À propos de Jùlaba.',
    }
    if (screen && phrases[screen]) {
      tataSpeak(phrases[screen])
    }
  }

  const tc = soleilMode ? 'text-black' : ''

  // Derive display values
  const displayName =
    profile.firstName || merchantName || 'Marchand Jùlaba'
  const initials = (
    (profile.firstName?.[0] || merchantName?.[0] || '') + (profile.lastName?.[0] || '')
  ).toUpperCase() || 'J'
  const displayPhone = merchantPhone
    ? (() => {
        const digits = merchantPhone.replace(/[^\d]/g, '')
        if (digits.length === 10) {
          return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '+225 $1 $2 $3 $4 $5')
        }
        return merchantPhone
      })()
    : ''
  const memberSince = profile.memberSince
    ? new Date(profile.memberSince).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
      })
    : 'Récente'

  // Render sub-screens
  if (subScreen === 'informations') {
    return (
      <InformationsSubScreen
        profile={profile}
        setProfile={setProfile}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'securite') {
    return (
      <SecuriteSubScreen
        profile={profile}
        setProfile={setProfile}
        phone={merchantPhone || ''}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'commerce') {
    return (
      <CommerceSubScreen
        profile={profile}
        setProfile={setProfile}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'voix') {
    return (
      <VoixSettings
        title="Voix & Langue"
        soleilMode={soleilMode}
        showConfirmation
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'affichage') {
    return (
      <AffichageSubScreen
        profile={profile}
        setProfile={setProfile}
        darkMode={darkMode}
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'notifications') {
    return (
      <NotificationsSubScreen
        soleilMode={soleilMode}
        onBack={() => setSubScreen(null)}
      />
    )
  }
  if (subScreen === 'faq') {
    return <FaqSubScreen soleilMode={soleilMode} onBack={() => setSubScreen(null)} />
  }
  if (subScreen === 'apropos') {
    return <AproposSubScreen soleilMode={soleilMode} onBack={() => setSubScreen(null)} />
  }

  // Main profile screen
  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); goBack() }} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>PROFIL</h1>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        {/* Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center">
              {/* Avatar */}
              <div className="relative">
                {profile.photoDataUrl ? (
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#C66A2C]/30">
                    <img
                      src={profile.photoDataUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[#C66A2C]/10 flex items-center justify-center border-2 border-[#C66A2C]/30">
                    <span className="text-2xl font-bold text-[#C66A2C]">{initials}</span>
                  </div>
                )}
                <button
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#C66A2C] text-white flex items-center justify-center shadow-md active:scale-95 transition-transform after:absolute after:-inset-2 after:content-['']"
                  onClick={handlePhotoUpload}
                  aria-label="Changer la photo de profil"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <h2 className={cn('text-lg font-bold mt-3', soleilMode && 'text-xl text-black')}>
                {displayName}
              </h2>

              {displayPhone && (
                <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <span className={cn('text-sm', soleilMode && 'text-base')}>{displayPhone}</span>
                </div>
              )}

              {profile.market && (
                <p className={cn('text-sm text-muted-foreground mt-0.5', soleilMode && 'text-base')}>{profile.market}</p>
              )}

              {profile.activity && (
                <Badge className="mt-2 bg-[#C66A2C]/10 text-[#C66A2C] border-0">
                  {profile.activity}
                </Badge>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-4">
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-[#C66A2C]" />
                    <span className={cn('text-sm font-bold', tc)}>{profile.score}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Points fidélité</p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div className="text-center">
                  <p className={cn('text-sm font-medium', tc)}>{memberSince}</p>
                  <p className="text-xs text-muted-foreground">Membre depuis</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MON COMPTE section */}
        <SectionHeader>Mon compte</SectionHeader>

        <MenuItem
          icon={<User className="w-5 h-5 text-[#C66A2C]" />}
          label="Mes informations"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('informations')}
        />
        <MenuItem
          icon={<Shield className="w-5 h-5 text-[#C66A2C]" />}
          label="Sécurité & Connexion"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('securite')}
        />
        <MenuItem
          icon={<Store className="w-5 h-5 text-[#C66A2C]" />}
          label="Mon commerce"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('commerce')}
        />

        {/* PRÉFÉRENCES section */}
        <SectionHeader>Préférences</SectionHeader>

        <MenuItem
          icon={<Mic className="w-5 h-5 text-[#C66A2C]" />}
          label="Voix & Langue"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('voix')}
        />
        <MenuItem
          icon={<Sun className="w-5 h-5 text-[#C66A2C]" />}
          label="Affichage"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('affichage')}
        />
        <MenuItem
          icon={<Bell className="w-5 h-5 text-[#C66A2C]" />}
          label="Notifications"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('notifications')}
        />

        {/* AIDE & SUPPORT section */}
        <SectionHeader>Aide & Support</SectionHeader>

        <MenuItem
          icon={<GraduationCap className="w-5 h-5 text-[#C66A2C]" />}
          label="Academy"
          soleilMode={soleilMode}
          onClick={() => navigate('academy')}
        />
        <MenuItem
          icon={<CircleHelp className="w-5 h-5 text-[#C66A2C]" />}
          label="FAQ & Aide"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('faq')}
        />
        <MenuItem
          icon={<BookOpen className="w-5 h-5 text-[#C66A2C]" />}
          label="À propos de Jùlaba"
          soleilMode={soleilMode}
          onClick={() => handleSubScreenOpen('apropos')}
        />

        <Separator className="my-2" />

        {/* Bottom actions */}
        <MenuItem
          icon={<LogOut className="w-5 h-5 text-muted-foreground" />}
          label="Déconnexion"
          soleilMode={soleilMode}
          onClick={() => setShowLogoutConfirm(true)}
        />
        <MenuItem
          icon={<Trash2 className="w-5 h-5" />}
          label="Supprimer mon compte"
          soleilMode={soleilMode}
          danger
          onClick={handleDeleteAccount}
        />

        {/* Modale de confirmation de déconnexion */}
        <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <AlertDialogContent className="max-w-xs">
            <AlertDialogHeader className="items-center text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-1 bg-red-500/10">
                <LogOut className="w-7 h-7 text-red-600" />
              </div>
              <AlertDialogTitle className="text-base">Se déconnecter ?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                Vous pourrez vous reconnecter à tout moment avec votre numéro et votre code secret. Vos données restent enregistrées sur cet appareil.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
              <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="flex-1 bg-red-500 text-white hover:bg-red-600"
                onClick={() => { setShowLogoutConfirm(false); handleLogout() }}
              >
                Se déconnecter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {showDeleteConfirm && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 space-y-3">
              <p className={cn('text-sm font-medium text-destructive', soleilMode && 'text-base')}>
                Êtes-vous sûre de vouloir supprimer votre compte ? Toutes vos données seront perdues.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={confirmDeleteAccount}
                >
                  Oui, supprimer
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
