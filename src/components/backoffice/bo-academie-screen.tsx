'use client'

// Écran Académie back-office — orchestrateur (DET-001 tranche 7, MODE-993).
// La logique pure (mapper API, filtrage par acteur, groupement par module,
// statistiques globales) vit dans src/lib/bo-academie-data.ts avec tests ;
// les vues vivent dans ./academie/* (toolbar, views, dialogs, parts), JSX
// verbatim. Ce module garde l'état, le CRUD et la structure <Tabs>.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Eye,
  BookMarked,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'
import {
  mapContentItem,
  matchesActor,
  groupContentsByModule,
  computeGlobalStats,
  type ContentItem,
  type AcademieForm,
  type ContentTab,
  type ContentStatus,
  type Difficulty,
} from '@/lib/bo-academie-data'
import { BoAcademieToolbar } from './academie/academie-toolbar'
import { BoAcademieViews } from './academie/academie-views'
import { BoAcademieDialogs } from './academie/academie-dialogs'
import { ACTOR_TABS } from './academie/academie-parts'

// ============== MAIN COMPONENT ==============

export function BoAcademieScreen() {

  const searchQuery = useBackofficeStore((s) => s.searchQuery)
  const setSearchQuery = useBackofficeStore((s) => s.setSearchQuery)
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'

  const [activeActor, setActiveActor] = useState<string>('tous')
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())
  const [contents, setContents] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [showPreview, setShowPreview] = useState<ContentItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null)
  const [editItem, setEditItem] = useState<ContentItem | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('tous')
  const [typeFilter, setTypeFilter] = useState<string>('tous')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AcademieForm>({
    title: '',
    type: 'tutoriels' as ContentTab,
    content: '',
    excerpt: '',
    category: '',
    status: 'brouillon' as ContentStatus,
    difficulty: 'debutant' as Difficulty,
    duration: '',
    targetRole: '',
    mediaUrl: '',
  })
  // ============ DATA ============

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/contenus')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const raw = Array.isArray(data) ? data : data.contents ?? []
      const mapped = raw.map((c: Record<string, unknown>) => mapContentItem(c)) as ContentItem[]
      setContents(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  // ============ COMPUTED ============

  // An actor tab shows its own content plus anything general (targetRole
  // ''/undefined applies to every actor); "Tous les acteurs" shows everything.
  const actorCounts = useMemo(() => {
    const counts: Record<string, number> = { tous: contents.length }
    for (const tab of ACTOR_TABS) {
      if (tab.value === 'tous') continue
      counts[tab.value] = contents.filter((c) => matchesActor(c, tab.value)).length
    }
    return counts
  }, [contents])
  const filtered = useMemo(() => {
    return contents.filter((c) => {
      const matchActor = matchesActor(c, activeActor)
      const matchType = typeFilter === 'tous' || c.tab === typeFilter
      const matchSearch = !searchQuery ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.excerpt ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'tous' || c.status === statusFilter
      const matchDifficulty = difficultyFilter === 'tous' || c.difficulty === difficultyFilter
      return matchActor && matchType && matchSearch && matchStatus && matchDifficulty
    })
  }, [contents, activeActor, typeFilter, searchQuery, statusFilter, difficultyFilter])
  // Grouped for the card view — modules the active actor is expected to
  // have (MODULES_BY_ROLE) come first in that order; any other category
  // actually present in the data still gets its own section, appended
  // alphabetically, with uncategorized items collected last.
  const groupedByModule = useMemo(
    () => groupContentsByModule(filtered, activeActor),
    [filtered, activeActor]
  )
  const globalStats = useMemo(() => computeGlobalStats(contents), [contents])
  const hasActiveFilters = statusFilter !== 'tous' || difficultyFilter !== 'tous' || typeFilter !== 'tous' || !!searchQuery

  const toggleModule = (name: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  // ============ CRUD ============

  const openCreate = () => {
    setEditItem(null)
    setForm({
      title: '', type: 'tutoriels', content: '', excerpt: '', category: '', status: 'brouillon',
      difficulty: 'debutant', duration: '', targetRole: activeActor === 'tous' ? '' : activeActor, mediaUrl: '',
    })
    setShowDialog(true)
  }

  const openEdit = (item: ContentItem) => {
    setEditItem(item)
    setForm({
      title: item.title,
      type: item.tab,
      content: item.content ?? '',
      excerpt: item.excerpt ?? '',
      category: item.category,
      status: item.status,
      difficulty: item.difficulty ?? 'debutant',
      duration: item.duration ?? '',
      targetRole: item.targetRole ?? '',
      mediaUrl: item.mediaUrl ?? '',
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...(editItem ? { id: editItem.id } : {}),
        title: form.title,
        type: form.type,
        content: form.content,
        excerpt: form.excerpt,
        category: form.category,
        status: form.status,
        difficulty: form.difficulty,
        duration: form.duration,
        targetRole: form.targetRole,
        mediaUrl: form.mediaUrl,
      }

      const method = editItem ? 'PATCH' : 'POST'
      const res = await fetch('/api/backoffice/contenus', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.erreur ?? `Erreur ${res.status}`)
      }

      await fetchData()
      setShowDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/backoffice/contenus?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await fetchData()
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression')
    }
  }

  const handleTogglePublish = async (item: ContentItem) => {
    const newStatus: ContentStatus = item.status === 'publie' ? 'brouillon' : 'publie'
    try {
      const res = await fetch('/api/backoffice/contenus', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour')
    }
  }

  const clearFilters = () => {
    setStatusFilter('tous')
    setDifficultyFilter('tous')
    setTypeFilter('tous')
    setSearchQuery('')
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

  // ============ RENDER ============

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100%' }}>
      {/* Header */}
      <BoPageHeader
        title="Académie"
        description="Gestion de l'académie : tutoriels, FAQ et articles"
      />

      <Separator />

      {/* Global Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total contenus', value: globalStats.total, icon: <BookMarked className="h-4 w-4" />, color: isDark ? 'text-blue-400' : 'text-blue-600' },
          { label: 'Publiés', value: globalStats.published, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600' },
          { label: 'Tutoriels', value: globalStats.tutorials, icon: <Lightbulb className="h-4 w-4" />, color: isDark ? 'text-amber-400' : 'text-amber-600' },
          { label: 'Vues totales', value: globalStats.totalViews, icon: <Eye className="h-4 w-4" />, color: isDark ? 'text-purple-400' : 'text-purple-600' },
        ].map((stat) => (
          <Card key={stat.label} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{stat.label}</p>
                <span className={stat.color}>{stat.icon}</span>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {stat.value.toLocaleString('fr-FR')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Actor tabs + Toolbar */}
      <Tabs value={activeActor} onValueChange={(v) => { setActiveActor(v); setStatusFilter('tous'); setDifficultyFilter('tous'); setTypeFilter('tous') }}>
        <div className="flex flex-col gap-4">
          <BoAcademieToolbar
            actorCounts={actorCounts}
            openCreate={openCreate}
            isDark={isDark}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            difficultyFilter={difficultyFilter}
            setDifficultyFilter={setDifficultyFilter}
            hasActiveFilters={hasActiveFilters}
            clearFilters={clearFilters}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />

          {/* Error State */}
          {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

          {/* Content */}
          <TabsContent value={activeActor} className="mt-0">
            <BoAcademieViews
              viewMode={viewMode}
              loading={loading}
              error={error}
              isDark={isDark}
              groupedByModule={groupedByModule}
              collapsedModules={collapsedModules}
              toggleModule={toggleModule}
              filtered={filtered}
              setShowPreview={setShowPreview}
              handleTogglePublish={handleTogglePublish}
              openEdit={openEdit}
              setDeleteTarget={setDeleteTarget}
              hasActiveFilters={hasActiveFilters}
              clearFilters={clearFilters}
              openCreate={openCreate}
              formatDate={formatDate}
            />
          </TabsContent>
        </div>
      </Tabs>

      <BoAcademieDialogs
        showPreview={showPreview}
        setShowPreview={setShowPreview}
        isDark={isDark}
        formatDate={formatDate}
        openEdit={openEdit}
        showDialog={showDialog}
        setShowDialog={setShowDialog}
        editItem={editItem}
        form={form}
        setForm={setForm}
        handleSave={handleSave}
        saving={saving}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        handleDelete={handleDelete}
      />
    </div>
  )
}
