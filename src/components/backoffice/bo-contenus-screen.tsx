'use client'

import { useState, useMemo } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

// ============== TYPES ==============

type ContentTab = 'tutoriels' | 'faq' | 'articles'
type ContentStatus = 'publie' | 'brouillon' | 'archive'

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
}

// ============== MOCK DATA ==============

const INITIAL_CONTENTS: ContentItem[] = [
  { id: 'c-1', title: 'Comment créer un compte marchand', category: 'Onboarding', status: 'publie', views: 3420, createdAt: '2026-07-15T10:00:00Z', updatedAt: '2026-08-20T14:00:00Z', author: 'Koffi YAO', tab: 'tutoriels', excerpt: 'Guide pas à pas pour les marchands souhaitant rejoindre la plateforme Jùlaba.' },
  { id: 'c-2', title: 'Guide de prise en main de l\'application', category: 'Utilisation', status: 'publie', views: 5610, createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-08-25T09:00:00Z', author: 'Aminata KONÉ', tab: 'tutoriels', excerpt: 'Découvrez toutes les fonctionnalités de l\'application Jùlaba en quelques minutes.' },
  { id: 'c-3', title: 'Enregistrer une vente avec voice', category: 'Ventes', status: 'brouillon', views: 0, createdAt: '2026-08-27T10:00:00Z', updatedAt: '2026-08-27T10:00:00Z', author: 'Moussa TRAORÉ', tab: 'tutoriels', excerpt: 'Apprenez à utiliser la commande vocale pour enregistrer vos ventes rapidement.' },
  { id: 'c-4', title: 'Gérer son stock efficacement', category: 'Stock', status: 'publie', views: 2190, createdAt: '2026-07-20T14:00:00Z', updatedAt: '2026-08-15T11:00:00Z', author: 'Fatou SORO', tab: 'tutoriels', excerpt: 'Conseils et bonnes pratiques pour optimiser la gestion de votre stock.' },
  { id: 'c-5', title: 'Qu\'est-ce que Jùlaba ?', category: 'Général', status: 'publie', views: 8930, createdAt: '2026-05-10T08:00:00Z', updatedAt: '2026-08-01T16:00:00Z', author: 'Aminata KONÉ', tab: 'faq', excerpt: 'Présentation complète de la plateforme Jùlaba et de sa mission.' },
  { id: 'c-6', title: 'Comment contacter le support ?', category: 'Support', status: 'publie', views: 4560, createdAt: '2026-06-15T10:00:00Z', updatedAt: '2026-08-10T14:00:00Z', author: 'Koffi YAO', tab: 'faq', excerpt: 'Les différentes façons de joindre l\'équipe support de Jùlaba.' },
  { id: 'c-7', title: 'Quels sont les tarifs ?', category: 'Général', status: 'brouillon', views: 0, createdAt: '2026-08-26T09:00:00Z', updatedAt: '2026-08-26T09:00:00Z', author: 'Moussa TRAORÉ', tab: 'faq', excerpt: 'Page en cours de rédaction sur les tarifs de la plateforme.' },
  { id: 'c-8', title: 'Lancement de Jùlaba Marketplace', category: 'Actualité', status: 'publie', views: 12450, createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-08-01T08:00:00Z', author: 'Aminata KONÉ', tab: 'articles', excerpt: 'Annonce officielle du lancement de la marketplace Jùlaba pour les marchands.' },
  { id: 'c-9', title: 'Nouvelles fonctionnalités de la v2.5', category: 'Produit', status: 'publie', views: 6780, createdAt: '2026-08-15T10:00:00Z', updatedAt: '2026-08-15T10:00:00Z', author: 'Koffi YAO', tab: 'articles', excerpt: 'Découvrez les nouveautés de la version 2.5 : voice commands, scoring, et plus.' },
  { id: 'c-10', title: 'Témoignage : Coopérative Akwaba', category: 'Témoignage', status: 'archive', views: 3200, createdAt: '2026-05-20T14:00:00Z', updatedAt: '2026-07-01T10:00:00Z', author: 'Fatou SORO', tab: 'articles', excerpt: 'La coopérative Akwaba témoigne de son expérience avec Jùlaba depuis 6 mois.' },
  { id: 'c-11', title: 'Comprendre le score financier', category: 'Scoring', status: 'publie', views: 4520, createdAt: '2026-07-01T08:00:00Z', updatedAt: '2026-08-18T10:00:00Z', author: 'Aminata KONÉ', tab: 'tutoriels', excerpt: 'Explication du système de scoring financier et comment l\'améliorer.' },
]

const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  publie: { label: 'Publié', color: 'bg-emerald-100 text-emerald-700', icon: <Globe className="h-3 w-3" /> },
  brouillon: { label: 'Brouillon', color: 'bg-amber-100 text-amber-700', icon: <PenTool className="h-3 w-3" /> },
  archive: { label: 'Archivé', color: 'bg-gray-100 text-gray-600', icon: <Archive className="h-3 w-3" /> },
}

