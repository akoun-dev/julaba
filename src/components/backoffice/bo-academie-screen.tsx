'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Plus,
  BookOpen,
  Pencil,
  Eye,
  Archive,
  FileText,
  HelpCircle,
  Newspaper,
  Trash2,
  EyeOff,
  LayoutGrid,
  LayoutList,
  Globe,
  PenTool,
  Clock,
  BarChart3,
  Users,
  Filter,
  X,
  ChevronDown,
  Sparkles,
  Tag,
  Timer,
  Target,
  AlertTriangle,
  CheckCircle2,
  BookMarked,
  Lightbulb,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type ContentTab = 'tutoriels' | 'faq' | 'articles'
type ContentStatus = 'publie' | 'brouillon' | 'archive'
type Difficulty = 'debutant' | 'intermediaire' | 'avance'

interface ContentItem {
  id: string
  title: string
  category: string
  status: ContentStatus
  views: number
  createdAt: string
  updatedAt: string
  author: string
  tab: ContentTab
  excerpt?: string
  content?: string
  difficulty?: Difficulty
  duration?: string
  targetRole?: string
  mediaUrl?: string
  sortOrder: number
}

// ============== CONSTANTS ==============

const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bgLight: string; bgDark: string; icon: React.ReactNode }> = {
  publie: {
    label: 'Publié',
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50 border-emerald-200',
    bgDark: 'bg-emerald-500/10 border-emerald-500/20',
    icon: <Globe className="h-3 w-3" />,
  },
  brouillon: {
    label: 'Brouillon',
    color: 'text-amber-700',
    bgLight: 'bg-amber-50 border-amber-200',
    bgDark: 'bg-amber-500/10 border-amber-500/20',
    icon: <PenTool className="h-3 w-3" />,
  },
  archive: {
    label: 'Archivé',
    color: 'text-gray-600',
    bgLight: 'bg-gray-50 border-gray-200',
    bgDark: 'bg-slate-700 border-slate-600',
    icon: <Archive className="h-3 w-3" />,
  },
}

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; color: string; icon: React.ReactNode }> = {
  debutant: { label: 'Débutant', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <Sparkles className="h-3 w-3" /> },
  intermediaire: { label: 'Intermédiaire', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: <BarChart3 className="h-3 w-3" /> },
  avance: { label: 'Avancé', color: 'text-red-600 bg-red-50 border-red-200', icon: <AlertTriangle className="h-3 w-3" /> },
}

