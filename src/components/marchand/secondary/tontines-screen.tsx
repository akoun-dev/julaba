'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, Users, Calendar, Plus, Minus, WifiOff } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/utils'
import { formatMontantParle } from '@/lib/voice/tata-phrases'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { syncTontineReminders } from '@/lib/notifications/schedule'
import { clampTontineMembers, isTontineFormValid } from '@/lib/marchand/secondary-logic'

// ============================================================
// TONTINES SCREEN - Tontine management with creation
// ============================================================

interface TontineData {
  id: string
  name: string
  amount: number
  frequency: string
  memberCount: number
  nextDueDate: string | null
  totalCotiseFcfa: number
}

const TONTINE_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'hebdomadaire', label: 'Hebdo' },
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'trimestriel', label: 'Trimestriel' },
  { value: 'annuel', label: 'Annuel' },
]

const TONTINE_QUICK_AMOUNTS = [2000, 5000, 10000, 25000]

export function TontinesScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const [tontines, setTontines] = useState<TontineData[]>([])
  const [cotisingId, setCotisingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Creation form state — deliberately online-only (see handleCreate).
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('mensuel')
  const [memberCount, setMemberCount] = useState(5)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const online = useNetworkStatus()

  const loadTontines = useCallback(async () => {
    if (!merchantId) return
    try {
      const res = await fetch(`/api/marchand/tontines?merchantId=${merchantId}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setTontines(data.tontines ?? [])
    } catch {
      // Offline or server error — leave the list as-is (empty on first load).
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    loadTontines()
  }, [loadTontines])

  // Rappels d'échéance natifs (Task 29) : à chaque chargement de la liste,
  // re-planifie les notifications locales J-1 et J-J à 8h et annule les
  // obsolètes. No-op web, respecte les préférences de catégorie tontine.
  useEffect(() => {
    void syncTontineReminders(tontines)
  }, [tontines])

  const handleCotiser = async (tontine: TontineData) => {
    if (!merchantId) return
    setCotisingId(tontine.id)
    const payload = {
      merchantId,
      tontineId: tontine.id,
      amount: tontine.amount,
      clientId: `tontine-${tontine.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    let syncedNow = false
    try {
      const res = await fetch('/api/marchand/tontines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        syncedNow = true
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        // Transitoire → rejouable plus tard, file offline ci-dessous.
        throw new Error(`Erreur ${res.status}`)
      } else {
        // Refus définitif (400/403/422…) : parlé, JAMAIS mis en file.
        const body = await res.json().catch(() => ({}))
        tataSpeak(body.erreur ?? 'Cotisation refusée. Réessayez.')
        haptic('error')
        setCotisingId(null)
        return
      }
    } catch {
      const queued = await queuePendingSync('tontine-contribution', payload)
      if (!queued.ok) {
        // Neither the live request nor the offline queue worked — don't
        // touch the displayed total, and tell the merchant to retry rather
        // than claiming a cotisation that was never recorded anywhere.
        tataSpeak('Cotisation non enregistrée. Réessayez.')
        haptic('error')
        setCotisingId(null)
        return
      }
    }
    setTontines((list) =>
      list.map((t) => (t.id === tontine.id ? { ...t, totalCotiseFcfa: t.totalCotiseFcfa + tontine.amount } : t))
    )
    tataSpeak(syncedNow
      ? `Cotisation de ${formatMontantParle(tontine.amount)} francs enregistrée pour ${tontine.name}.`
      : `Cotisation de ${formatMontantParle(tontine.amount)} francs enregistrée, en attente de synchronisation.`)
    haptic('success')
    setCotisingId(null)
  }

  const amountValue = Number.parseInt(amount, 10)
  const formValid = isTontineFormValid(name, amountValue, memberCount)

  const openCreate = () => {
    setName('')
    setAmount('')
    setFrequency('mensuel')
    setMemberCount(5)
    setCreateError(null)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!merchantId || !formValid || creating) return
    setCreating(true)
    setCreateError(null)
    const payload = {
      merchantId,
      name: name.trim(),
      amount: amountValue,
      frequency,
      memberCount,
      clientId: `tontine-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
    try {
      const res = await fetch('/api/marchand/tontines/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCreateError(data?.erreur ?? 'Création refusée. Réessayez.')
        setCreating(false)
        return
      }
      setCreateOpen(false)
      setCreating(false)
      playBeep('success')
      haptic('success')
      tataSpeak(`Tontine ${payload.name} créée. Vous êtes le premier membre.`)
      loadTontines()
    } catch {
      // Deliberately NOT queueable offline: later cotisations reference the
      // tontine id the server generates, so a locally-invented id would
      // dangle until the next online session — and the merchant would see
      // a "Cotiser" button that can never work on that record.
      setCreateError('Connexion requise pour créer une tontine.')
      setCreating(false)
    }
  }

  const labelClass = soleilMode ? 'text-black' : ''
  const mutedClass = soleilMode ? 'text-base' : ''

  return (
    <div className="screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Tontines</h1>
          </div>
          <Button
            size="sm"
            className="h-9 text-xs bg-[#C66A2C] hover:bg-[#B55D25] text-white"
            onClick={openCreate}
            disabled={!online}
          >
            <Plus className="w-4 h-4 mr-1" /> Créer
          </Button>
        </div>
        <p className={`text-xs text-muted-foreground mt-1 ${mutedClass}`}>Gérez vos tontines et cotisations</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-10 bg-muted rounded animate-pulse w-full" />
              </CardContent>
            </Card>
          ))
        )}

        {!loading && tontines.map(tontine => (
          <Card key={tontine.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-sm font-semibold ${soleilMode ? 'text-black text-base' : ''}`}>{tontine.name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    Cotisé : {formatFCFA(tontine.totalCotiseFcfa)}
                  </Badge>
                </div>
                <p className="text-lg font-bold text-[#C66A2C] fcfa">{formatFCFA(tontine.amount)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2">
                  <Users className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${mutedClass}`}>{tontine.memberCount} membres</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 text-muted-foreground ${soleilMode ? 'text-black' : ''}`} />
                  <span className={`text-sm ${mutedClass}`}>
                    {tontine.nextDueDate ? `Prochain: ${new Date(tontine.nextDueDate).toLocaleDateString('fr-FR')}` : 'Pas de date fixée'}
                  </span>
                </div>
              </div>
              <Button
                className="w-full mt-3 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
                onClick={() => handleCotiser(tontine)}
                disabled={cotisingId === tontine.id}
              >
                {cotisingId === tontine.id ? 'Enregistrement...' : `Cotiser ${formatFCFA(tontine.amount)}`}
              </Button>
            </CardContent>
          </Card>
        ))}

        {!loading && tontines.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className={mutedClass}>Créez ou rejoignez une tontine pour commencer</p>
            <Button variant="outline" className="mt-3" onClick={openCreate} disabled={!online}>
              <Plus className="w-4 h-4 mr-1" /> Créer une tontine
            </Button>
          </div>
        )}
      </div>

      {/* Create tontine dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={soleilMode ? 'text-black' : ''}>Créer une tontine</DialogTitle>
            <DialogDescription className={soleilMode ? 'text-black' : ''}>
              Vous serez le premier membre. Les autres membres rejoindront via un agent Jùlaba.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tontine-name" className={soleilMode ? 'text-black text-base' : ''}>Nom de la tontine</Label>
              <Input
                id="tontine-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Tontine Adjamé Prospère"
                className="min-h-11"
                maxLength={80}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tontine-amount" className={soleilMode ? 'text-black text-base' : ''}>Cotisation par tour (FCFA)</Label>
              <Input
                id="tontine-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-h-11 fcfa"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {TONTINE_QUICK_AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    className="min-h-11 text-xs"
                    onClick={() => setAmount(String(value))}
                  >
                    {value / 1000}k
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={soleilMode ? 'text-black text-base' : ''}>Fréquence</Label>
              {/* 2 colonnes sur téléphone : « Trimestriel » (≈66px) ne tenait
                  pas dans une cellule 4-colonnes de ~59px (dialog 288px). */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TONTINE_FREQUENCIES.map((f) => (
                  <Button
                    key={f.value}
                    type="button"
                    variant={frequency === f.value ? 'default' : 'outline'}
                    size="sm"
                    className={`min-h-11 text-xs ${frequency === f.value ? 'bg-[#C66A2C] hover:bg-[#B55D25] text-white' : ''}`}
                    onClick={() => setFrequency(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tontine-members" className={soleilMode ? 'text-black text-base' : ''}>Nombre de membres prévu</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Diminuer le nombre de membres"
                  disabled={memberCount <= 2}
                  onClick={() => setMemberCount((m) => Math.max(2, m - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  id="tontine-members"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={100}
                  value={memberCount}
                  onChange={(e) => {
                    setMemberCount(clampTontineMembers(e.target.value))
                  }}
                  className="min-h-11 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Augmenter le nombre de membres"
                  disabled={memberCount >= 100}
                  onClick={() => setMemberCount((m) => Math.min(100, m + 1))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {!online && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                La création d'une tontine nécessite une connexion internet.
              </p>
            )}
            {createError && <p className="text-xs text-red-600" role="alert">{createError}</p>}

            <Button
              className="w-full min-h-11 bg-[#C66A2C] hover:bg-[#B55D25] text-white"
              onClick={handleCreate}
              disabled={!formValid || !online || creating}
            >
              {creating ? 'Création...' : 'Créer la tontine'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
