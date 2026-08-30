'use client'

import { useState } from 'react'
import { Users, Send } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader } from './bo-ui'

type TargetType = 'merchant' | 'producteur' | 'identificateur' | 'all'

const TARGET_LABELS: Record<TargetType, string> = {
  all: 'Tout le monde (marchands, producteurs, identificateurs)',
  merchant: 'Tous les marchands',
  producteur: 'Tous les producteurs',
  identificateur: 'Tous les identificateurs',
}

export function BoNotificationsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [targetType, setTargetType] = useState<TargetType>('all')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ recipientCount: number } | null>(null)

  const handleSend = async () => {
    setError(null)
    setResult(null)
    if (!title.trim() || !message.trim()) {
      setError('Le titre et le message sont obligatoires.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/backoffice/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, title: title.trim(), message: message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur || `Erreur ${res.status}`)
      setResult({ recipientCount: data.recipientCount })
      setTitle('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      <BoPageHeader
        title="Notifications"
        description="Envoyer une annonce en direct dans l'application des marchands, producteurs et identificateurs — visible dans leur cloche de notifications dès le prochain sondage (moins d'une minute)."
      />

      <Separator />

      <Card className={`border-0 max-w-xl ${isDark ? 'bg-slate-800' : 'shadow-sm'}`}>
        <CardContent className="p-5 space-y-4">
          <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${isDark ? 'border-slate-700 bg-slate-900/50 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <Users className="h-4 w-4 mt-0.5 shrink-0" />
            <p>Les destinataires sont les comptes qui ont déjà utilisé l&apos;application sur un appareil (session appareil active) — cibler une seule personne n&apos;est pas encore possible pour les identificateurs, faute d&apos;un lien fiable entre leur compte et un acteur du registre.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-target">Destinataires</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger id="notif-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_LABELS) as TargetType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TARGET_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-title">Titre</Label>
            <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Rapport hebdomadaire disponible" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-message">Message</Label>
            <Textarea id="notif-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contenu de l'annonce…" rows={4} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <p className="text-sm text-emerald-600">
              Envoyée à {result.recipientCount} destinataire{result.recipientCount > 1 ? 's' : ''}.
            </p>
          )}

          <Button onClick={handleSend} disabled={sending} className="w-full">
            <Send className="h-3.5 w-3.5 mr-2" />
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
