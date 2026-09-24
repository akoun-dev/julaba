"use client"

import { Building2, Mail, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const PARTNERS = [
  { name: 'ANSUT', src: '/assets/logo-ansut.png' },
  { name: 'DGE', src: '/assets/logo-dge.png' },
] as const

export function ActorProfileFooter({
  accentColor = '#C66A2C',
  onSupport,
}: {
  accentColor?: string
  onSupport: () => void
}) {
  return (
    <section className="px-4 mt-8 pb-[calc(7rem+env(safe-area-inset-bottom))]" aria-label="Support et partenaires JùLABA">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4" style={{ color: accentColor }} />
        <h2 className="text-sm font-semibold">Partenaires institutionnels</h2>
      </div>
        <Card className="mt-6">
          <CardContent>
            <h2 className="font-semibold">Support & Aide JÙLABA</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Une question ou un problème ? L'équipe JùLABA peut vous accompagner.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button variant="outline" className="h-11" onClick={() => { window.location.href = 'mailto:support@julaba.ci' }}>
                <Mail className="w-4 h-4 mr-2" />
                Nous contacter
              </Button>
              <Button className="h-11 text-white" style={{ backgroundColor: accentColor }} onClick={onSupport}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau ticket
              </Button>
            </div>
          </CardContent>
        </Card>
      <div className="grid grid-cols-2 gap-3 mt-3">
        {PARTNERS.map((partner) => (
          <Card key={partner.name}>
            <CardContent className="h-24 p-3 flex items-center justify-center">
              <img
                src={partner.src}
                alt={partner.name}
                className="max-h-14 max-w-[135px] object-contain"
                loading="lazy"
              />
            </CardContent>
          </Card>
        ))}
      </div>


    </section>
  )
}
