'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { useBackofficeZoneNames } from '@/lib/hooks/use-backoffice-zones'
import { formatFCFA as formatCost } from '@/lib/utils'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type CommChannel = 'sms' | 'push' | 'email'
type CommStatus = 'envoyee' | 'programmee' | 'echoue' | 'en_cours'
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

// ============== CONSTANTS ==============

const SEGMENTS = ['Tous les acteurs', 'Marchands inactifs (>7j)', 'Nouveaux inscrits (30j)', 'Producteurs zone rurale', 'Coopératives', 'Hauts revenus']

// ============== MAIN COMPONENT ==============

export function BoCommunicationScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const zones = useBackofficeZoneNames()

  const channelConfig: Record<CommChannel, { label: string; icon: React.ReactNode; color: string }> = {
    sms: { label: 'SMS', icon: <Smartphone className="h-3.5 w-3.5" />, color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    push: { label: 'Push', icon: <Bell className="h-3.5 w-3.5" />, color: isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-700' },
    email: { label: 'Email', icon: <Mail className="h-3.5 w-3.5" />, color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700' },
  }

  const statusConfig: Record<CommStatus, { label: string; color: string }> = {
    envoyee: { label: 'Envoyée', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    programmee: { label: 'Programmée', color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700' },
    echoue: { label: 'Échoué', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700' },
    en_cours: { label: 'Envoi en cours', color: isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700' },
  }

  const [activeChannel, setActiveChannel] = useState<CommChannel>('sms')
  const [communications, setCommunications] = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/communications')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setCommunications(Array.isArray(data) ? data : data.communications ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
        status: scheduleType === 'immediat' ? 'envoyee' : 'programmee',
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
          return { ...c, status: 'envoyee' as const, delivered: c.totalRecipients - Math.floor(Math.random() * 30), failed: Math.floor(Math.random() * 20), pending: 0 }
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
    const cout = communications.reduce((s, c) => {
      const unit = c.channel === 'sms' ? 50 : c.channel === 'push' ? 5 : 25
      return s + (c.totalRecipients * unit)
    }, 0)
    return { sentThisMonth, tauxDelivrance, cout }
  }, [communications])

  const formatTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <BoPageHeader
        title="Communication"
        description="Envoi de messages massifs par SMS, Push et Email"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-100'} flex items-center justify-center`}>
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Envoyés ce mois</p>
              {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.sentThisMonth}</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-sky-500/15' : 'bg-sky-100'} flex items-center justify-center`}>
              <CheckCircle2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Taux délivrance</p>
              {loading ? <Skeleton className="h-6 w-12 mt-1" /> : <p className="text-xl font-bold text-sky-600">{stats.tauxDelivrance}%</p>}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-amber-500/15' : 'bg-amber-100'} flex items-center justify-center`}>
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Coût total</p>
              {loading ? <Skeleton className="h-6 w-24 mt-1" /> : <p className="text-xl font-bold text-amber-700">{formatCost(stats.cout)}</p>}
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
          <Card className={`border-0 lg:col-span-1 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                    <SelectContent>{zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
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
                  <span className={`text-xs font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{message.length} caractères</span>
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

              <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-400 bg-slate-700/50' : 'text-slate-500 bg-slate-50'} rounded-lg p-3`}>
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
          <Card className={`border-0 lg:col-span-2 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <Clock className="h-4 w-4 inline mr-1.5" />
                Historique des communications
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: isDark ? '#475569 transparent' : '#D1D5DB transparent' }}>
                {/* Error */}
                {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

                {/* Loading */}
                {loading && !error && (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-4 items-center">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-7 w-20" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Table */}
                {!loading && !error && (
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
                        const cc = channelConfig[comm.channel] ?? { label: comm.channel, icon: <Send className="h-3.5 w-3.5" />, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600' }
                        const sc = statusConfig[comm.status] ?? { label: comm.status, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600' }
                        return (
                          <TableRow key={comm.id}>
                            <TableCell className={`text-xs py-2.5 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatTime(comm.sentAt)}</TableCell>
                            <TableCell className="py-2.5">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${cc.color}`}>
                                {cc.icon}<span className="ml-1">{cc.label}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-xs py-2.5 max-w-[100px] truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`} title={comm.destLabel}>{comm.destLabel}</TableCell>
                            <TableCell className={`text-xs py-2.5 max-w-[200px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`} title={comm.message}>{comm.message}</TableCell>
                            <TableCell className="py-2.5">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>{sc.label}</Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              {(comm.status === 'echoue' || comm.status === 'envoyee') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleRelaunch(comm.id)}
                                  disabled={relaunching === comm.id}
                                >
                                  {relaunching === comm.id ? (
                                    <span className={`h-3 w-3 border-2 rounded-full animate-spin ${isDark ? 'border-slate-600/30 border-t-slate-300' : 'border-gray-400/30 border-t-gray-600'}`} />
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
                )}
                {!loading && !error && communications.length === 0 && (
                  <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
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
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Canal :</span>
              <Badge variant="secondary" className={channelConfig[activeChannel].color}>
                {channelConfig[activeChannel].icon}<span className="ml-1">{channelConfig[activeChannel].label}</span>
              </Badge>
            </div>
            {activeChannel === 'email' && subject && (
              <div className="flex gap-2 text-sm">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Sujet :</span>
                <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{subject}</span>
              </div>
            )}
            <div className="flex gap-2 text-sm">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Destinataires :</span>
              <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{destLabel}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Planification :</span>
              <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {scheduleType === 'immediat' ? 'Immédiat' : `Planifié le ${scheduledDate ? formatTime(scheduledDate) : '-'}`}
              </span>
            </div>
            <Separator />
            <div className={`${isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-50 text-slate-700'} rounded-lg p-4 text-sm whitespace-pre-wrap`}>
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
