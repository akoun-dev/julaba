'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Pause,
  Play,
  Trash2,
  Radio,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { useBackofficeStore, BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type EventLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

interface SystemEvent {
  id: string
  timestamp: string
  level: EventLevel
  source: string
  message: string
}

// ============== HELPERS ==============

const LEVEL_CONFIG: Record<EventLevel, { color: string; bgColor: string; textColor: string; dotColor: string }> = {
  INFO: { color: 'border-l-blue-500', bgColor: 'bg-blue-50', textColor: 'text-blue-700', dotColor: 'bg-blue-500' },
  WARN: { color: 'border-l-amber-500', bgColor: 'bg-amber-50', textColor: 'text-amber-700', dotColor: 'bg-amber-500' },
  ERROR: { color: 'border-l-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700', dotColor: 'bg-red-500' },
  DEBUG: { color: 'border-l-gray-400', bgColor: 'bg-gray-100', textColor: 'text-gray-500', dotColor: 'bg-gray-400' },
}

const SOURCES = [
  'auth-service', 'api-gateway', 'notification-service', 'ml-inference',
  'database', 'file-storage', 'scheduler', 'payment-service', 'marketplace-engine',
]

const MOCK_MESSAGES: Record<EventLevel, string[]> = {
  INFO: [
    'Utilisateur connecté : aminata@julaba.ci',
    'Enrôlement validé #ID-2026-0845',
    'Rapport mensuel généré avec succès',
    'Sync institution DGE terminée (1 245 acteurs)',
    'Mutation approuvée #mut-3',
    'Tâche cron « clean-sessions » exécutée (42 sessions)',
    'Nouveau marchand enregistré : Paul BAMBA',
    'Webhook BCEAO traité avec succès',
    'Commande marketplace #ORD-2847 confirmée',
    'Score financier recalculé pour 890 acteurs',
  ],
  WARN: [
    'Taux de rejet > 15% dans la zone Kong',
    'Latence API dégradée : 450ms (seuil : 300ms)',
    'Tentative de connexion échouée (3ème tentative)',
    'Stockage à 72% de capacité',
    'Limite SMS quotidienne atteinte à 90%',
    'API Key « Staging » expire dans 7 jours',
    'Taux d\'abandon panier élevé : 34%',
  ],
  ERROR: [
    'Échec envoi SMS : timeout opérateur Orange',
    'Erreur inference modèle : context overflow',
    'Connexion base de données perdue (retry 1/3)',
    'Webhook callback échoué : HTTP 500',
    'Payment intent échoué : insufficient_funds',
  ],
  DEBUG: [
    'Cache HIT pour /api/actors?page=1',
    'Request processed in 45ms',
    'Token refresh pour user bo-u-4',
    'Queue depth: 12 items',
    'WebSocket heartbeat OK (latency: 3ms)',
  ],
}

function generateEvent(): SystemEvent {
  const levels: EventLevel[] = ['INFO', 'INFO', 'INFO', 'WARN', 'WARN', 'ERROR', 'DEBUG', 'DEBUG']
  const level = levels[Math.floor(Math.random() * levels.length)]
  const messages = MOCK_MESSAGES[level]
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
    message: messages[Math.floor(Math.random() * messages.length)],
  }
}

const INITIAL_EVENTS: SystemEvent[] = Array.from({ length: 25 }, (_, i) => {
  const evt = generateEvent()
  return { ...evt, id: `evt-init-${i}`, timestamp: new Date(Date.now() - (25 - i) * 3000).toISOString() }
})

const ALL_LEVELS: EventLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG']

// ============== MAIN COMPONENT ==============

export function BoEventsScreen() {
  const [events, setEvents] = useState<SystemEvent[]>(INITIAL_EVENTS)
  const [isPaused, setIsPaused] = useState(false)
  const [levelFilters, setLevelFilters] = useState<Record<EventLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
    DEBUG: true,
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const maxEvents = 150

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = 0
    }
  }, [events, isPaused])

  // Generate mock events every 3 seconds
  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(() => {
      const newEvent = generateEvent()
      setEvents((prev) => {
        const updated = [newEvent, ...prev]
        return updated.slice(0, maxEvents)
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [isPaused])

  const filtered = useMemo(() => {
    return events.filter((e) => levelFilters[e.level])
  }, [events, levelFilters])

  const levelCounts = useMemo(() => {
    const counts: Record<EventLevel, number> = { INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 }
    events.forEach((e) => { counts[e.level]++ })
    return counts
  }, [events])

  const toggleLevel = useCallback((level: EventLevel) => {
    setLevelFilters((prev) => ({ ...prev, [level]: !prev[level] }))
  }, [])

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const handleClear = () => setEvents([])

  const activeFilterCount = ALL_LEVELS.filter((l) => levelFilters[l]).length

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
            📡 EVENT MONITOR
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Journal d&apos;événements système en temps réel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-gray-400' : 'bg-emerald-500 animate-pulse'}`} />
          <span className="text-xs text-gray-500 font-medium">{isPaused ? 'En pause' : 'En direct'}</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0 ml-2">
            {events.length} événements
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Level Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_LEVELS.map((level) => {
          const cfg = LEVEL_CONFIG[level]
          return (
            <Card key={level} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-3 h-8 rounded-sm ${cfg.dotColor}`} />
                <div>
                  <p className="text-xs text-gray-500 font-medium">{level}</p>
                  <p className="text-lg font-bold" style={{ color: BO_COLOR }}>{levelCounts[level]}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Checkboxes filter */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filtrer :</span>
          {ALL_LEVELS.map((level) => {
            const cfg = LEVEL_CONFIG[level]
            return (
              <label key={level} className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox
                  checked={levelFilters[level]}
                  onCheckedChange={() => toggleLevel(level)}
                  className={`${cfg.dotColor} border-gray-300 data-[state=checked]:bg-current data-[state=checked]:border-current`}
                />
                <span className="text-xs font-medium text-gray-600">{level}</span>
              </label>
            )
          })}
          {activeFilterCount === 0 && (
            <span className="text-xs text-red-500 font-medium">Aucun filtre actif</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant={isPaused ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play className="h-4 w-4 mr-1.5" /> : <Pause className="h-4 w-4 mr-1.5" />}
            {isPaused ? 'Reprendre' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Vider
          </Button>
        </div>
      </div>

      {/* Event List */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="max-h-[520px] overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#D1D5DB transparent' }}
          >
            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Aucun événement</p>
                <p className="text-xs mt-1 text-gray-300">Les événements filtrés apparaîtront ici</p>
              </div>
            )}
            {filtered.map((evt) => {
              const cfg = LEVEL_CONFIG[evt.level]
              return (
                <div
                  key={evt.id}
                  className={`flex items-start gap-3 px-4 py-2.5 border-l-4 ${cfg.color} hover:bg-gray-50/80 transition-colors`}
                >
                  <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap mt-0.5 w-20">
                    {formatTime(evt.timestamp)}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 font-mono shrink-0 w-12 justify-center ${cfg.bgColor} ${cfg.textColor}`}
                  >
                    {evt.level}
                  </Badge>
                  <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap mt-0.5 w-40 truncate">
                    [{evt.source}]
                  </span>
                  <span className="text-xs text-gray-700 leading-relaxed">{evt.message}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
