'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Pause,
  Play,
  Trash2,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type EventLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

interface SystemEvent {
  id: string
  timestamp: string
  level: EventLevel
  source: string
  message: string
}

const ALL_LEVELS: EventLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG']

// ============== MAIN COMPONENT ==============

export function BoEventsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const LEVEL_CONFIG: Record<EventLevel, { color: string; bgColor: string; textColor: string; dotColor: string }> = {
    INFO: { color: 'border-l-blue-500', bgColor: isDark ? 'bg-blue-500/15' : 'bg-blue-50', textColor: isDark ? 'text-blue-400' : 'text-blue-700', dotColor: 'bg-blue-500' },
    WARN: { color: 'border-l-amber-500', bgColor: isDark ? 'bg-amber-500/15' : 'bg-amber-50', textColor: isDark ? 'text-amber-400' : 'text-amber-700', dotColor: 'bg-amber-500' },
    ERROR: { color: 'border-l-red-500', bgColor: isDark ? 'bg-red-500/10' : 'bg-red-50', textColor: isDark ? 'text-red-400' : 'text-red-700', dotColor: 'bg-red-500' },
    DEBUG: { color: isDark ? 'border-l-slate-500' : 'border-l-gray-400', bgColor: isDark ? 'bg-slate-700' : 'bg-gray-100', textColor: isDark ? 'text-slate-400' : 'text-gray-500', dotColor: isDark ? 'bg-slate-500' : 'bg-gray-400' },
  }

  const [events, setEvents] = useState<SystemEvent[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [levelFilters, setLevelFilters] = useState<Record<EventLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
    DEBUG: true,
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch events from API
  const fetchEvents = useCallback(async () => {
    try {
      const activeLevels = ALL_LEVELS.filter((l) => levelFilters[l])
      const params = new URLSearchParams({ limit: '100' })
      if (activeLevels.length > 0 && activeLevels.length < 4) {
        params.set('level', activeLevels.join(','))
      }
      const res = await fetch(`/api/backoffice/events?${params}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const mapped: SystemEvent[] = (data.events || []).map((e: { id: string; level: string; source: string; message: string; createdAt: string }) => ({
        id: e.id,
        timestamp: e.createdAt,
        level: e.level as EventLevel,
        source: e.source,
        message: e.message,
      }))
      setEvents(mapped)
      setTotalCount(data.count || mapped.length)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [levelFilters])

  // Initial fetch + polling every 10 seconds
  useEffect(() => {
    fetchEvents()
    if (!isPaused) {
      pollingRef.current = setInterval(fetchEvents, 10000)
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [fetchEvents, isPaused])

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = 0
    }
  }, [events, isPaused])

  const filtered = useMemo(() => {
    return events // Already filtered by API
  }, [events])

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
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            <span className="inline-flex items-center gap-2"><Radio className="h-6 w-6" />EVENT MONITOR</span>
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Journal d&apos;événements système en temps réel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? (isDark ? 'bg-slate-500' : 'bg-gray-400') : 'bg-emerald-500 animate-pulse'}`} />
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isPaused ? 'En pause' : 'En direct'}</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0 ml-2">
            {totalCount} événements
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Error */}
      {error && (
        <div className={`rounded-lg border p-4 ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <p className="text-sm font-medium">Erreur de chargement</p>
          <p className="text-xs mt-1 opacity-80">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchEvents}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Réessayer
          </Button>
        </div>
      )}

      {/* Level Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_LEVELS.map((level) => {
          const cfg = LEVEL_CONFIG[level]
          return (
            <Card key={level} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-3 h-8 rounded-sm ${cfg.dotColor}`} />
                <div>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{level}</p>
                  <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{loading ? <Skeleton className="h-5 w-8 inline-block" /> : levelCounts[level]}</p>
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
          <span className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Filtrer :</span>
          {ALL_LEVELS.map((level) => {
            const cfg = LEVEL_CONFIG[level]
            return (
              <label key={level} className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox
                  checked={levelFilters[level]}
                  onCheckedChange={() => toggleLevel(level)}
                  className={`${cfg.dotColor} ${isDark ? 'border-slate-600' : 'border-gray-300'} data-[state=checked]:bg-current data-[state=checked]:border-current`}
                />
                <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{level}</span>
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
          <Button variant="outline" size="sm" onClick={() => { setEvents([]); fetchEvents() }}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Event List */}
      <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="max-h-[520px] overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: isDark ? '#475569 transparent' : '#D1D5DB transparent' }}
          >
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Aucun événement</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}>Les événements filtrés apparaîtront ici</p>
              </div>
            ) : (
              filtered.map((evt) => {
                const cfg = LEVEL_CONFIG[evt.level]
                return (
                  <div
                    key={evt.id}
                    className={`flex items-start gap-3 px-4 py-2.5 border-l-4 ${cfg.color} ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-50/80'} transition-colors`}
                  >
                    <span className={`text-[11px] font-mono whitespace-nowrap mt-0.5 w-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatTime(evt.timestamp)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 font-mono shrink-0 w-12 justify-center ${cfg.bgColor} ${cfg.textColor}`}
                    >
                      {evt.level}
                    </Badge>
                    <span className={`text-[11px] font-mono whitespace-nowrap mt-0.5 w-40 truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      [{evt.source}]
                    </span>
                    <span className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{evt.message}</span>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
