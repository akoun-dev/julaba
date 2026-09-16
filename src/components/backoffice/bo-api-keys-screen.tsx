'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus,
  Key,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Label } from '@/components/ui/label'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

interface ApiKey {
  id: string
  name: string
  key: string
  description: string | null
  createdAt: string
  lastUsedAt: string | null
  isActive: boolean
  requestCount: number
  expiresAt: string | null
}

// ============== HELPERS ==============

function maskKey(key: string): string {
  const prefix = key.slice(0, 7) // 'sk-jl-xx'
  const last4 = key.slice(-4)
  return `${prefix}...${last4}`
}

// ============== MAIN COMPONENT ==============

export function BoApiKeysScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKey, setNewKey] = useState({ name: '', description: '', expiry: '90' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/api-keys')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const raw: Record<string, unknown>[] = Array.isArray(data) ? data : data.keys ?? []
      const mapped: ApiKey[] = raw.map((r) => ({
        id: r.id as string,
        name: (r.name as string) || '',
        key: (r.key as string) || '',
        description: (r.description as string) ?? null,
        createdAt: ((r.created_at ?? r.createdAt) as string) || new Date().toISOString(),
        lastUsedAt: ((r.last_used_at ?? r.lastUsedAt) as string) ?? null,
        isActive: (r.is_active ?? r.isActive ?? true) as boolean,
        requestCount: (r.request_count ?? r.requestCount ?? 0) as number,
        expiresAt: ((r.expires_at ?? r.expiresAt) as string) ?? null,
      }))
      setKeys(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return keys.filter((k) => {
      const matchSearch = !searchQuery || k.name.toLowerCase().includes(searchQuery.toLowerCase()) || (k.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchSearch
    })
  }, [keys, searchQuery])

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRevoke = async (id: string) => {
    setRevokeTarget(null)
    const previous = keys
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: false } : k))
    try {
      const res = await fetch('/api/backoffice/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: false }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
    } catch {
      setKeys(previous)
      setError('Impossible de révoquer la clé. Réessayez.')
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/backoffice/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKey.name,
          description: newKey.description || undefined,
          expiresInDays: parseInt(newKey.expiry),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.erreur || `Erreur ${res.status}`)
      setKeys((prev) => [data, ...prev])
      setCreatedKey(data.secret)
      setShowCreateDialog(false)
      setNewKey({ name: '', description: '', expiry: '90' })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur lors de la création.')
    } finally {
      setCreating(false)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const totalRequests = keys.filter(k => k.isActive).reduce((s, k) => s + k.requestCount, 0)

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')} style={{ minHeight: '100%' }}>
      {/* Header */}
      <BoPageHeader
        title="Clés API"
        description="Gestion des clés d'API pour les intégrations partenaires"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total clés</p>
            {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{keys.length}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Actives</p>
            {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-emerald-600">{keys.filter(k => k.isActive).length}</p>}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Requêtes (30j)</p>
            {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{(totalRequests / 1000000).toFixed(1)}M</p>}
          </CardContent>
        </Card>
      </div>

      {/* Created Key Banner */}
      {createdKey && (
        <Card className={isDark ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50'}>
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}><CheckCircle2 className={`h-4 w-4 inline-block mr-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />Nouvelle clé créée avec succès</p>
              <code className={`text-xs font-mono mt-1 block break-all rounded px-2 py-1 ${isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-100/50 text-emerald-700'}`}>
                {createdKey}
              </code>
              <p className={`text-xs mt-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}><AlertTriangle className="h-3.5 w-3.5 inline-block mr-1 text-amber-500" />Copiez cette clé maintenant. Elle ne sera plus affichée.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className={`text-xs ${isDark ? 'border-emerald-500/20 hover:bg-emerald-500/10' : 'border-emerald-300 hover:bg-emerald-100'}`} onClick={() => { copyKey(createdKey, 'new'); setCreatedKey(null) }}>
                <Copy className="h-3 w-3 mr-1" /> Copier & Fermer
              </Button>
              <Button size="sm" variant="ghost" className={`text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} onClick={() => setCreatedKey(null)}>Fermer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 sm:max-w-xs w-full">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <Input placeholder="Rechercher une clé..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { setCreateError(null); setShowCreateDialog(true) }} className="whitespace-nowrap">
          <Plus className="h-4 w-4 mr-2" />
          Créer clé
        </Button>
      </div>

      {/* Error */}
      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Keys Table */}
      {!loading && !error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Clé</TableHead>
                    <TableHead className="text-xs">Créée le</TableHead>
                    <TableHead className="text-xs">Dernière utilisation</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs text-right">Requêtes</TableHead>
                    <TableHead className="text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell className="text-xs py-3">
                        <div>
                          <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{apiKey.name}</p>
                          <p className={`text-[11px] mt-0.5 max-w-[180px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{apiKey.description}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-3">
                        <div className="flex items-center gap-1">
                          <code className={`text-[11px] font-mono ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                          </code>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => toggleVisibility(apiKey.id)} aria-label={visibleKeys.has(apiKey.id) ? 'Masquer la clé' : 'Afficher la clé'}>
                            {visibleKeys.has(apiKey.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copyKey(apiKey.key, apiKey.id)} aria-label="Copier la clé">
                            {copiedKey === apiKey.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatDate(apiKey.createdAt)}</TableCell>
                      <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatDate(apiKey.lastUsedAt)}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${apiKey.isActive ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700')}`}>
                          {apiKey.isActive ? 'Active' : 'Révoquée'}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-xs py-3 text-right font-medium tabular-nums whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                        {apiKey.requestCount.toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {apiKey.isActive && (
                          <Button variant="ghost" size="sm" className={`h-7 text-xs text-red-500 hover:text-red-700 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`} onClick={() => setRevokeTarget(apiKey.id)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Révoquer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filtered.length === 0 && (
              <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Key className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune clé trouvée</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading Table */}
      {loading && !error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs">Clé</TableHead>
                  <TableHead className="text-xs">Créée le</TableHead>
                  <TableHead className="text-xs">Dernière utilisation</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs text-right">Requêtes</TableHead>
                  <TableHead className="text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24 mt-1" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-7 w-20 mx-auto" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une clé API</DialogTitle>
            <DialogDescription>Générez une nouvelle clé d'API pour votre intégration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom de la clé</Label>
              <Input placeholder="Ex: Production API v2" value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Usage prévu de cette clé" value={newKey.description} onChange={(e) => setNewKey({ ...newKey, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Durée d'expiration</Label>
              <Select value={newKey.expiry} onValueChange={(v) => setNewKey({ ...newKey, expiry: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                  <SelectItem value="180">180 jours</SelectItem>
                  <SelectItem value="365">1 an</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!newKey.name || creating}>
              <Key className="h-4 w-4 mr-2" />
              {creating ? 'Génération…' : 'Générer la clé'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé API ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les applications utilisant cette clé perdront l'accès immédiatement.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => revokeTarget && handleRevoke(revokeTarget)}>
              Révoquer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
