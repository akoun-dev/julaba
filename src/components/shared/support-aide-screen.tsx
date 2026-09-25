"use client"

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Mail, Phone, Plus, Send, Ticket, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AppEmpty } from '@/components/shared/app-states'

type TicketItem = {
  id: string
  subject: string
  category: string
  description: string
  createdAt: string
  status: 'à envoyer' | 'envoyé'
}

const STORAGE_KEY = 'julaba-support-tickets-v1'
const SUPPORT_EMAIL = 'support@julaba.ci'

const PARTNERS = [
  { name: 'ANSUT', src: '/assets/logo-ansut.png', kind: 'institution' },
  { name: 'DGE', src: '/assets/logo-dge.png', kind: 'institution' },
  { name: 'MTN', src: '/assets/logo-mtn.png', kind: 'partenaire' },
  { name: 'Orange Money', src: '/assets/logo-orange-money.png', kind: 'partenaire' },
  { name: 'Moov', src: '/assets/logo-moov.png', kind: 'partenaire' },
  { name: 'Wave', src: '/assets/logo-wave.png', kind: 'partenaire' },
] as const

function loadTickets(): TicketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveTickets(items: TicketItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Le support reste utilisable même si le stockage local est indisponible.
  }
}

export function SupportAideScreen({
  onBack,
  accentColor = '#C66A2C',
  soleilMode = false,
  actorLabel = 'acteur Jùlaba',
}: {
  onBack: () => void
  accentColor?: string
  soleilMode?: boolean
  actorLabel?: string
}) {
  const [view, setView] = useState<'home' | 'ticket' | 'tickets'>('home')
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('application')
  const [description, setDescription] = useState('')
  const [sentId, setSentId] = useState<string | null>(null)

  useEffect(() => setTickets(loadTickets()), [])

  const canSubmit = subject.trim().length >= 3 && description.trim().length >= 10

  const categories = useMemo(() => [
    ['application', 'Application'],
    ['compte', 'Compte & connexion'],
    ['vente', 'Vente & caisse'],
    ['stock', 'Stock'],
    ['paiement', 'Paiement'],
    ['vocal', 'Tata / vocal'],
    ['autre', 'Autre'],
  ], [])

  const openNewTicket = () => {
    setSubject('')
    setDescription('')
    setCategory('application')
    setSentId(null)
    setView('ticket')
  }

  const submitTicket = () => {
    if (!canSubmit) return

    const id = `JULABA-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const item: TicketItem = {
      id,
      subject: subject.trim(),
      category,
      description: description.trim(),
      createdAt: new Date().toISOString(),
      status: 'à envoyer',
    }

    const next = [item, ...tickets]
    setTickets(next)
    saveTickets(next)
    setSentId(id)

    const categoryLabel = categories.find(([value]) => value === category)?.[1] ?? category
    const body = [
      `Bonjour l'équipe JùLABA,`,
      '',
      `Ticket : ${id}`,
      `Profil : ${actorLabel}`,
      `Catégorie : ${categoryLabel}`,
      `Sujet : ${item.subject}`,
      '',
      item.description,
      '',
      'Merci.',
    ].join('\n')

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${id}] ${item.subject}`)}&body=${encodeURIComponent(body)}`
  }

  if (view === 'ticket') {
    return (
      <div className="screen-enter min-h-full pb-8">
        <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setView('home')} aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">Nouveau ticket</h1>
            <p className="text-xs text-muted-foreground">Décrivez votre problème à l'équipe JùLABA.</p>
          </div>
        </header>

        <div className="px-4 mt-5 space-y-4">
          {sentId && (
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
              <CardContent className="p-4">
                <p className="font-semibold text-sm">Ticket créé : {sentId}</p>
                <p className="text-xs text-muted-foreground mt-1">Votre messagerie va s'ouvrir pour envoyer la demande au support.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Sujet</label>
                <Input className="mt-1.5 h-11" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Je n'arrive pas à enregistrer une vente" />
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea className="mt-1.5 min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Expliquez ce qui s'est passé..." />
              </div>
              <Button className="w-full h-12 text-white" style={{ backgroundColor: accentColor }} disabled={!canSubmit} onClick={submitTicket}>
                <Send className="w-4 h-4 mr-2" /> Envoyer le ticket
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (view === 'tickets') {
    return (
      <div className="screen-enter min-h-full pb-8">
        <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setView('home')} aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">Mes tickets</h1>
            <p className="text-xs text-muted-foreground">{tickets.length} demande{tickets.length > 1 ? 's' : ''}</p>
          </div>
        </header>
        <div className="px-4 mt-5 space-y-3">
          {tickets.length === 0 ? (
            // MODE-1008 : AppEmpty (miroir BoEmptyState), textes inchangés.
            <Card><CardContent className="p-0">
              <AppEmpty
                icon={Ticket}
                title="Aucun ticket"
                description="Vos demandes au support apparaîtront ici."
                soleilMode={soleilMode}
                className="py-6"
              />
            </CardContent></Card>
          ) : tickets.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Ticket className="w-5 h-5 mt-0.5 shrink-0" style={{ color: accentColor }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{item.subject}</p>
                      <Badge variant="secondary" className="shrink-0">{item.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.id} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}</p>
                    <p className="text-sm mt-2 line-clamp-3">{item.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" className="w-full h-11" onClick={openNewTicket}><Plus className="w-4 h-4 mr-2" /> Nouveau ticket</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen-enter min-h-full pb-8">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onBack} aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className={cn('font-bold text-lg', soleilMode && 'text-xl')}>Support & Aide JÙLABA</h1>
          <p className="text-xs text-muted-foreground">Nous sommes là pour vous accompagner.</p>
        </div>
      </header>

      <div className="px-4 mt-5 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}` }}>
            <CardContent className="p-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-orange-50 dark:bg-orange-950/20 mb-3">
                <Mail className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <p className="font-semibold text-sm">Nous contacter</p>
              <p className="text-xs text-muted-foreground mt-1">Email du support</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={openNewTicket}>
            <CardContent className="p-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-orange-50 dark:bg-orange-950/20 mb-3">
                <Plus className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <p className="font-semibold text-sm">Nouveau ticket</p>
              <p className="text-xs text-muted-foreground mt-1">Signaler un problème</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5" style={{ color: accentColor }} />
              <div><p className="text-sm font-medium">Email</p><p className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</p></div>
            </div>
            <Button variant="outline" className="w-full h-11" onClick={() => setView('tickets')}>
              <Ticket className="w-4 h-4 mr-2" /> Mes tickets <ChevronRight className="w-4 h-4 ml-auto" />
            </Button>
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4" style={{ color: accentColor }} />
            <h2 className="font-semibold">Partenaires institutionnels</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PARTNERS.filter((p) => p.kind === 'institution').map((partner) => (
              <Card key={partner.name}>
                <CardContent className="h-24 p-4 flex items-center justify-center">
                  <img src={partner.src} alt={partner.name} className="max-h-14 max-w-[130px] object-contain" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Partenaires JÙLABA</h2>
          <div className="grid grid-cols-2 gap-3">
            {PARTNERS.filter((p) => p.kind === 'partenaire').map((partner) => (
              <Card key={partner.name}>
                <CardContent className="h-20 p-3 flex items-center justify-center">
                  <img src={partner.src} alt={partner.name} className="max-h-10 max-w-[120px] object-contain" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground px-4">
          Pour une réponse rapide, indiquez votre problème avec le plus de détails possible.
        </p>
      </div>
    </div>
  )
}
