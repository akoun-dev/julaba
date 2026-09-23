"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, ChevronRight, BookOpen, Shield, Info, Heart } from 'lucide-react'
import { haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN: À PROPOS
// ============================================================

export function AproposSubScreen({
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
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
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
