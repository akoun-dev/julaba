'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, ShoppingCart, ShoppingBag, Wifi, WifiOff, GraduationCap,
  Heart, Shield, User, LogOut, Settings,
  Star, Clock, Users, Calendar, Trophy, Gift,
  Package, Truck, CheckCircle2, AlertCircle, Loader2,
  Award, Lock, CreditCard, Building2, Plus
} from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'

// ============================================================
// MARCHÉ SCREEN - Virtual marketplace
// ============================================================

const SUPPLIER_PRODUCTS = [
  { id: 'sp1', name: 'Tomates (caisse)', price: 12000, supplier: 'Ferme Awa', emoji: '🍅' },
  { id: 'sp2', name: 'Oignons (sac 50kg)', price: 25000, supplier: 'Coop Yamoussoukro', emoji: '🧅' },
  { id: 'sp3', name: 'Riz 25kg long grain', price: 18000, supplier: 'Dépôt Koffi', emoji: '🍚' },
  { id: 'sp4', name: 'Poulets vivants (lot 10)', price: 30000, supplier: 'Poulailler Adjame', emoji: '🍗' },
  { id: 'sp5', name: 'Huile de palme 5L', price: 6500, supplier: 'Huilerie Dabou', emoji: '🫒' },
  { id: 'sp6', name: 'Poisson fumé (carton)', price: 22000, supplier: 'Pêcheur Abidjan', emoji: '🐟' },
  { id: 'sp7', name: 'Ignames (tas)', price: 8000, supplier: 'Marché Bondoukou', emoji: '🥔' },
  { id: 'sp8', name: 'Arachides (sac 25kg)', price: 15000, supplier: 'Coop Korhogo', emoji: '🥜' },
]

