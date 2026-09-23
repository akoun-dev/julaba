'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function InsPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <h1 className="text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">{title}</h1>
      {subtitle ? <p className="max-w-3xl text-xs leading-5 text-[#64748B] sm:text-sm">{subtitle}</p> : null}
    </div>
  )
}

interface InsErrorBannerProps { message: string; onRetry?: () => void }

export function InsErrorBanner({ message, onRetry }: InsErrorBannerProps) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2 text-sm text-red-800">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        <span className="break-words">{message}</span>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="w-full shrink-0 border-red-200 text-red-800 hover:bg-red-100 sm:w-auto">
          <RefreshCw size={14} />
          Réessayer
        </Button>
      ) : null}
    </div>
  )
}

interface InsEmptyStateProps { title: string; actionLabel?: string; onAction?: () => void }

export function InsEmptyState({ title, actionLabel, onAction }: InsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-10 text-center sm:px-6 sm:py-12">
      <p className="text-sm text-[#64748B]">{title}</p>
      {actionLabel && onAction ? <Button variant="outline" size="sm" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  )
}

interface InsKpiCardProps { label: string; value: string; hint?: string }

export function InsKpiCard({ label, value, hint }: InsKpiCardProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
      <p className="truncate text-xs font-medium text-[#64748B]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
      {hint ? <p className="mt-1 break-words text-xs leading-4 text-[#64748B]">{hint}</p> : null}
    </div>
  )
}

export function InsKpiCardSkeleton() {
  return <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5"><Skeleton className="h-3 w-24 bg-slate-200" /><Skeleton className="mt-3 h-7 w-16 bg-slate-200" /><Skeleton className="mt-2 h-3 w-28 bg-slate-200" /></div>
}

export function InsCardSkeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5', className)}><Skeleton className="h-4 w-40 bg-slate-200" /><Skeleton className="mt-4 h-4 w-full bg-slate-200" /><Skeleton className="mt-2 h-4 w-4/5 bg-slate-200" /><Skeleton className="mt-2 h-4 w-3/5 bg-slate-200" /></div>
}

export function InsTableRowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return <div className="space-y-3 px-4 py-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-4 sm:gap-6">{Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className={cn('h-4 bg-slate-200', j === 0 ? 'w-24 sm:w-32' : 'w-full')} style={{ flex: j === 0 ? '0 0 6rem' : undefined }} />)}</div>)}</div>
}

interface InsPaginationProps { page: number; totalPages: number; total: number; onPageChange: (page: number) => void }

export function InsPagination({ page, totalPages, total, onPageChange }: InsPaginationProps) {
  const hasPrevious = page > 1
  const hasNext = page < totalPages
  return (
    <div className="flex flex-col gap-3 border-t border-[#E2E8F0] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <p className="text-xs text-[#64748B]">{total.toLocaleString('fr-FR')} résultat{total > 1 ? 's' : ''} · page {page} / {Math.max(totalPages, 1)}</p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Button variant="outline" size="sm" disabled={!hasPrevious} onClick={() => onPageChange(page - 1)}><ChevronLeft size={14} />Précédent</Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>Suivant<ChevronRight size={14} /></Button>
      </div>
    </div>
  )
}

export function useInsReload() {
  const [reloadKey, setReloadKey] = useState(0)
  return { reloadKey, reload: () => setReloadKey((k) => k + 1) }
}
