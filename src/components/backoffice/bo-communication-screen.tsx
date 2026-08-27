'use client'

import { useState, useMemo } from 'react'
import {
  MessageSquare,
  Send,
  Mail,
  Smartphone,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  Calendar,
  RefreshCw,
  Eye,
  DollarSign,
  Bell,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type CommChannel = 'sms' | 'push' | 'email'
type CommStatus = 'envoye' | 'en_cours' | 'echoue'
type DestType = 'all' | 'zone' | 'segment'
type ScheduleType = 'immediat' | 'planifie'

interface Communication {
  id: string
  channel: CommChannel
  destType: DestType
  destLabel: string
  subject?: string
  message: string
  status: CommStatus
  sentAt: string
  scheduledAt?: string
  totalRecipients: number
  delivered: number
  failed: number
  pending: number
}

// ============== MOCK DATA ==============

const INITIAL_COMMUNICATIONS: Communication[] = [
  { id: 'com-1', channel: 'sms', destType: 'zone', destLabel: 'Adjamé', message: 'Rappel : Vérifiez vos informations de profil avant le 31 août.', status: 'envoye', sentAt: '2026-08-27T14:00:00Z', totalRecipients: 1245, delivered: 1180, failed: 45, pending: 20 },
  { id: 'com-2', channel: 'push', destType: 'all', destLabel: 'Tous les acteurs', message: 'Nouvelle mise à jour disponible ! Découvrez les améliorations de la v2.5.', status: 'envoye', sentAt: '2026-08-27T10:00:00Z', totalRecipients: 8430, delivered: 8200, failed: 120, pending: 110 },
  { id: 'com-3', channel: 'email', destType: 'segment', destLabel: 'Marchands inactifs (>7j)', subject: 'Nous vous manquons !', message: 'Cher partenaire, nous avons remarqué que vous n\'avez pas utilisé la plateforme récemment...', status: 'en_cours', sentAt: '2026-08-27T15:00:00Z', totalRecipients: 560, delivered: 340, failed: 12, pending: 208 },
  { id: 'com-4', channel: 'sms', destType: 'all', destLabel: 'Tous les acteurs', message: 'Maintenance prévue ce soir de 22h à 23h.', status: 'echoue', sentAt: '2026-08-26T20:00:00Z', totalRecipients: 8430, delivered: 0, failed: 8430, pending: 0 },
  { id: 'com-5', channel: 'email', destType: 'zone', destLabel: 'Bouaké', subject: 'Formation Jùlaba', message: 'Invitation à la session de formation prévue le 5 septembre à la salle DGE.', status: 'envoye', sentAt: '2026-08-26T09:00:00Z', totalRecipients: 890, delivered: 856, failed: 8, pending: 26 },
  { id: 'com-6', channel: 'push', destType: 'segment', destLabel: 'Nouveaux inscrits (30j)', message: 'Bienvenue sur Jùlaba ! Découvrez nos fonctionnalités.', status: 'envoye', sentAt: '2026-08-25T11:00:00Z', totalRecipients: 345, delivered: 340, failed: 2, pending: 3 },
  { id: 'com-7', channel: 'sms', destType: 'zone', destLabel: 'Cocody', message: 'Votre relève de compteur est attendue avant le 30 août.', status: 'envoye', sentAt: '2026-08-24T08:00:00Z', totalRecipients: 670, delivered: 655, failed: 10, pending: 5 },
]

const ZONES = ['Adjamé', 'Cocody', 'Plateau', 'Yopougon', 'Abobo', 'Bouaké', 'Kong', 'Yamoussoukro', 'Daloa']
const SEGMENTS = ['Tous les acteurs', 'Marchands inactifs (>7j)', 'Nouveaux inscrits (30j)', 'Producteurs zone rurale', 'Coopératives', 'Hauts revenus']

const CHANNEL_CONFIG: Record<CommChannel, { label: string; icon: React.ReactNode; color: string }> = {
  sms: { label: 'SMS', icon: <Smartphone className="h-3.5 w-3.5" />, color: 'bg-emerald-100 text-emerald-700' },
  push: { label: 'Push', icon: <Bell className="h-3.5 w-3.5" />, color: 'bg-violet-100 text-violet-700' },
  email: { label: 'Email', icon: <Mail className="h-3.5 w-3.5" />, color: 'bg-amber-100 text-amber-700' },
}

const STATUS_CONFIG: Record<CommStatus, { label: string; color: string }> = {
  envoye: { label: 'Envoyé', color: 'bg-emerald-100 text-emerald-700' },
  en_cours: { label: 'En cours', color: 'bg-amber-100 text-amber-700' },
  echoue: { label: 'Échoué', color: 'bg-red-100 text-red-700' },
}

// ============== MAIN COMPONENT ==============

export function BoCommunicationScreen() {
  const [activeChannel, setActiveChannel] = useState<CommChannel>('sms')
  const [communications, setCommunications] = useState<Communication[]>(INITIAL_COMMUNICATIONS)

  // Compose form
  const [destType, setDestType] = useState<DestType>('all')
  const [destZone, setDestZone] = useState('Adjamé')
  const [destSegment, setDestSegment] = useState(SEGMENTS[0])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('immediat')
  const [scheduledDate, setScheduledDate] = useState('')
  const [sending, setSending] = useState(false)

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false)

  // Relancer
  const [relaunching, setRelaunching] = useState<string | null>(null)

  const destLabel = destType === 'all' ? 'Tous les acteurs' : destType === 'zone' ? destZone : destSegment

  const handleSend = () => {
    if (!message) return
    setSending(true)
    setTimeout(() => {
      const newComm: Communication = {
        id: `com-${Date.now()}`,
        channel: activeChannel,
        destType,
        destLabel,
        subject: activeChannel === 'email' ? subject : undefined,
        message,
        status: scheduleType === 'immediat' ? 'envoye' : 'en_cours',
        sentAt: new Date().toISOString(),
        scheduledAt: scheduleType === 'planifie' ? scheduledDate || new Date().toISOString() : undefined,
        totalRecipients: Math.floor(Math.random() * 5000) + 500,
        delivered: scheduleType === 'immediat' ? Math.floor(Math.random() * 3000) + 200 : 0,
        failed: Math.floor(Math.random() * 50),
        pending: Math.floor(Math.random() * 1000),
      }
      setCommunications((prev) => [newComm, ...prev])
      setMessage('')
      setSubject('')
      setSending(false)
    }, 1500)
  }

  const handleRelaunch = (id: string) => {
    setRelaunching(id)
    setTimeout(() => {
      setCommunications((prev) => prev.map(c => {
        if (c.id !== id) return c
        return { ...c, status: 'en_cours' as const, sentAt: new Date().toISOString() }
      }))
      setTimeout(() => {
        setCommunications((prev) => prev.map(c => {
          if (c.id !== id) return c
          return { ...c, status: 'envoye' as const, delivered: c.totalRecipients - Math.floor(Math.random() * 30), failed: Math.floor(Math.random() * 20), pending: 0 }
        }))
      }, 2000)
      setRelaunching(null)
    }, 800)
  }

  // Stats computed from all comms
  const stats = useMemo(() => {
    const sentThisMonth = communications.length
    const totalDelivered = communications.reduce((s, c) => s + c.delivered, 0)
    const totalSent = communications.reduce((s, c) => s + c.totalRecipients, 0)
    const tauxDelivrance = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0
    // Mock cost: SMS = 50 FCFA, Push = 5 FCFA, Email = 25 FCFA
    const cout = communications.reduce((s, c) => {
      const unit = c.channel === 'sms' ? 50 : c.channel === 'push' ? 5 : 25
      return s + (c.totalRecipients * unit)
    }, 0)
    return { sentThisMonth, tauxDelivrance, cout }
  }, [communications])

  const formatTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const formatCost = (n: number) => n.toLocaleString('fr-FR') + ' FCFA'

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
          💬 COMMUNICATION
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Envoi de messages massifs par SMS, Push et Email
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Envoyés ce mois</p>
              <p className="text-xl font-bold" style={{ color: BO_COLOR }}>{stats.sentThisMonth}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Taux délivrance</p>
              <p className="text-xl font-bold text-sky-600">{stats.tauxDelivrance}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Coût total</p>
              <p className="text-xl font-bold text-amber-700">{formatCost(stats.cout)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Channel Selection */}
      <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as CommChannel)}>
        <TabsList>
          <TabsTrigger value="sms" className="gap-1.5"><Smartphone className="h-3.5 w-3.5" /> SMS</TabsTrigger>
          <TabsTrigger value="push" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Push</TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</TabsTrigger>
        </TabsList>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Compose Form */}
          <Card className="border-0 shadow-sm lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
                <Send className="h-4 w-4 inline mr-1.5" />
                Composer un message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Destinataires</Label>
                <Select value={destType} onValueChange={(v) => setDestType(v as DestType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les acteurs</SelectItem>
                    <SelectItem value="zone">Zone spécifique</SelectItem>
                    <SelectItem value="segment">Segment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {destType === 'zone' && (
                <div className="space-y-2">
                  <Label>Zone</Label>
                  <Select value={destZone} onValueChange={setDestZone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {destType === 'segment' && (
                <div className="space-y-2">
                  <Label>Segment</Label>
                  <Select value={destSegment} onValueChange={setDestSegment}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEGMENTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {activeChannel === 'email' && (
                <div className="space-y-2">
                  <Label>Sujet</Label>
                  <Input placeholder="Sujet de l'email" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
              )}

              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  Message
                  <span className="text-xs text-gray-400 font-normal">{message.length} caractères</span>
                </Label>
                <Textarea
                  placeholder="Rédigez votre message..."
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Planification</Label>
                <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as ScheduleType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediat">Immédiat</SelectItem>
                    <SelectItem value="planifie">Planifié</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleType === 'planifie' && (
                <div className="space-y-2">
                  <Label>Date et heure</Label>
                  <Input type="datetime-local" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <Users className="h-4 w-4 shrink-0" />
                <span>Destinataires estimés : <strong>{destLabel}</strong></span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)} disabled={!message}>
                  <Eye className="h-4 w-4 mr-1.5" /> Aperçu
                </Button>
                <Button className="flex-1" onClick={handleSend} disabled={!message || sending}>
                  {sending ? (
                    <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" /> Envoi...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-1.5" /> Envoyer</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History Table */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
                <Clock className="h-4 w-4 inline mr-1.5" />
                Historique des communications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#D1D5DB transparent' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Destinataires</TableHead>
                      <TableHead className="text-xs">Message</TableHead>
                      <TableHead className="text-xs">Statut</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {communications.map((comm) => {
                      const cc = CHANNEL_CONFIG[comm.channel]
                      const sc = STATUS_CONFIG[comm.status]
                      return (
                        <TableRow key={comm.id}>
                          <TableCell className="text-xs py-2.5 text-gray-500 whitespace-nowrap">{formatTime(comm.sentAt)}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${cc.color}`}>
                              {cc.icon}<span className="ml-1">{cc.label}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-600 max-w-[100px] truncate" title={comm.destLabel}>{comm.destLabel}</TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-700 max-w-[200px] truncate" title={comm.message}>{comm.message}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>{sc.label}</Badge>
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            {(comm.status === 'echoue' || comm.status === 'envoye') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleRelaunch(comm.id)}
                                disabled={relaunching === comm.id}
                              >
                                {relaunching === comm.id ? (
                                  <span className="h-3 w-3 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Relancer
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {communications.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucune communication</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aperçu du message</DialogTitle>
            <DialogDescription>Prévisualisation avant envoi</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500">Canal :</span>
              <Badge variant="secondary" className={CHANNEL_CONFIG[activeChannel].color}>
                {CHANNEL_CONFIG[activeChannel].icon}<span className="ml-1">{CHANNEL_CONFIG[activeChannel].label}</span>
              </Badge>
            </div>
            {activeChannel === 'email' && subject && (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-500">Sujet :</span>
                <span className="font-medium" style={{ color: BO_COLOR }}>{subject}</span>
              </div>
            )}
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500">Destinataires :</span>
              <span className="font-medium" style={{ color: BO_COLOR }}>{destLabel}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-gray-500">Planification :</span>
              <span className="font-medium" style={{ color: BO_COLOR }}>
                {scheduleType === 'immediat' ? 'Immédiat' : `Planifié le ${scheduledDate ? formatTime(scheduledDate) : '-'}`}
              </span>
            </div>
            <Separator />
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {message || '(vide)'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}