const DIFFICULTY_CONFIG_DARK: Record<Difficulty, { color: string }> = {
  debutant: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  intermediaire: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  avance: { color: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

const TAB_CONFIG: Record<ContentTab, { label: string; icon: React.ReactNode; color: string }> = {
  tutoriels: { label: 'Tutoriels', icon: <BookOpen className="h-4 w-4" />, color: 'text-blue-600' },
  faq: { label: 'FAQ', icon: <HelpCircle className="h-4 w-4" />, color: 'text-purple-600' },
  articles: { label: 'Articles', icon: <Newspaper className="h-4 w-4" />, color: 'text-orange-600' },
}

// Content is browsed actor-first, module-second: an item's `targetRole`
// picks which actor tab it lives under (an empty targetRole — "tous les
// rôles" — means general content, so it shows up under every actor tab as
// well as under "Tous les acteurs"), and within a tab its `category` picks
// which module section it's grouped into.
const ACTOR_TABS = [
  { value: 'tous', label: 'Tous les acteurs', icon: <Users className="h-4 w-4" /> },
  { value: 'marchand', label: 'Marchands', icon: <BookMarked className="h-4 w-4" /> },
  { value: 'producteur', label: 'Producteurs', icon: <Sparkles className="h-4 w-4" /> },
  { value: 'identificateur', label: 'Identificateurs', icon: <Target className="h-4 w-4" /> },
  { value: 'cooperative', label: 'Coopératives', icon: <Tag className="h-4 w-4" /> },
] as const

const TARGET_ROLES = [
  { value: 'marchand', label: 'Marchand' },
  { value: 'producteur', label: 'Producteur' },
  { value: 'identificateur', label: 'Identificateur' },
  { value: 'cooperative', label: 'Coopérative' },
]

// Suggested modules per actor tab — a starting point for the "Module"
// field, not an enforced taxonomy: any category value already saved on a
// content item still gets its own section even if it isn't in this list.
const MODULES_BY_ROLE: Record<string, string[]> = {
  marchand: ['Onboarding', 'Ventes', 'Stock', 'Paiements', 'Keiwa', 'Scoring', 'Compte'],
  producteur: ['Récoltes', 'Cultures', 'Commandes', 'Journal', 'Paiements', 'Compte'],
  identificateur: ['Enrôlement', 'Terrain', 'Zones', 'Missions', 'Compte'],
  cooperative: ['Gestion', 'Membres', 'Finances', 'Compte'],
  tous: ['Général', 'Onboarding', 'Support', 'Technique', 'Facturation', 'Sécurité', 'Compte', 'Actualité', 'Produit', 'Témoignage', 'Partenaire', 'Guide', 'Conseil'],
}

const DURATIONS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '1h', '2h']

// ============== HELPERS ==============

function getTabConfig(tab: string | undefined) {
  return TAB_CONFIG[tab as ContentTab] ?? {
    label: tab || 'Contenu',
    icon: <FileText className="h-4 w-4" />,
    color: 'text-slate-500',
  }
}

function getTabIcon(tab: string | undefined, isDark: boolean) {
  const config = getTabConfig(tab)
  const color = isDark ? 'text-slate-400' : config.color
  return <span className={color}>{config.icon}</span>
}

function getStatusStyle(status: ContentStatus, isDark: boolean) {
  const cfg = STATUS_CONFIG[status]
  return {
    className: `border ${isDark ? cfg.bgDark : cfg.bgLight} ${cfg.color}`,
    icon: cfg.icon,
    label: cfg.label,
  }
}

function getDifficultyStyle(difficulty: Difficulty | undefined, isDark: boolean) {
  if (!difficulty) return null
  const cfg = DIFFICULTY_CONFIG[difficulty]
  const darkCfg = DIFFICULTY_CONFIG_DARK[difficulty]
  return {
    className: `border ${isDark ? darkCfg.color : cfg.color}`,
    icon: cfg.icon,
    label: cfg.label,
  }
}

// ============== MAIN COMPONENT ==============

export function BoAcademieScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
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
  const [form, setForm] = useState({
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
      const mapped = raw.map((c: Record<string, unknown>) => ({
        id: c.id,
        title: c.title,
        category: c.category ?? '',
        status: c.status ?? 'brouillon',
        views: c.viewCount ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: c.author ?? '',
        tab: (c.type as ContentTab) ?? 'articles',
        excerpt: c.excerpt ?? '',
        content: c.content ?? '',
        difficulty: c.difficulty ?? 'debutant',
        duration: c.duration ?? '',
        targetRole: c.targetRole ?? '',
        mediaUrl: c.mediaUrl ?? '',
        sortOrder: (c.sortOrder as number) ?? 0,
      })) as ContentItem[]
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
  const matchesActor = useCallback((c: ContentItem, actor: string) =>
    actor === 'tous' || c.targetRole === actor || !c.targetRole, [])

  const actorCounts = useMemo(() => {
    const counts: Record<string, number> = { tous: contents.length }
    for (const tab of ACTOR_TABS) {
      if (tab.value === 'tous') continue
      counts[tab.value] = contents.filter((c) => matchesActor(c, tab.value)).length
    }
    return counts
  }, [contents, matchesActor])

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
  }, [contents, activeActor, typeFilter, searchQuery, statusFilter, difficultyFilter, matchesActor])

  // Grouped for the card view — modules the active actor is expected to
  // have (MODULES_BY_ROLE) come first in that order; any other category
  // actually present in the data still gets its own section, appended
  // alphabetically, with uncategorized items collected last.
  const groupedByModule = useMemo(() => {
    const map = new Map<string, ContentItem[]>()
    for (const item of filtered) {
      const key = item.category || 'Sans module'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const moduleOrder = MODULES_BY_ROLE[activeActor] || MODULES_BY_ROLE.tous
    const orderIndex = (name: string) => {
      const idx = moduleOrder.indexOf(name)
      return idx === -1 ? moduleOrder.length : idx
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Sans module') return 1
      if (b === 'Sans module') return -1
      const diff = orderIndex(a) - orderIndex(b)
      return diff !== 0 ? diff : a.localeCompare(b, 'fr')
    })
  }, [filtered, activeActor])

  const globalStats = useMemo(() => ({
    total: contents.length,
    published: contents.filter((c) => c.status === 'publie').length,
    totalViews: contents.reduce((sum, c) => sum + c.views, 0),
    tutorials: contents.filter((c) => c.tab === 'tutoriels').length,
  }), [contents])

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
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
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
          {/* Actor tab bar + Actions row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList className="flex-wrap h-auto">
              {ACTOR_TABS.map((actor) => (
                <TabsTrigger key={actor.value} value={actor.value} className="gap-1.5">
                  {actor.icon}
                  <span>{actor.label}</span>
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] rounded-full">{actorCounts[actor.value] ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            <Button onClick={openCreate} className={`whitespace-nowrap ${isDark ? '' : 'shadow-sm'}`}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau contenu
            </Button>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <Input
                placeholder="Rechercher par titre, module, auteur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les types</SelectItem>
                  {(['tutoriels', 'faq', 'articles'] as const).map((tab) => (
                    <SelectItem key={tab} value={tab}>{TAB_CONFIG[tab].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les statuts</SelectItem>
                  <SelectItem value="publie">Publié</SelectItem>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="archive">Archivé</SelectItem>
                </SelectContent>
              </Select>

              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-40">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Difficulté" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Toutes</SelectItem>
                  <SelectItem value="debutant">Débutant</SelectItem>
                  <SelectItem value="intermediaire">Intermédiaire</SelectItem>
                  <SelectItem value="avance">Avancé</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Effacer
                </Button>
              )}
            </div>

            <div className={`flex border rounded-md p-0.5 ml-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm" className="h-9 w-9 p-0"
                onClick={() => setViewMode('card')}
                aria-label="Affichage en cartes"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm" className="h-9 w-9 p-0"
                onClick={() => setViewMode('table')}
                aria-label="Affichage en tableau"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Error State */}
          {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

          {/* Content */}
          <TabsContent value={activeActor} className="mt-0">
            {/* Loading State */}
            {loading && !error && (
              viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                      <CardContent className="p-5">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                          <div className="flex gap-3 pt-1">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Titre</TableHead>
                          <TableHead className="text-xs">Catégorie</TableHead>
                          <TableHead className="text-xs">Difficulté</TableHead>
                          <TableHead className="text-xs">Public</TableHead>
                          <TableHead className="text-xs">Statut</TableHead>
                          <TableHead className="text-xs text-right">Vues</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-3"><Skeleton className="h-4 w-48" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-3 w-20" /></TableCell>
                            <TableCell className="py-3"><div className="flex justify-end gap-1"><Skeleton className="h-7 w-7" /><Skeleton className="h-7 w-7" /><Skeleton className="h-7 w-7" /></div></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )
            )}

            {/* Card View — grouped by module within the active actor tab */}
            {!loading && !error && viewMode === 'card' && (
              <div className="space-y-6">
                {groupedByModule.map(([moduleName, items]) => {
                  const isCollapsed = collapsedModules.has(moduleName)
                  return (
                    <div key={moduleName}>
                      <button
                        type="button"
                        onClick={() => toggleModule(moduleName)}
                        className={`flex w-full items-center gap-2 mb-3 text-left group/module`}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${isDark ? 'text-slate-500' : 'text-gray-400'} ${isCollapsed ? '-rotate-90' : ''}`} />
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {moduleName}
                        </h3>
                        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] rounded-full">{items.length}</Badge>
                        <Separator className="flex-1 ml-2" />
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {items.map((item) => {
                            const sc = getStatusStyle(item.status, isDark)
                            const dc = getDifficultyStyle(item.difficulty, isDark)
                            return (
                              <Card key={item.id} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm hover:shadow-md'} transition-all duration-200 group`}>
                                <CardContent className="p-5">
                                  <div className="flex flex-col gap-3">
                                    {/* Top row: badges */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                                        {getTabIcon(item.tab, isDark)}
                                         {getTabConfig(item.tab).label}
                                      </Badge>
                                      <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-medium border ${sc.className}`}>
                                        {sc.icon}
                                        <span className="ml-1">{sc.label}</span>
                                      </Badge>
                                      {dc && (
                                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-medium border ${dc.className}`}>
                                          {dc.icon}
                                          <span className="ml-1">{dc.label}</span>
                                        </Badge>
                                      )}
                                      {item.targetRole && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                          <Users className="h-2.5 w-2.5 mr-1" />
                                          {TARGET_ROLES.find((r) => r.value === item.targetRole)?.label ?? item.targetRole}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Title */}
                                    <h3 className={`font-semibold text-sm leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                      {item.title}
                                    </h3>

                                    {/* Excerpt */}
                                    {item.excerpt && (
                                      <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {item.excerpt}
                                      </p>
                                    )}

                                    {/* Meta row */}
                                    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                      {item.duration && (
                                        <span className="flex items-center gap-1">
                                          <Timer className="h-3 w-3" />
                                          {item.duration}
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        {item.views.toLocaleString('fr-FR')}
                                      </span>
                                      <span>{formatDate(item.createdAt)}</span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-1 pt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 px-2 text-xs gap-1.5"
                                        onClick={() => setShowPreview(item)}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Aperçu
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleTogglePublish(item)}
                                        title={item.status === 'publie' ? 'Dépublier' : 'Publier'}
                                      >
                                        {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => openEdit(item)}
                                        title="Modifier"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className={`h-8 w-8 p-0 text-red-500 hover:text-red-700 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
                                        onClick={() => setDeleteTarget(item)}
                                        title="Supprimer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Table View */}
            {!loading && !error && viewMode === 'table' && (
              <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Titre</TableHead>
                        <TableHead className="text-xs">Catégorie</TableHead>
                        <TableHead className="text-xs">Difficulté</TableHead>
                        <TableHead className="text-xs">Public</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs text-right">Vues</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const sc = getStatusStyle(item.status, isDark)
                        const dc = getDifficultyStyle(item.difficulty, isDark)
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="py-3">
                              <div>
                                <p className={`text-sm font-medium truncate max-w-[250px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
                                {item.duration && (
                                  <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                    <Timer className="h-3 w-3" />{item.duration}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{item.category || '—'}</Badge>
                            </TableCell>
                            <TableCell className="py-3">
                              {dc ? (
                                <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium border ${dc.className}`}>
                                  {dc.icon}<span className="ml-1">{dc.label}</span>
                                </Badge>
                              ) : (
                                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {item.targetRole ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                  {TARGET_ROLES.find((r) => r.value === item.targetRole)?.label ?? item.targetRole}
                                </Badge>
                              ) : (
                                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Tous</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium border ${sc.className}`}>
                                {sc.icon}<span className="ml-1">{sc.label}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className={`py-3 text-right text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                              {item.views.toLocaleString('fr-FR')}
                            </TableCell>
                            <TableCell className={`py-3 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                              {formatDate(item.createdAt)}
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowPreview(item)} aria-label="Aperçu">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleTogglePublish(item)} aria-label={item.status === 'publie' ? 'Dépublier' : 'Publier'}>
                                  {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)} aria-label="Modifier">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => setDeleteTarget(item)} aria-label="Supprimer">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                {hasActiveFilters ? (
                  <>
                    <Filter className="h-14 w-14 mx-auto mb-4 opacity-30" />
                    <p className="text-sm font-medium">Aucun résultat pour ces filtres</p>
                    <p className="text-xs mt-1">Essayez de modifier ou supprimer vos filtres</p>
                    <Button variant="link" onClick={clearFilters} className="mt-3 text-xs">
                      Effacer les filtres
                    </Button>
                  </>
                ) : (
                  <>
                    <BookOpen className="h-14 w-14 mx-auto mb-4 opacity-30" />
                    <p className="text-sm font-medium">Aucun contenu pour cet acteur</p>
                    <p className="text-xs mt-1">Créez votre premier contenu pour commencer</p>
                    <Button onClick={openCreate} className="mt-4 gap-1.5">
                      <Plus className="h-4 w-4" />
                      Créer
                    </Button>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* ============ PREVIEW DIALOG ============ */}
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {showPreview && getTabIcon(showPreview.tab, isDark)}
              {showPreview?.title}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3 flex-wrap">
              {showPreview && (
                <>
                  <Badge variant="secondary" className={`text-[10px] border ${getStatusStyle(showPreview.status, isDark).className}`}>
                    {getStatusStyle(showPreview.status, isDark).label}
                  </Badge>
                  {showPreview.difficulty && (
                    <Badge variant="secondary" className={`text-[10px] border ${getDifficultyStyle(showPreview.difficulty, isDark)?.className ?? ''}`}>
                      {getDifficultyStyle(showPreview.difficulty, isDark)?.label}
                    </Badge>
                  )}
                  {showPreview.duration && (
                    <span className="flex items-center gap-1 text-xs">
                      <Timer className="h-3 w-3" />{showPreview.duration}
                    </span>
                  )}
                  {showPreview.targetRole && (
                    <span className="flex items-center gap-1 text-xs">
                      <Users className="h-3 w-3" />
                      {TARGET_ROLES.find((r) => r.value === showPreview.targetRole)?.label}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {showPreview && (
            <div className="space-y-4 py-2">
              {showPreview.excerpt && (
                <p className={`text-sm italic ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  {showPreview.excerpt}
                </p>
              )}
              <Separator />
              <div className={`text-sm leading-relaxed whitespace-pre-wrap ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                {showPreview.content || 'Aucun contenu'}
              </div>
              <Separator />
              <div className={`flex items-center gap-4 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                <span>Par {showPreview.author}</span>
                <span>{showPreview.views.toLocaleString('fr-FR')} vues</span>
                <span>{formatDate(showPreview.createdAt)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(null)}>Fermer</Button>
            {showPreview && (
              <Button onClick={() => { setShowPreview(null); openEdit(showPreview) }}>
                <Pencil className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ CREATE/EDIT DIALOG ============ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editItem ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editItem ? 'Modifier le contenu' : 'Nouveau contenu'}
            </DialogTitle>
            <DialogDescription>
              {editItem
                ? 'Modifiez les informations du contenu.'
                : 'Renseignez les informations du nouveau contenu.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Titre *</Label>
              <Input
                placeholder="Titre du contenu"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Résumé</Label>
              <Textarea
                placeholder="Courte description (affichée dans la liste)..."
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Contenu *</Label>
              <Textarea
                placeholder="Rédigez le contenu ici..."
                rows={8}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ContentTab })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['tutoriels', 'faq', 'articles'] as const).map((tab) => (
                      <SelectItem key={tab} value={tab}>{TAB_CONFIG[tab].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Public cible</Label>
                <Select value={form.targetRole || '__tous__'} onValueChange={(v) => setForm({ ...form, targetRole: v === '__tous__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__tous__">Tous les rôles</SelectItem>
                    {TARGET_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Module *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {(MODULES_BY_ROLE[form.targetRole || 'tous'] || MODULES_BY_ROLE.tous).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ContentStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                    <SelectItem value="publie">Publié</SelectItem>
                    <SelectItem value="archive">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Difficulté</Label>
                <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as Difficulty })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debutant">Débutant</SelectItem>
                    <SelectItem value="intermediaire">Intermédiaire</SelectItem>
                    <SelectItem value="avance">Avancé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Durée estimée</Label>
                <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">URL média (optionnel)</Label>
              <Input
                placeholder="https://..."
                value={form.mediaUrl}
                onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.title || !form.category || saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enregistrement...
                </span>
              ) : editItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE DIALOG ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Supprimer ce contenu ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.title}</span>
              <br />
              Cette action est irréversible. Le contenu sera définitivement supprimé de l&apos;académie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
