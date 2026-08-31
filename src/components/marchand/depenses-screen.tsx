'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Plus, Utensils, Truck, Home, Users, Droplets, Zap,
  Wrench, Receipt, MoreHorizontal, TrendingDown, Clock, WifiOff, RotateCw
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { formatFCFA } from '@/lib/voice/localIntent'
import { tataSpeak, haptic } from '@/lib/voice/tata-tts'
import { queuePendingSync } from '@/lib/offline-db'

interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amount: number
  timestamp: string
}

type ExpenseCategory =
  | 'aliment'
  | 'transport'
  | 'loyer'
  | 'personnel'
  | 'eau'
  | 'électricité'
  | 'matériel'
  | 'taxe'
  | 'autre'

const CATEGORIES: { key: ExpenseCategory | 'Tous'; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'Tous', label: 'Tout', icon: <TrendingDown className="w-3.5 h-3.5" />, color: '#C66A2C' },
  { key: 'aliment', label: 'Aliment', icon: <Utensils className="w-3.5 h-3.5" />, color: '#16A34A' },
  { key: 'transport', label: 'Transport', icon: <Truck className="w-3.5 h-3.5" />, color: '#2563EB' },
  { key: 'loyer', label: 'Loyer', icon: <Home className="w-3.5 h-3.5" />, color: '#9333EA' },
  { key: 'personnel', label: 'Personnel', icon: <Users className="w-3.5 h-3.5" />, color: '#DC2626' },
  { key: 'eau', label: 'Eau', icon: <Droplets className="w-3.5 h-3.5" />, color: '#0EA5E9' },
  { key: 'électricité', label: 'Électricité', icon: <Zap className="w-3.5 h-3.5" />, color: '#EAB308' },
  { key: 'matériel', label: 'Matériel', icon: <Wrench className="w-3.5 h-3.5" />, color: '#F97316' },
  { key: 'taxe', label: 'Taxe', icon: <Receipt className="w-3.5 h-3.5" />, color: '#6366F1' },
  { key: 'autre', label: 'Aut', icon: <MoreHorizontal className="w-3.5 h-3.5" />, color: '#6B7280' },
]

function getCategoryMeta(cat: ExpenseCategory) {
  return CATEGORIES.find(c => c.key === cat) || CATEGORIES[CATEGORIES.length - 1]!
}

