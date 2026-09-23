'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Primitives d'état partagées de l'univers institution (INS-*) — surface
// claire proche backoffice light : fond #F8FAFC, bordures #E2E8F0,
// accent #3B82F6, cards rounded-2xl ombre légère.

export function InsPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">{title}</h1>
      {subtitle ? <p className="text-sm text-[#64748B]">{subtitle}</p> : null}
    </div>
  )
}

interface InsErrorBannerProps {
  message: string
  onRetry?: () => void
}

export function InsErrorBanner({ message, onRetry }: InsErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-red-800">
        <TriangleAlert size={18} className="shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="shrink-0 border-red-200 text-red-800 hover:bg-red-100"
        >
          <RefreshCw size={14} />
          Réessayer
        </Button>
      ) : null}
    </div>
  )
}

interface InsEmptyStateProps {
  title: string
  actionLabel?: string
  onAction?: () => void
}

export function InsEmptyState({ title, actionLabel, onAction }: InsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center">
      <p className="text-sm text-[#64748B]">{title}</p>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

interface InsKpiCardProps {
  label: string
  value: string
  hint?: string
}

export function InsKpiCard({ label, value, hint }: InsKpiCardProps) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#64748B]">{hint}</p> : null}
    </div>
  )
}

export function InsKpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <Skeleton className="h-3 w-24 bg-slate-200" />
      <Skeleton className="mt-3 h-7 w-16 bg-slate-200" />
      <Skeleton className="mt-2 h-3 w-28 bg-slate-200" />
    </div>
  )
}

export function InsCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-[#E2E8F0] bg-white p-5', className)}>
      <Skeleton className="h-4 w-40 bg-slate-200" />
      <Skeleton className="mt-4 h-4 w-full bg-slate-200" />
      <Skeleton className="mt-2 h-4 w-4/5 bg-slate-200" />
      <Skeleton className="mt-2 h-4 w-3/5 bg-slate-200" />
    </div>
  )
}

export function InsTableRowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 px-4 py-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn('h-4 bg-slate-200', j === 0 ? 'w-32' : 'w-full')}
              style={{ flex: j === 0 ? '0 0 8rem' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface InsPaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

export function InsPagination({ page, totalPages, total, onPageChange }: InsPaginationProps) {
  const hasPrevious = page > 1
  const hasNext = page < totalPages
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#E2E8F0] px-4 py-3">
      <p className="text-xs text-[#64748B]">
        {total.toLocaleString('fr-FR')} résultat{total > 1 ? 's' : ''} · page {page} /{' '}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={14} />
          Précédent
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Suivant
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

export function useInsReload() {
  const [reloadKey, setReloadKey] = useState(0)
  return { reloadKey, reload: () => setReloadKey((k) => k + 1) }
}