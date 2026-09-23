'use client'

// Dialogues de l'Académie back-office (DET-001 tranche 7, MODE-993) :
// aperçu, création/édition, suppression — JSX verbatim depuis
// bo-academie-screen.tsx. Les trois Dialog/AlertDialog sont portaux :
// les réunir dans un fragment ne change ni le DOM ni le comportement.

import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Plus, Trash2, Timer, Users } from 'lucide-react'
import {
  getTabIcon,
  getStatusStyle,
  getDifficultyStyle,
  TAB_CONFIG,
} from './academie-parts'
import {
  TARGET_ROLES,
  MODULES_BY_ROLE,
  DURATIONS,
  type ContentItem,
  type AcademieForm,
  type ContentTab,
  type ContentStatus,
  type Difficulty,
} from '@/lib/bo-academie-data'

interface BoAcademieDialogsProps {
  showPreview: ContentItem | null
  setShowPreview: (item: ContentItem | null) => void
  isDark: boolean
  formatDate: (d: string) => string
  openEdit: (item: ContentItem) => void
  showDialog: boolean
  setShowDialog: (open: boolean) => void
  editItem: ContentItem | null
  form: AcademieForm
  setForm: Dispatch<SetStateAction<AcademieForm>>
  handleSave: () => void
  saving: boolean
  deleteTarget: ContentItem | null
  setDeleteTarget: (item: ContentItem | null) => void
  handleDelete: () => void
}

export function BoAcademieDialogs({
  showPreview,
  setShowPreview,
  isDark,
  formatDate,
  openEdit,
  showDialog,
  setShowDialog,
  editItem,
  form,
  setForm,
  handleSave,
  saving,
  deleteTarget,
  setDeleteTarget,
  handleDelete,
}: BoAcademieDialogsProps) {
  return (
    <>
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

    </>
  )
}