export function DepensesScreen() {
  const { soleilMode, goBack, merchantId } = useAppStore()
  const { setTodayExpenses, todayExpenses } = useCaisseStore()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [activeCategory, setActiveCategory] = useState<ExpenseCategory | 'Tous'>('Tous')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAmount, setNewAmount] = useState('')
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('aliment')
  const [newDescription, setNewDescription] = useState('')
  // Distinguishes "genuinely no expenses yet" from "couldn't load them" —
  // previously a failed fetch silently kept the list empty with no
  // indication anything went wrong, indistinguishable from a real empty state.
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const textClass = soleilMode ? 'text-black' : ''

  // Loads the merchant's real expense history — previously this screen only
  // ever wrote (POST), the list shown was a hardcoded local placeholder that
  // never reflected what was actually recorded server-side.
  useEffect(() => {
    if (!merchantId) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    fetch(`/api/marchand/expenses?merchantId=${merchantId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data) => {
        if (cancelled) return
        const loaded: Expense[] = (data.expenses ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          category: (e.category as ExpenseCategory) ?? 'autre',
          description: (e.description as string) ?? '',
          amount: e.amount as number,
          timestamp: e.createdAt as string,
        }))
        setExpenses(loaded)
      })
      .catch(() => {
        // Offline or server error — keep whatever's already shown (the
        // queued write below still applied optimistically) but surface the
        // failure so the merchant can tell "no expenses" from "couldn't check".
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [merchantId, reloadToken])

  const filteredExpenses = useMemo(() => {
    let list = [...expenses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    if (activeCategory !== 'Tous') {
      list = list.filter(e => e.category === activeCategory)
    }
    return list
  }, [expenses, activeCategory])

  const dailyTotal = expenses
    .filter(e => {
      const today = new Date()
      const d = new Date(e.timestamp)
      return d.toDateString() === today.toDateString()
    })
    .reduce((sum, e) => sum + e.amount, 0)

  const handleAddExpense = async () => {
    const amount = parseInt(newAmount)
    if (!amount || amount <= 0 || !newDescription.trim() || !merchantId) {
      tataSpeak('Remplissez le montant et la description.')
      haptic('error')
      return
    }
    const expense: Expense = {
      id: crypto.randomUUID(),
      category: newCategory,
      description: newDescription.trim(),
      amount,
      timestamp: new Date().toISOString(),
    }

    // Persist server-side; if that fails (offline, flaky network), queue it
    // locally instead of losing the expense — same pattern as sales.
    // clientId makes the eventual sync idempotent: if the queued retry
    // reaches the server after an earlier attempt actually succeeded (just
    // lost its response), the server recognizes the same clientId and
    // returns the existing row instead of creating a duplicate expense.
    const expensePayload = {
      merchantId,
      clientId: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      category: newCategory,
      description: newDescription.trim(),
    }
    let syncedNow = false
    try {
      const res = await fetch('/api/marchand/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expensePayload),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      syncedNow = true
    } catch {
      const queued = await queuePendingSync('expense', expensePayload)
      if (!queued.ok) {
        // Neither the live request nor the offline queue worked — nothing
        // was recorded anywhere. Don't touch local state (never added) and
        // tell the merchant so they can retry, instead of a false success.
        tataSpeak('Dépense non enregistrée. Réessayez.')
        haptic('error')
        return
      }
    }

    setExpenses(prev => [...prev, expense])
    setTodayExpenses(todayExpenses + amount)

    tataSpeak(syncedNow
      ? `Dépense de ${formatFCFA(amount)} FCFA enregistrée.`
      : `Dépense de ${formatFCFA(amount)} FCFA enregistrée, en attente de synchronisation.`)
    haptic('success')
    setShowAddForm(false)
    setNewAmount('')
    setNewDescription('')
    setNewCategory('aliment')
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="screen-enter pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 text-muted-foreground" aria-label="Retour">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Dépenses</h1>
          </div>
          <Button
            size="sm"
            className="bg-[#C66A2C] hover:bg-[#B55D25] text-white"
            onClick={() => { setShowAddForm(true); haptic('light') }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter
          </Button>
        </div>

        {/* Daily total */}
        <Card className="bg-gradient-to-r from-[#C66A2C] to-[#D4843F] text-white mb-3">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className={soleilMode ? 'text-base' : 'text-sm'}>Total du jour</p>
              <p className={`font-bold fcfa ${soleilMode ? 'text-3xl' : 'text-2xl'}`}>{formatFCFA(dailyTotal)}</p>
            </div>
            <TrendingDown className="w-8 h-8 opacity-70" />
          </CardContent>
        </Card>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); haptic('light') }}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat.key
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground'
              } ${soleilMode && activeCategory !== cat.key ? 'text-black bg-gray-200' : ''}`}
              style={activeCategory === cat.key ? { backgroundColor: cat.color } : {}}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Expense Form */}
      {showAddForm && (
        <div className="px-4 mt-4">
          <Card className="border-[#C66A2C]/30">
            <CardContent className="p-4 space-y-3">
              <h3 className={soleilMode ? 'text-xl font-bold text-black' : 'text-lg font-bold'}>Nouvelle dépense</h3>
              <div>
                <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Montant (FCFA)</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  className={`text-xl h-14 fcfa text-center ${soleilMode ? 'text-2xl' : ''}`}
                  autoFocus
                />
              </div>
              <div>
                <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Catégorie</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.filter(c => c.key !== 'Tous').map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setNewCategory(cat.key as ExpenseCategory)}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors border ${
                        newCategory === cat.key
                          ? 'border-current'
                          : 'border-transparent bg-muted text-muted-foreground'
                      } ${soleilMode && newCategory !== cat.key ? 'text-black bg-gray-200' : ''}`}
                      style={newCategory === cat.key ? { color: cat.color } : {}}
                    >
                      {cat.icon}
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={`text-sm font-medium mb-1 block ${soleilMode ? 'text-black text-base' : ''}`}>Description</label>
                <textarea
                  placeholder="Décrivez la dépense..."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={2}
                  className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none ${soleilMode ? 'text-base' : ''}`}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>Annuler</Button>
                <Button className="flex-1 bg-[#C66A2C] hover:bg-[#B55D25] text-white" onClick={handleAddExpense}>Enregistrer</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expense List */}
      <div className="px-4 mt-4 space-y-2">
        {loading && expenses.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className={soleilMode ? 'text-base' : ''}>Chargement…</p>
          </div>
        )}
        {!loading && loadError && (
          <div className="text-center py-16 text-muted-foreground">
            <WifiOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className={soleilMode ? 'text-base' : ''}>Impossible de charger les dépenses</p>
            <p className={`text-xs mt-1 ${soleilMode ? 'text-sm' : ''}`}>Vérifiez votre connexion</p>
            <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => setReloadToken((t) => t + 1)}>
              <RotateCw className="w-3.5 h-3.5 mr-1.5" /> Réessayer
            </Button>
          </div>
        )}
        {!loading && !loadError && filteredExpenses.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className={soleilMode ? 'text-base' : ''}>Aucune dépense enregistrée</p>
          </div>
        )}
        {filteredExpenses.map(expense => {
          const meta = getCategoryMeta(expense.category)
          return (
            <Card key={expense.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: meta.color + '18', color: meta.color }}
                >
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${soleilMode ? 'text-black text-base' : ''}`}>{expense.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ color: meta.color, borderColor: meta.color + '40' }}>
                      {meta.label}
                    </Badge>
                    <span className={`text-[10px] text-muted-foreground flex items-center gap-0.5 ${soleilMode ? 'text-sm' : ''}`}>
                      <Clock className="w-2.5 h-2.5" /> {formatTime(expense.timestamp)}
                    </span>
                  </div>
                </div>
                <span className={`text-sm font-semibold text-destructive fcfa shrink-0 ${soleilMode ? 'text-base' : ''}`}>-{formatFCFA(expense.amount)}</span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
