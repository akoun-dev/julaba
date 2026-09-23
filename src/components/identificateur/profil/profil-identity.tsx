/**
 * MODE-998 (DET-001 tranche 10) — en-tête de profil + cartes d'informations
 * de ident-profil-screen.tsx, déplacés VERBATIM (DOM inchangé, props de
 * mêmes noms).
 */
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { User, MapPin, Store, Shield, Info, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoRow, IDENT_COLOR } from './profil-parts'

interface ProfilIdentityProps {
  merchantName: string | null
  initials: string
  maskedPhone: string
  agentCode: string | null
  identDarkMode: boolean
  textClass: string
  mutedTextClass: string
  cardClass: string
  soleilMode: boolean
  agentZone: string
  agentMarche: string
  truncatedId: string
  memberSince: string
}

export function ProfilIdentity({ merchantName, initials, maskedPhone, agentCode, identDarkMode, textClass, mutedTextClass, cardClass, soleilMode, agentZone, agentMarche, truncatedId, memberSince }: ProfilIdentityProps) {
  return (
    <>
      {/* ─── Profile header ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center mt-6 mb-2 px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-3"
          style={{ backgroundColor: IDENT_COLOR }}
        >
          {initials}
        </div>
        <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-xl')}>
          {merchantName || 'Agent'}
        </p>
        <p className={cn('text-sm mt-0.5', mutedTextClass, soleilMode && 'text-base')}>
          <Phone className="mr-1 inline size-3.5" /> {maskedPhone}
        </p>
        {agentCode && (
          <p
            className="mt-1.5 rounded-full bg-[#F5F0EB] px-3 py-1 font-mono text-[11px] font-bold tracking-widest text-[#6B584C]"
            style={identDarkMode ? { backgroundColor: '#292524', color: '#d6d3d1' } : undefined}
            title="Code agent unique attribué par le back-office"
          >
            {agentCode}
          </p>
        )}
      </div>

      {/* ─── Info cards ───────────────────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <Card className={cardClass}>
          <CardContent className="p-4">
            <InfoRow icon={Shield} label="Agent ID" value={truncatedId} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <InfoRow icon={MapPin} label="Zone" value={agentZone} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <InfoRow icon={Store} label="Marché" value={agentMarche} soleilMode={soleilMode} darkMode={identDarkMode} />
            <Separator className="my-1" />
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <User className={cn('w-4 h-4', mutedTextClass)} />
                <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>Rôle</span>
              </div>
              <Badge className="shrink-0 rounded-full border-0 bg-[#F5F0EB] px-2.5 py-1 text-[11px] font-semibold text-[#6B584C]" style={identDarkMode ? { backgroundColor: '#292524', color: '#d6d3d1' } : undefined}>
                Identificateur
              </Badge>
            </div>
            <Separator className="my-1" />
            <InfoRow icon={Info} label="Membre depuis" value={memberSince} soleilMode={soleilMode} darkMode={identDarkMode} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
