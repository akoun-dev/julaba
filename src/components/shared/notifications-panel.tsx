'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Archive, ArchiveRestore, Bell, CheckCircle2, CheckCheck, ChevronDown,
  CloudOff, Clock3, Gift, Megaphone, Package, PiggyBank, ShoppingCart,
  Trash2, Volume2, Wallet, XCircle, X, RefreshCw, Store, ShieldCheck,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { filterNotifications, groupNotificationsByDate, groupSimilarNotifications, groupLabel, isCritical } from '@/lib/notifications/rules'
import { categoriesForRole, categoryLabel } from '@/lib/notifications/preferences'
import { executeNotificationAction, SEVERITY_ICON } from '@/lib/notifications/toast'
import { trackNotificationMetric } from '@/lib/notifications/metrics'
import { useAppStore } from '@/lib/stores/app-store'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import type { InAppNotification, NotificationFilter } from '@/lib/notifications/types'
import { tataSpeak } from '@/lib/voice/tata-tts'

// Icônes par catégorie métier (Lucide uniquement, jamais d'emoji).
const CATEGORY_ICON: Record<string, typeof Bell> = {
  vente: ShoppingCart,
  caisse: Store,
  stock: Package,
  depense: Wallet,
  commande: Package,
  tontine: PiggyBank,
  keiwa: Wallet,
  production: Package,
  formation: Gift,
  synchronisation: CloudOff,
  securite: ShieldCheck,
  systeme: Megaphone,
}

// Tonalités par sévérité — la couleur n'est JAMAIS le seul signal : les
// critiques portent aussi un badge texte « Important » (spec §6).
const SEVERITY_TONE: Record<InAppNotification['severity'], string> = {
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
  reminder: 'bg-purple-50 text-purple-700',
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

interface NotificationsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accent color for unread markers and the "tout marquer comme lu" button. */
  accentColor: string
  soleilMode?: boolean
}

