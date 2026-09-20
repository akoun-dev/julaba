'use client'

/**
 * MODE-921 — Pot commun de stock (président ET marchand membre).
 * Apport + distribution, lisible des deux côtés (lecture par session
 * coopérateur OU marchand). La distribution multi-destinataires refuse
 * tout dépassement côté serveur (jamais de stock négatif) et l'écran
 * affiche l'erreur telle quelle. Feedback sync honnête :
 * synced / en file / perdu (contrat persisted).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useState } from 'react'
import { Package, Plus, Send, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type StockCommunItem } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

export function CoopStockScreen() {
  const userRole = useAppStore((s) => s.userRole)
  const merchantId = useAppStore((s) => s.merchantId)
  const { stock, chargerEspaceCooperateur, apporterStock, distribuerStock, membres, syncError, clearSyncError } = useCooperativeStore()

  const [modalApport, setModalApport] = useState(false)
  const [modalDistribution, setModalDistribution] = useState<StockCommunItem | null>(null)
  const [produit, setProduit] = useState('')
  const [quantite, setQuantite] = useState('')
  const [unite, setUnite] = useState('kg')
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ texte: string; perdu?: boolean } | null>(null)

  // Distribution multi-destinataires : une part par membre.
  const [parts, setParts] = useState<{ membreId: string; nom: string; quantite: string }[]>([])

  useEffect(() => {
    // Chargement selon le rôle : président (session cooperateur) ou membre
    // (session marchand) — la route stock accepte les deux gardes.
    if (!merchantId) return
    if (userRole === 'cooperateur') {
      void chargerEspaceCooperateur(merchantId)
    }
    // Le marchand passe par chargerMaCooperative → pas le stock ici ; le
    // marchand membre lit le stock via sa session marchand (route stock).
  }, [merchantId, userRole, chargerEspaceCooperateur])

  const rafraichir = async () => {
    if (!merchantId) return
    if (userRole === 'cooperateur') {
      await chargerEspaceCooperateur(merchantId)
      return
    }
    // Marchand : le stock est lu via la route stock (session marchand) —
    // chargement direct depuis l'écran marchand-coop (ma-cooperative).
    const res = await fetch(`/api/cooperatives/stock?merchantId=${encodeURIComponent(merchantId)}`)
    if (res.ok) {
      const data = await res.json()
      useCooperativeStore.setState({ stock: data.stock ?? [] })
    }
  }

  const annoncer = (texte: string, perdu = false) => {
    setFeedback({ texte, perdu })
    window.setTimeout(() => setFeedback(null), 5000)
  }

  const soumettreApport = async () => {
    if (!merchantId) return
    const quantiteNum = Number(quantite.replace(',', '.'))
    if (!Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      setErreur('Quantité invalide — strictement positive.')
      return
    }
    if (!produit.trim()) {
      setErreur('Indiquez le produit apporté.')
      return
    }
    setBusy(true)
    setErreur('')
    try {
      const statut = await apporterStock(merchantId, {
        produit: produit.trim(),
        quantite: quantiteNum,
        unite,
      })
      if (statut === 'synced') {
        annoncer('Apport enregistré dans le pot commun.')
        await rafraichir()
      } else if (statut === 'queued') {
        annoncer('Hors ligne : apport mis en file, il partira à la reconnexion.', true)
      } else {
        annoncer('Apport perdu — ni envoyé ni mis en file. Réessayez.', true)
      }
      setModalApport(false)
      setProduit('')
      setQuantite('')
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Apport impossible')
    } finally {
      setBusy(false)
    }
  }

  const soumettreDistribution = async () => {
    if (!merchantId || !modalDistribution) return
    const partsValides = parts
      .map((p) => ({ membreId: p.membreId, nom: p.nom, quantite: Number(p.quantite.replace(',', '.')) }))
      .filter((p) => Number.isFinite(p.quantite) && p.quantite > 0)
    if (partsValides.length === 0) {
      setErreur('Attribuez au moins une part positive.')
      return
    }
    const total = partsValides.reduce((s, p) => s + p.quantite, 0)
    if (total > modalDistribution.quantite) {
      setErreur(`Total demandé (${total.toLocaleString('fr-FR')}) supérieur au disponible (${modalDistribution.quantite.toLocaleString('fr-FR')}).`)
      return
    }
    setBusy(true)
    setErreur('')
    try {
      await distribuerStock(merchantId, {
        produit: modalDistribution.produit,
        quantite: total,
        unite: modalDistribution.unite,
        destinataires: partsValides.map(({ membreId, quantite }) => ({ membreId, quantite })),
      })
      annoncer('Distribution enregistrée — les destinataires sont prévenus.')
      setModalDistribution(null)
      setParts([])
      await rafraichir()
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Distribution impossible')
    } finally {
      setBusy(false)
    }
  }

  const membresActifs = membres.filter((m) => m.statut === 'actif')

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      <header className="px-4 pt-6 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Stock commun</h1>
          <p className="text-sm text-stone-500">Le pot commun de la coopérative</p>
        </div>
        <button
          onClick={() => void rafraichir()}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-border"
          aria-label="Rafraîchir le stock commun"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      {syncError && (
        <p role="alert" className="mx-4 mt-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {syncError}
          <button onClick={clearSyncError} className="ml-2 underline">Fermer</button>
        </p>
      )}
      {feedback && (
        <p role="status" className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm border ${feedback.perdu ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {feedback.texte}
        </p>
      )}

      {/* Actions */}
      <div className="px-4 mt-4 grid grid-cols-1 gap-2">
        <Button
          onClick={() => setModalApport(true)}
          className="w-full h-12 min-h-[44px] text-white font-semibold"
          style={{ backgroundColor: COOP_COLOR }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Apporter au pot commun
        </Button>
      </div>

      {/* Liste du stock */}
      <section className="px-4 mt-4 space-y-2" aria-label="Produits du stock commun">
        <h2 className="text-sm font-semibold text-stone-700 px-1">Produits disponibles</h2>
        {stock.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <Package className="w-8 h-8 mx-auto text-stone-300" />
              <p className="text-sm text-stone-500">
                Le pot commun est vide. Apportez un premier produit — les membres peuvent aussi apporter depuis « Ma coopérative ».
              </p>
            </CardContent>
          </Card>
        ) : (
          stock.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 truncate">{item.produit}</p>
                  <p className="text-sm" style={{ color: COOP_COLOR }}>
                    {item.quantite.toLocaleString('fr-FR')} {item.unite}
                  </p>
                  {item.categorie && <p className="text-[11px] text-stone-400">{item.categorie}</p>}
                </div>
                <button
                  onClick={() => {
                    setModalDistribution(item)
                    setParts([{ membreId: '', nom: '', quantite: '' }])
                    setErreur('')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium min-h-[44px] hover:bg-muted transition-colors shrink-0"
                  aria-label={`Distribuer du ${item.produit}`}
                >
                  <Send className="w-3.5 h-3.5" />
                  Distribuer
                </button>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Modal apport */}
      <AlertDialog open={modalApport} onOpenChange={setModalApport}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apporter au pot commun</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;apport s&apos;ajoute à la quantité existante du produit (une ligne par produit).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={produit}
              onChange={(e) => setProduit(e.target.value)}
              placeholder="Produit (ex : igname)"
              className="h-12"
              aria-label="Produit apporté"
              maxLength={120}
            />
            <div className="flex gap-2">
              <Input
                value={quantite}
                onChange={(e) => setQuantite(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="Quantité"
                inputMode="decimal"
                className="h-12 flex-1"
                aria-label="Quantité apportée"
              />
              <Input
                value={unite}
                onChange={(e) => setUnite(e.target.value || 'kg')}
                placeholder="Unité (kg, sac…)"
                className="h-12 w-28"
                aria-label="Unité"
                maxLength={12}
              />
            </div>
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void soumettreApport() }}
            >
              Apporter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal distribution */}
      <AlertDialog open={modalDistribution !== null} onOpenChange={(open) => { if (!open) { setModalDistribution(null); setParts([]); setErreur('') } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Distribuer {modalDistribution?.produit}</AlertDialogTitle>
            <AlertDialogDescription>
              Disponible : {modalDistribution ? `${modalDistribution.quantite.toLocaleString('fr-FR')} ${modalDistribution.unite}` : ''}.
              La distribution est refusée si le total dépasse le disponible — jamais de stock négatif.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {membresActifs.length === 0 ? (
              <p className="text-sm text-stone-500">Aucun membre actif à qui distribuer.</p>
            ) : (
              membresActifs.map((m) => {
                const part = parts.find((p) => p.membreId === m.id)
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-stone-700 truncate">
                      {m.prenom ?? 'Marchand'} {m.nom ?? ''}
                    </span>
                    <Input
                      value={part?.quantite ?? ''}
                      onChange={(e) => {
                        const valeur = e.target.value.replace(/[^\d.,]/g, '')
                        setParts((prev) => {
                          const existe = prev.find((p) => p.membreId === m.id)
                          if (existe) {
                            return prev.map((p) => (p.membreId === m.id ? { ...p, quantite: valeur } : p))
                          }
                          return [...prev, { membreId: m.id, nom: m.prenom ?? '', quantite: valeur }]
                        })
                      }}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-11 w-24 text-right"
                      aria-label={`Part pour ${m.prenom ?? 'marchand'} en ${modalDistribution?.unite ?? 'unité'}`}
                    />
                  </div>
                )
              })
            )}
          </div>
          {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void soumettreDistribution() }}
              disabled={busy}
            >
              Distribuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
