"use client"

// MODE-991 (DET-001 tranche 5) — blocs partagés de l'écran profil
// marchand, déplacés VERBATIM de profile-screen.tsx (preuve
// octet-pour-octet via le script de chirurgie persisté) ;
// comportement inchangé. Substitution documentée : déclarations
// « export »ées. Le type SubScreen nomme les routes internes du profil.
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ChevronRight } from 'lucide-react'
import { haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'

export type SubScreen =
  | null
  | 'informations'
  | 'securite'
  | 'commerce'
  | 'commune'
  | 'voix'
  | 'affichage'
  | 'notifications'
  | 'faq'
  | 'apropos'

export const FAQ_ITEMS = [
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

export function MenuItem({
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

export function SectionHeader({ children }: { children: string }) {
  return (
    <>
      <Separator className="my-2" />
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider px-1 mt-2 mb-1">
        {children}
      </p>
    </>
  )
}