const CATEGORIES: Record<ContentTab, string[]> = {
  tutoriels: ['Onboarding', 'Utilisation', 'Ventes', 'Stock', 'Scoring'],
  faq: ['Général', 'Support', 'Technique', 'Facturation'],
  articles: ['Actualité', 'Produit', 'Témoignage', 'Partenaire'],
}

const TAB_CONFIG: Record<ContentTab, { label: string; icon: React.ReactNode }> = {
  tutoriels: { label: 'Tutoriels', icon: <BookOpen className="h-4 w-4" /> },
  faq: { label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  articles: { label: 'Articles', icon: <Newspaper className="h-4 w-4" /> },
}

// ============== MAIN COMPONENT ==============

export function BoContenusScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [activeTab, setActiveTab] = useState<ContentTab>('tutoriels')
  const [contents, setContents] = useState<ContentItem[]>(INITIAL_CONTENTS)
  const [showDialog, setShowDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<ContentItem | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [form, setForm] = useState({ title: '', content: '', category: '', status: 'brouillon' as ContentStatus })

  const tabCounts = useMemo(() => ({
    tutoriels: contents.filter((c) => c.tab === 'tutoriels').length,
    faq: contents.filter((c) => c.tab === 'faq').length,
    articles: contents.filter((c) => c.tab === 'articles').length,
  }), [contents])

  const filtered = useMemo(() => {
    return contents.filter((c) => {
      const matchTab = c.tab === activeTab
      const matchSearch = !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.category.toLowerCase().includes(searchQuery.toLowerCase()) || c.author.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'tous' || c.status === statusFilter
      return matchTab && matchSearch && matchStatus
    })
  }, [contents, activeTab, searchQuery, statusFilter])

  const tabStats = useMemo(() => {
    const tabItems = contents.filter((c) => c.tab === activeTab)
    return {
      total: tabItems.length,
      published: tabItems.filter((c) => c.status === 'publie').length,
      totalViews: tabItems.reduce((sum, c) => sum + c.views, 0),
    }
  }, [contents, activeTab])

  const openCreate = () => {
    setEditItem(null)
    setForm({ title: '', content: '', category: '', status: 'brouillon' })
    setShowDialog(true)
  }

  const openEdit = (item: ContentItem) => {
    setEditItem(item)
    setForm({ title: item.title, content: '', category: item.category, status: item.status })
    setShowDialog(true)
  }

  const handleSave = () => {
    if (editItem) {
      setContents((prev) => prev.map((c) => c.id === editItem.id ? { ...c, title: form.title, category: form.category, status: form.status, updatedAt: new Date().toISOString() } : c))
    } else {
      const newItem: ContentItem = {
        id: `c-${Date.now()}`,
        title: form.title,
        category: form.category,
        status: form.status,
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'Aminata KONÉ',
        tab: activeTab,
        excerpt: '',
      }
      setContents((prev) => [newItem, ...prev])
    }
    setShowDialog(false)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    setContents((prev) => prev.filter((c) => c.id !== deleteTarget))
    setDeleteTarget(null)
  }

  const handleTogglePublish = (id: string) => {
    setContents((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const newStatus: ContentStatus = c.status === 'publie' ? 'brouillon' : 'publie'
      return { ...c, status: newStatus, updatedAt: new Date().toISOString() }
    }))
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          <span className="inline-flex items-center gap-2"><BookOpen className="h-6 w-6" />CONTENUS</span>
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Gestion de l&apos;académie : tutoriels, FAQ et articles
        </p>
      </div>

      <Separator />

      {/* Tab Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Total {TAB_CONFIG[activeTab].label.toLowerCase()}</p>
            <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{tabStats.total}</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Publiés</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{tabStats.published}</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Vues totales</p>
            <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{tabStats.totalViews.toLocaleString('fr-FR')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Toolbar */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as ContentTab); setStatusFilter('tous') }}>
        <div className="flex flex-col gap-4">
          {/* Tab bar + Actions row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="tutoriels" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Tutoriels
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] rounded-full">{tabCounts.tutoriels}</Badge>
              </TabsTrigger>
              <TabsTrigger value="faq" className="gap-1.5">
                <HelpCircle className="h-3.5 w-3.5" /> FAQ
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] rounded-full">{tabCounts.faq}</Badge>
              </TabsTrigger>
              <TabsTrigger value="articles" className="gap-1.5">
                <Newspaper className="h-3.5 w-3.5" /> Articles
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] rounded-full">{tabCounts.articles}</Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button onClick={openCreate} className={`whitespace-nowrap ${isDark ? '' : 'shadow-sm'}`}>
                <Plus className="h-4 w-4 mr-2" />
                Créer
              </Button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <Input
                placeholder="Rechercher par titre, catégorie, auteur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous</SelectItem>
                <SelectItem value="publie">Publié</SelectItem>
                <SelectItem value="brouillon">Brouillon</SelectItem>
                <SelectItem value="archive">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <div className={`flex border rounded-md p-0.5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm" className="h-7 w-7 p-0"
                onClick={() => setViewMode('card')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm" className="h-7 w-7 p-0"
                onClick={() => setViewMode('table')}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <TabsContent value={activeTab} className="mt-0">
            {/* Card View */}
            {viewMode === 'card' && (
              <div className="space-y-3">
                {filtered.map((item) => {
                  const sc = STATUS_CONFIG[item.status]
                  return (
                    <Card key={item.id} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm hover:shadow-md'} transition-all duration-200 group`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                            <FileText className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 shrink-0 font-medium ${sc.color}`}>
                                {sc.icon}
                                <span className="ml-1">{sc.label}</span>
                              </Badge>
                            </div>
                            {item.excerpt && (
                              <p className={`text-xs mt-0.5 line-clamp-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{item.excerpt}</p>
                            )}
                            <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{item.category}</Badge>
                              <span>{item.author}</span>
                              <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{item.views.toLocaleString('fr-FR')}</span>
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleTogglePublish(item.id)} title={item.status === 'publie' ? 'Dépublier' : 'Publier'}>
                              {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)} title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 text-red-500 hover:text-red-700 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`} onClick={() => setDeleteTarget(item.id)} title="Supprimer">
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

            {/* Table View */}
            {viewMode === 'table' && (
              <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Titre</TableHead>
                        <TableHead className="text-xs">Catégorie</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs text-right">Vues</TableHead>
                        <TableHead className="text-xs">Auteur</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const sc = STATUS_CONFIG[item.status]
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="py-3">
                              <p className={`text-sm font-medium truncate max-w-[250px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{item.category}</Badge>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium ${sc.color}`}>
                                {sc.icon}<span className="ml-1">{sc.label}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className={`py-3 text-right text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{item.views.toLocaleString('fr-FR')}</TableCell>
                            <TableCell className={`py-3 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{item.author}</TableCell>
                            <TableCell className={`py-3 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{formatDate(item.createdAt)}</TableCell>
                            <TableCell className="py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleTogglePublish(item.id)}>
                                  {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => setDeleteTarget(item.id)}>
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

            {filtered.length === 0 && (
              <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                <Archive className="h-14 w-14 mx-auto mb-4 opacity-30" />
                <p className="text-sm font-medium">Aucun contenu trouvé</p>
                <p className="text-xs mt-1">Créez un nouveau contenu ou modifiez vos filtres</p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editItem ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editItem ? 'Modifier le contenu' : 'Nouveau contenu'}
            </DialogTitle>
            <DialogDescription>
              {editItem ? 'Modifiez les informations du contenu.' : 'Renseignez les informations du nouveau contenu.'}
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
              <Label className="text-xs font-medium">Contenu</Label>
              <Textarea
                placeholder="Rédigez le contenu ici..."
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Catégorie *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES[activeTab].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!form.title || !form.category}>
              {editItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Supprimer le contenu ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le contenu sera définitivement supprimé de la plateforme.
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
