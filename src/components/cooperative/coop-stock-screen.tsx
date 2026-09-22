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
import { useEffect, useMemo, useState } from 'react'
import { Package, Plus, Send, RefreshCw, ArrowLeft, Search } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type StockCommunItem } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CoopScreenShell } from './coop-shell'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

// MODE-982 (DET-COOP-011) — vocabulaire de catégories produits (le MÊME
// que le stock marchand) : optionnel à l'apport, filtre à la liste.
const CATEGORIES_PRODUITS = ['légumes', 'fruits', 'tubercules', 'céréales', 'protéines', 'ingrédients', 'légumineuses', 'autre'] as const

export function CoopStockScreen() {
  const userRole = useAppStore((s) => s.userRole)
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
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

  // MODE-982 (DET-COOP-011) — recherche + filtre catégorie de la liste.
  const [recherche, setRecherche] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState<string>('toutes')
  // MODE-982 — catégorie (optionnelle) d'un NOUVEL apport : sans elle la
  // colonne categorie du pot commun restait à null et le filtre sans objet.
  const [categorieApport, setCategorieApport] = useState<string>('')

  // MODE-935 (I-05) — l'unité d'un produit déjà dans le pot commun est
  // VERROUILLÉE : le serveur refuse tout apport dans une autre unité
  // (5 kg + 3 sacs ne feront jamais « 8 sacs ») — l'écran l'impose avant
  // même l'envoi en verrouillant le champ et en affichant l'unité réelle.
  const produitExistant = stock.find(
    (s) => s.produit.toLowerCase() === produit.trim().toLowerCase()
  )

  useEffect(() => {
    // Chargement selon le rôle : président (session cooperateur) ou membre
    // (session marchand) — la route stock accepte les deux gardes.
    if (!merchantId) return
    if (userRole === 'cooperateur') {
      void chargerEspaceCooperateur(merchantId, ['resume', 'stock'])
      return
    }
    // MODE-922 : le marchand membre qui arrive depuis « Ma coopérative »
    // voit le stock commun immédiatement (chargement direct via sa
    // session marchand) — plus de liste vide tant qu'il ne rafraîchit pas.
    void (async () => {
      const res = await fetch(`/api/cooperatives/stock?merchantId=${encodeURIComponent(merchantId)}`)
      if (res.ok) {
        const data = await res.json()
        useCooperativeStore.setState({ stock: data.stock ?? [] })
      }
    })()
  }, [merchantId, userRole, chargerEspaceCooperateur])

  const rafraichir = async () => {
    if (!merchantId) return
    if (userRole === 'cooperateur') {
      await chargerEspaceCooperateur(merchantId, ['resume', 'stock'])
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
        // MODE-982 — la catégorie choisie part avec l'apport (route POST
        // stock l'accepte depuis MODE-921 ; le pot commun devient filtrable).
        categorie: categorieApport || undefined,
        quantite: quantiteNum,
        unite: produitExistant ? produitExistant.unite : unite,
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
      setCategorieApport('')
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

  // MODE-982 — dérivations pures au rendu : recherche (produit), filtre
  // catégorie (chips DÉRIVÉES des catégories RÉELLEMENT présentes —
  // un chip sans objet n'existe pas), compteur honnête produits × unités.
  const stockFiltré = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return stock.filter((item) => {
      if (q && !item.produit.toLowerCase().includes(q)) return false
      if (filtreCategorie !== 'toutes' && (item.categorie ?? '') !== filtreCategorie) return false
      return true
    })
  }, [stock, recherche, filtreCategorie])
  const catégoriesPrésentes = useMemo(
    () => Array.from(new Set(stock.map((s) => s.categorie).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, 'fr')),
    [stock]
  )
  const totalUnités = stockFiltré.reduce((s, item) => s + item.quantite, 0)

  // MODE-974 (G11) — le contenu est partagé entre les DEUX habillages :
  // le président hérite du shell (drawer/sidebar, erreurs globales, cloche),
  // le marchand membre garde son habillage dédié avec bouton retour vers
  // « Ma coopérative » (il n'a ni barre coopérative ni sidebar).
  const contenu = (
    <>
      <header className="px-4 pt-5 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* MODE-922 : le marchand n'a pas la barre coopérateur ici —
              un retour explicite vers « Ma coopérative » évite l'impasse. */}
          {userRole === 'marchand' && (
            <button
              onClick={() => navigate('ma-cooperative')}
              className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border shrink-0"
              aria-label="Retour à Ma coopérative"
            >
              <ArrowLeft className="w-5 h-5" style={{ color: COOP_COLOR }} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">Stock commun</h1>
            <p className="text-sm text-muted-foreground">Le pot commun de la coopérative</p>
          </div>
        </div>
        <button
          onClick={() => void rafraichir()}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border"
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

      {/* Liste du stock — MODE-982 : compteur réel + recherche + filtre
          catégorie dérivé des données (rangée cachée si < 2 catégories :
          filtrer ne changerait rien — pas de bouton décoratif). */}
      <section className="px-4 mt-4 space-y-2" aria-label="Produits du stock commun">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">Produits disponibles</h2>
          {stock.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80" role="status">
              {stockFiltré.length === stock.length
                ? `${stock.length} produit${stock.length > 1 ? 's' : ''} · ${totalUnités.toLocaleString('fr-FR')} unité${totalUnités > 1 ? 's' : ''}`
                : `${stockFiltré.length} sur ${stock.length} · ${totalUnités.toLocaleString('fr-FR')} unité${totalUnités > 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        {stock.length > 0 && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un produit"
                className="pl-9 h-12 min-h-[44px]"
                aria-label="Rechercher un produit du stock commun"
              />
            </div>
            {catégoriesPrésentes.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
                <button
                  onClick={() => setFiltreCategorie('toutes')}
                  aria-pressed={filtreCategorie === 'toutes'}
                  className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
                  style={
                    filtreCategorie === 'toutes'
                      ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                      : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
                  }
                >
                  Toutes
                </button>
                {catégoriesPrésentes.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFiltreCategorie(c)}
                    aria-pressed={filtreCategorie === c}
                    className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
                    style={
                      filtreCategorie === c
                        ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                        : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {stock.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <Package className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                Le pot commun est vide. Apportez un premier produit — les membres peuvent aussi apporter depuis « Ma coopérative ».
              </p>
            </CardContent>
          </Card>
        ) : stockFiltré.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Aucun produit ne correspond à cette recherche ou ce filtre.
            </CardContent>
          </Card>
        ) : (
          stockFiltré.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{item.produit}</p>
                  <p className="text-sm" style={{ color: COOP_COLOR }}>
                    {item.quantite.toLocaleString('fr-FR')} {item.unite}
                  </p>
                  {item.categorie && <p className="text-[11px] text-muted-foreground/80">{item.categorie}</p>}
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
              {produitExistant
                ? `Ce produit est déjà compté en « ${produitExistant.unite} » — l'unité est verrouillée et votre apport s'ajoute à la ligne existante.`
                : "L'apport s'ajoute à la quantité existante du produit (une ligne par produit et une seule unité par produit)."}
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
            {/* MODE-982 — catégorie optionnelle (vocabulaire partagé du
                stock marchand) : elle alimente le filtre de la liste. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégorie du produit">
              {CATEGORIES_PRODUITS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategorieApport(categorieApport === c ? '' : c)}
                  aria-pressed={categorieApport === c}
                  className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
                  style={
                    categorieApport === c
                      ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                      : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
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
                value={produitExistant ? produitExistant.unite : unite}
                onChange={(e) => setUnite(e.target.value || 'kg')}
                placeholder="Unité (kg, sac…)"
                className="h-12 w-28"
                aria-label={produitExistant ? `Unité verrouillée : ${produitExistant.unite}` : 'Unité'}
                maxLength={12}
                disabled={Boolean(produitExistant)}
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
              <p className="text-sm text-muted-foreground">Aucun membre actif à qui distribuer.</p>
            ) : (
              membresActifs.map((m) => {
                const part = parts.find((p) => p.membreId === m.id)
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-foreground truncate">
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
    </>
  )

  if (userRole === 'cooperateur') {
    return <CoopScreenShell>{contenu}</CoopScreenShell>
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      {contenu}
    </div>
  )
}