export function NotificationsPanel({ open, onOpenChange, accentColor, soleilMode }: NotificationsPanelProps) {
  const {
    notifications, unreadCount, devicePendingCount, loading, loadingMore, hasMore, error,
    fetchNotifications, loadMore, markRead, markAllRead, deleteNotification, archiveNotification,
    clearRead, setFilter,
  } = useNotificationsStore()
  const online = useNetworkStatus()
  const userRole = useAppStore((s) => s.userRole)
  const navigate = useAppStore((s) => s.navigate)
  const [localFilter, setLocalFilter] = useState<NotificationFilter>('all')

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  // Filtres proposés : les catégories qui ont du sens pour le rôle
  // (le producteur n'a ni tontines ni Keiwa) — jamais une liste vide.
  const filterChips = useMemo(() => {
    const roleCategories = categoriesForRole(userRole).filter((c) => c !== 'systeme')
    return ['all', 'unread', ...roleCategories] as NotificationFilter[]
  }, [userRole])

  const visible = useMemo(
    () => filterNotifications(notifications, localFilter),
    [notifications, localFilter],
  )

  // Regroupement : événements similaires (ex. plusieurs produits sous le
  // seuil) puis par date. Les critiques ne sont jamais fusionnées.
  const dateGroups = useMemo(() => {
    const grouped = groupSimilarNotifications(visible)
    const flat = grouped.map((g) => ({ group: g.count > 1 ? g : null, n: g.representative, count: g.count }))
    return groupNotificationsByDate(flat.map((f) => f.n)).map((dg) => ({
      label: dg.label,
      items: dg.notifications.map((n) => flat.find((f) => f.n.id === n.id)!).filter(Boolean),
    }))
  }, [visible])

  const hasRead = notifications.some((n) => n.read)

  const applyFilter = (filter: NotificationFilter) => {
    setLocalFilter(filter)
    setFilter(filter)
  }

  const openAction = (n: InAppNotification) => {
    trackNotificationMetric('opened', { category: n.category, createdAt: n.createdAt })
    if (n.actionRoute) {
      void executeNotificationAction(n)
    }
    if (!n.read) void markRead(n.id)
    onOpenChange(false)
  }

  const tc = soleilMode ? 'text-black' : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-center items-center">
          <SheetTitle className={cn(tc)}>Notifications</SheetTitle>
          <SheetDescription>
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
              : 'Vous êtes à jour.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {/* États réseau / erreur — jamais un écran vide ambigu */}
          {!online && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 mb-2">
              <CloudOff className="w-4 h-4 shrink-0" aria-hidden />
              <span>Hors ligne — les notifications locales sont conservées et partiront au retour du réseau{devicePendingCount > 0 ? ` (${devicePendingCount} en attente)` : ''}.</span>
            </div>
          )}
          {error && online && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-800 mb-2">
              <span className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" aria-hidden />Le chargement a échoué : {error}.</span>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-red-800" onClick={() => fetchNotifications()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />Réessayer
              </Button>
            </div>
          )}

          {/* Filtres — chips horizontalement scrollables, zones tactiles ≥ 44 px */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filtrer les notifications">
            {filterChips.map((chip) => {
              const active = localFilter === chip
              return (
                <button
                  key={chip}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => applyFilter(chip)}
                  className={cn(
                    'min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
                    active
                      ? 'border-transparent text-white'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                  style={active ? { backgroundColor: accentColor } : undefined}
                >
                  {chip === 'all' ? 'Toutes' : chip === 'unread' ? 'Non lues' : categoryLabel(chip as InAppNotification['category'])}
                </button>
              )
            })}
          </div>

          {(unreadCount > 0 || hasRead) && (
            <div className="flex items-center justify-end gap-1 mt-2 mb-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => markAllRead()} className="h-11 text-xs" style={{ color: accentColor }}>
                  <CheckCheck className="w-3.5 h-3.5 mr-1" /> Tout marquer comme lu
                </Button>
              )}
              {hasRead && (
                <Button variant="ghost" size="sm" onClick={() => clearRead()} className="h-11 text-xs text-muted-foreground">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Vider les lues
                </Button>
              )}
            </div>
          )}

          {/* Chargement initial */}
          {loading && notifications.length === 0 && (
            <div className="py-8 space-y-2" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/60 animate-pulse" />
              ))}
            </div>
          )}

          {/* Vide explicite — distingue le filtre actif de la boîte réelle */}
          {!loading && visible.length === 0 && notifications.length > 0 && (
            <div className="text-center py-10">
              <Bell className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Aucune notification dans ce filtre.</p>
            </div>
          )}
          {!loading && !error && notifications.length === 0 && (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Aucune notification pour le moment.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Les événements importants de votre activité apparaîtront ici.</p>
            </div>
          )}

          {/* Groupes par date → items */}
          {!loading && dateGroups.map((dg) => (
            <div key={dg.label} className="mt-2">
              <p className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-1.5', tc)}>{dg.label}</p>
              <div className="space-y-2">
                {dg.items.map(({ n, group }) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    groupCount={group?.count ?? 1}
                    groupTitle={group ? groupLabel(group) : undefined}
                    accentColor={accentColor}
                    soleilMode={!!soleilMode}
                    onOpen={() => openAction(n)}
                    onRead={() => markRead(n.id)}
                    onArchive={() => archiveNotification(n.id)}
                    onDelete={() => deleteNotification(n.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center mt-3">
              <Button variant="outline" size="sm" onClick={() => loadMore()} disabled={loadingMore} className="h-11">
                <ChevronDown className="w-4 h-4 mr-1" />
                {loadingMore ? 'Chargement…' : 'Charger plus'}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NotificationRow({
  notification: n, groupCount, groupTitle, accentColor, soleilMode, onOpen, onRead, onArchive, onDelete,
}: {
  notification: InAppNotification
  groupCount: number
  groupTitle?: string
  accentColor: string
  soleilMode: boolean
  onOpen: () => void
  onRead: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const CategoryIcon = CATEGORY_ICON[n.category] ?? Bell
  const SeverityIcon = SEVERITY_ICON[n.severity] ?? Bell
  const critical = isCritical(n)
  const hasAction = Boolean(n.actionLabel && n.actionRoute)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${n.title}. ${n.body}${n.read ? '' : '. Non lue'}${critical ? '. Important' : ''}. Appuyez pour ouvrir.`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className={cn(
        'w-full text-left flex items-start gap-3 rounded-xl p-3 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors',
        n.read ? 'bg-transparent' : 'bg-muted/60',
        critical && 'border border-red-200 bg-red-50/60',
        soleilMode && !critical && 'text-black',
      )}
    >
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', SEVERITY_TONE[n.severity] ?? 'bg-muted text-muted-foreground')}>
        <SeverityIcon className="w-4 h-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn('text-sm font-medium', soleilMode && 'text-black')}>{groupTitle ?? n.title}</p>
          {critical && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
              <AlertTriangle className="w-3 h-3" aria-hidden /> Important
            </span>
          )}
          {groupCount > 1 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              ×{groupCount}
            </span>
          )}
          {!n.read && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentColor }} aria-label="Non lue" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 break-words">{n.body}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <CategoryIcon className="w-3 h-3" aria-hidden />{categoryLabel(n.category)}
          </span>
          <span className="text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
          {n.origin === 'device' && !n.synced && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
              <Clock3 className="w-3 h-3" aria-hidden /> En attente de synchronisation
            </span>
          )}
        </div>
        {hasAction && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            className="mt-2 min-h-[36px] rounded-lg px-3 text-xs font-semibold bg-secondary hover:bg-secondary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ color: accentColor }}
          >
            {n.actionLabel}
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <RowIconButton label="Écouter cette notification" onClick={(e) => { e.stopPropagation(); tataSpeak(`${n.title}. ${n.body}`) }}>
          <Volume2 className="w-3.5 h-3.5" aria-hidden />
        </RowIconButton>
        {!n.read && (
          <RowIconButton label="Marquer comme lue" onClick={(e) => { e.stopPropagation(); onRead() }}>
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
          </RowIconButton>
        )}
        <RowIconButton label={n.archivedAt ? 'Restaurer la notification' : 'Archiver la notification'} onClick={(e) => { e.stopPropagation(); onArchive() }}>
          {n.archivedAt ? <ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> : <Archive className="w-3.5 h-3.5" aria-hidden />}
        </RowIconButton>
        <RowIconButton label="Supprimer cette notification" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <X className="w-3.5 h-3.5" aria-hidden />
        </RowIconButton>
      </div>
    </div>
  )
}

function RowIconButton({ label, onClick, children }: { label: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      {children}
    </button>
  )
}
