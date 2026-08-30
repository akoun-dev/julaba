'use client'

import { useEffect } from 'react'
import { Bell, CheckCircle2, Gift, CloudOff, XCircle, PiggyBank, CheckCheck } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotificationsStore, type AppNotification } from '@/lib/stores/notifications-store'

const TYPE_ICON: Record<AppNotification['type'], typeof Bell> = {
  bienvenue: Gift,
  sync_conflict: CloudOff,
  dossier_valide: CheckCircle2,
  dossier_rejete: XCircle,
  tontine_cotisation: PiggyBank,
}

const TYPE_TONE: Record<AppNotification['type'], string> = {
  bienvenue: 'bg-blue-50 text-blue-600',
  sync_conflict: 'bg-red-50 text-red-600',
  dossier_valide: 'bg-green-50 text-green-600',
  dossier_rejete: 'bg-red-50 text-red-600',
  tontine_cotisation: 'bg-purple-50 text-purple-600',
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
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead } = useNotificationsStore()

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-center items-center">
          <SheetTitle className={cn(soleilMode && 'text-black')}>Notifications</SheetTitle>
          <SheetDescription>
            {unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}` : 'Vous êtes à jour.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {unreadCount > 0 && (
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={() => markAllRead()} className="h-8 text-xs" style={{ color: accentColor }}>
                <CheckCheck className="w-3.5 h-3.5 mr-1" /> Tout marquer comme lu
              </Button>
            </div>
          )}

          {loading && notifications.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
          )}

          {!loading && notifications.length === 0 && (
            <div className="text-center py-10">
              <Bell className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Aucune notification pour le moment.</p>
            </div>
          )}

          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.read && markRead(n.id)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 rounded-xl p-3 transition-colors',
                    n.read ? 'bg-transparent' : 'bg-muted/60'
                  )}
                >
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', TYPE_TONE[n.type] ?? 'bg-muted text-muted-foreground')}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm font-medium truncate', soleilMode && 'text-black')}>{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
