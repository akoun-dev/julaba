"use client"

// MODE-991 (DET-001 tranche 5) — bloc déplacé VERBATIM de
// profile-screen.tsx (preuve octet-pour-octet via le script de
// chirurgie persisté) ; comportement inchangé. Substitution
// documentée : déclaration « export »ée.
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { ArrowLeft, Search, Phone, MessageCircle, Mail } from 'lucide-react'
import { FAQ_ITEMS } from '@/components/marchand/profile/profile-parts'
import { haptic } from '@/lib/voice/tata-tts'
import { cn } from '@/lib/utils'

// ============================================================
// SUB-SCREEN: FAQ & AIDE
// ============================================================

export function FaqSubScreen({
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
          <Button variant="ghost" size="icon" onClick={() => { haptic('light'); onBack() }} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
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