export function MarcheScreen() {
  const { soleilMode, goBack, navigate } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Marché Jùlaba</h1>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
            En ligne
          </Badge>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Approvisionnez-vous auprès des meilleurs fournisseurs
        </p>
      </div>

      <div className="px-4 mt-4 space-y-2">
        {SUPPLIER_PRODUCTS.map(product => (
          <Card key={product.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FDF3ED] to-[#F5E6D5] flex items-center justify-center shrink-0">
                <span className="text-2xl">{product.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{product.name}</p>
                <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{product.supplier}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-[#C66A2C] fcfa">{formatFCFA(product.price)}</p>
                <Button size="sm" className="mt-1 h-7 text-[10px] bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                  disabled
                >
                  Commander
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Offline notice */}
      <div className="px-4 mt-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className={`text-sm font-medium text-amber-800 ${soleilMode ? 'text-base text-black' : ''}`}>Connexion internet requise</p>
              <p className={`text-xs text-amber-700 ${soleilMode ? 'text-base' : ''}`}>Connectez-vous pour commander auprès des fournisseurs</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// COMMANDES SCREEN - Orders tracking
// ============================================================

const MOCK_ORDERS = [
  {
    id: 'cmd1', supplier: 'Ferme Awa', items: 'Tomates (caisse) × 2', total: 24000,
    date: '2025-01-13', status: 'en cours' as const,
  },
  {
    id: 'cmd2', supplier: 'Dépôt Koffi', items: 'Riz 25kg × 3', total: 54000,
    date: '2025-01-12', status: 'livré' as const,
  },
  {
    id: 'cmd3', supplier: 'Poulailler Adjame', items: 'Poulets vivants (lot 10) × 1', total: 30000,
    date: '2025-01-14', status: 'en attente' as const,
  },
]

const STATUS_CONFIG = {
  'en attente': { color: 'bg-amber-100 text-amber-700', icon: Clock },
  'en cours': { color: 'bg-blue-100 text-blue-700', icon: Truck },
  'livré': { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
}

export function CommandesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Mes commandes</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>{MOCK_ORDERS.length} commande(s)</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {MOCK_ORDERS.map(order => {
          const status = STATUS_CONFIG[order.status]
          const StatusIcon = status.icon
          return (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{order.supplier}</p>
                    <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{order.items}</p>
                  </div>
                  <Badge className={`${status.color} border-0`}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {order.status}
                  </Badge>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{order.date}</span>
                  <span className="text-sm font-bold text-[#C66A2C] fcfa">{formatFCFA(order.total)}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}

        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className={soleilMode ? 'text-base' : ''}>Passez au Marché pour créer une commande</p>
          <Button variant="outline" className="mt-3" onClick={goBack}>Aller au Marché</Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// TONTINES SCREEN - Tontine management
// ============================================================

const MOCK_TONTINES = [
  {
    id: 't1', name: 'Tontine Femmes Yopougon', amount: 5000, members: 12, nextDue: '2025-01-20', role: 'Membre', cycle: 12,
  },
  {
    id: 't2', name: 'Tontine Marchands Cocody', amount: 10000, members: 8, nextDue: '2025-01-18', role: 'Organisateur', cycle: 8,
  },
]

export function TontinesScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  const handleCotiser = (tontine: typeof MOCK_TONTINES[0]) => {
    // TODO: implement actual cotisation recording
    tataSpeak(`Cotisation de ${formatFCFA(tontine.amount)} FCFA pour ${tontine.name}. Fonctionnalité à venir.`)
    haptic('light')
  }

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Tontines</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>Gérez vos tontines et cotisations</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {MOCK_TONTINES.map(tontine => (
          <Card key={tontine.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{tontine.name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">{tontine.role}</Badge>
                </div>
                <p className="text-lg font-bold text-[#C66A2C] fcfa">{formatFCFA(tontine.amount)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2">
                  <Users className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${soleilMode ? 'text-base' : ''}`}>{tontine.members} membres</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${soleilMode ? 'text-base' : ''}`}>Prochain: {tontine.nextDue}</span>
                </div>
              </div>
              <Button
                className="w-full mt-3 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={() => handleCotiser(tontine)}
              >
                Cotiser {formatFCFA(tontine.amount)}
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="text-center py-12 text-muted-foreground">
          <p className={soleilMode ? 'text-base' : ''}>Créez ou rejoignez une tontine pour commencer</p>
          <Button variant="outline" className="mt-3" disabled>
            <Plus className="w-4 h-4 mr-1" /> Créer une tontine
          </Button>
        </div>
      </div>
    </div>
  )
}



// ============================================================
// PROFIL SCREEN - Re-exported from dedicated module
// ============================================================

export { ProfilScreen } from './profile-screen'

// ============================================================
// KEIWA SCREEN - Digital wallet
// ============================================================

export function KeiwaScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Keiwa</h1>
          <Badge variant="secondary" className="text-[10px]">Portefeuille</Badge>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-8 pt-20">
        <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mb-6">
          <Wifi className="w-12 h-12 text-blue-400" />
        </div>
        <h2 className={soleilMode ? 'text-xl font-bold text-black mb-2' : 'text-lg font-bold mb-2'}>Connexion requise</h2>
        <p className={`text-sm text-muted-foreground text-center mb-6 ${soleilMode ? 'text-base' : ''}`}>
          Le portefeuille Keiwa nécessite une connexion internet active.
          Connectez-vous au Wi-Fi ou aux données mobiles pour accéder à vos
          paiements mobiles et soldes.
        </p>
        <Card className="w-full max-w-sm border-blue-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <WifiOff className="w-5 h-5 text-blue-500" />
              <div>
                <p className={`text-sm font-medium ${soleilMode ? 'text-base text-black' : ''}`}>État : Hors ligne</p>
                <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Vérifiez votre connexion</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <CreditCard className={`w-5 h-5 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
              <div>
                <p className={`text-sm font-medium ${soleilMode ? 'text-base text-black' : ''}`}>Mobile Money</p>
                <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Orange Money, MTN, Moov</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Lock className={`w-5 h-5 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
              <div>
                <p className={`text-sm font-medium ${soleilMode ? 'text-base text-black' : ''}`}>Transactions sécurisées</p>
                <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>Chiffrement de bout en bout</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// ACADEMY SCREEN - Training courses
// ============================================================

const MOCK_COURSES = [
  {
    id: 'c1', title: 'Gérer son stock efficacement', progress: 75, duration: '15 min',
    description: 'Apprenez les bases de la gestion de stock pour éviter les pertes et les ruptures.',
  },
  {
    id: 'c2', title: 'Fixer les bons prix', progress: 30, duration: '20 min',
    description: 'Découvrez comment calculer vos marges et fixer des prix compétitifs.',
  },
  {
    id: 'c3', title: 'Comprendre ses finances', progress: 0, duration: '25 min',
    description: 'Maîtrisez les bases de la comptabilité pour votre petit commerce.',
  },
  {
    id: 'c4', title: 'Fidéliser ses clients', progress: 100, duration: '10 min',
    description: 'Techniques simples pour fidéliser votre clientèle au quotidien.',
  },
]

export function AcademyScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  const handleStart = (course: typeof MOCK_COURSES[0]) => {
    if (course.progress === 100) {
      tataSpeak('Vous avez déjà terminé ce cours.')
      return
    }
    tataSpeak(`Cours : ${course.title}`)
    haptic('light')
  }

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Académie Jùlaba</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          Formations pour améliorer votre commerce
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {MOCK_COURSES.map(course => (
          <Card key={course.id} className="cursor-pointer active:scale-[0.99] transition-transform" onClick={() => handleStart(course)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#C66A2C]/10 flex items-center justify-center shrink-0">
                  {course.progress === 100 ? (
                    <Award className="w-6 h-6 text-[#C66A2C]" />
                  ) : course.progress > 0 ? (
                    <Loader2 className="w-6 h-6 text-[#C66A2C]" />
                  ) : (
                    <GraduationCap className="w-6 h-6 text-[#C66A2C]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{course.title}</p>
                    {course.progress === 100 && <Star className="w-4 h-4 text-amber-500 shrink-0" />}
                  </div>
                  <p className={`text-xs text-muted-foreground mt-0.5 line-clamp-2 ${soleilMode ? 'text-base' : ''}`}>{course.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className={`text-[10px] text-muted-foreground ${soleilMode ? 'text-sm' : ''}`}>{course.duration}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex justify-between mb-0.5">
                      <span className={`text-[10px] text-muted-foreground ${soleilMode ? 'text-sm' : ''}`}>
                        {course.progress === 100 ? 'Terminé' : course.progress > 0 ? 'En cours' : 'Non commencé'}
                      </span>
                      <span className={`text-[10px] text-muted-foreground font-medium ${soleilMode ? 'text-sm' : ''}`}>{course.progress}%</span>
                    </div>
                    <div className={`h-2 bg-muted rounded-full overflow-hidden ${soleilMode ? 'h-3' : ''}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          course.progress === 100 ? 'bg-green-500' : 'bg-[#C66A2C]'
                        }`}
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// FIDELITÉ SCREEN - Loyalty program
// ============================================================

const MOCK_REWARDS = [
  { id: 'r1', name: 'Réduction 5%', points: 500, icon: Gift, description: 'Sur votre prochain achat' },
  { id: 'r2', name: 'Sac Jùlaba', points: 1000, icon: ShoppingBag, description: 'Sac réutilisable imprimé' },
  { id: 'r3', name: 'Formation gratuite', points: 2000, icon: GraduationCap, description: '1 cours au choix' },
  { id: 'r4', name: 'Badge Marchand Pro', points: 5000, icon: Trophy, description: 'Badge et avantages exclusifs' },
]

export function FideliteScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''
  const currentPoints = 850

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Fidélité</h1>
        </div>
      </div>

      {/* Points card */}
      <div className="px-4 mt-4">
        <Card className="bg-gradient-to-br from-[#C66A2C] to-[#A85520] text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Vos points</p>
                <p className={`font-bold fcfa ${soleilMode ? 'text-4xl' : 'text-3xl'}`}>{currentPoints}</p>
                <p className="text-xs opacity-75 mt-1">10 FCFA = 1 point</p>
              </div>
              <Heart className="w-16 h-16 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rewards */}
      <div className="px-4 mt-4">
        <h3 className={`text-sm font-semibold text-muted-foreground mb-3 ${soleilMode ? 'text-base text-black' : ''}`}>
          Récompenses disponibles
        </h3>
        <div className="space-y-2">
          {MOCK_REWARDS.map(reward => {
            const Icon = reward.icon
            const canRedeem = currentPoints >= reward.points
            const progress = Math.min((currentPoints / reward.points) * 100, 100)
            return (
              <Card key={reward.id} className={canRedeem ? 'border-[#C66A2C]/30' : ''}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${canRedeem ? 'bg-[#C66A2C]/10' : 'bg-muted'}`}>
                    <Icon className={`w-5 h-5 ${canRedeem ? 'text-[#C66A2C]' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${soleilMode ? 'text-black text-base' : ''}`}>{reward.name}</p>
                    <p className={`text-xs text-muted-foreground ${soleilMode ? 'text-base' : ''}`}>{reward.description}</p>
                    <div className={`h-1.5 bg-muted rounded-full overflow-hidden mt-1.5 ${soleilMode ? 'h-2.5' : ''}`}>
                      <div
                        className={`h-full rounded-full ${canRedeem ? 'bg-green-500' : 'bg-[#C66A2C]'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${canRedeem ? 'text-green-600' : 'text-muted-foreground'} ${soleilMode ? 'text-base' : ''}`}>
                      {reward.points} pts
                    </p>
                    {canRedeem && (
                      <Button size="sm" disabled className="mt-1 h-6 text-[10px] bg-green-600 hover:bg-green-700 text-white opacity-70">
                        Bientôt
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PROTECTION SOCIALE SCREEN - CNPS/CMU info
// ============================================================

export function ProtectionSocialeScreen() {
  const { soleilMode, goBack } = useAppStore()
  const textClass = soleilMode ? 'text-black' : ''

  return (
    <div className="screen-enter pb-24">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9" aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Protection sociale</h1>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
          CNPS, CMU et assurances
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* CNPS Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CNPS - Caisse Nationale de Prévoyance Sociale</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CNPS vous protège en cas de maladie, de maternité, d'accident du travail et pour la retraite.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="secondary" className="text-[10px]">Maladie</Badge>
                  <Badge variant="secondary" className="text-[10px]">Maternité</Badge>
                  <Badge variant="secondary" className="text-[10px]">Retraite</Badge>
                  <Badge variant="secondary" className="text-[10px]">Accidents</Badge>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  En savoir plus
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMU Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className={`text-sm font-bold ${soleilMode ? 'text-black text-base' : ''}`}>CMU - Couverture Maladie Universelle</h3>
                <p className={`text-xs text-muted-foreground mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  La CMU permet l'accès aux soins de santé pour tous. Renseignez-vous dans votre centre de santé le plus proche.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Gratuit pour les indigents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <span className={`text-xs ${soleilMode ? 'text-base' : ''}`}>Famille couverte</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs" disabled>
                  Vérifier mon éligibilité
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className={`text-sm font-medium text-amber-800 ${soleilMode ? 'text-base text-black' : ''}`}>Information</p>
                <p className={`text-xs text-amber-700 mt-1 ${soleilMode ? 'text-base' : ''}`}>
                  Ces services nécessitent une connexion internet pour vérifier votre immatriculation et statut.
                  Rendez-vous à la CNPS ou à votre centre de santé pour plus d'informations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


