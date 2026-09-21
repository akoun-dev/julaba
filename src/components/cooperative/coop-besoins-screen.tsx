'use client'

/**
 * MODE-921 — Achats groupés : besoins des membres (président).
 * Groupes agrégés par produit::unité (module pur agregerBesoins),
 * consolidation, dispatch (statut, quantité attribuée, prix achat /
 * dispatch) puis distribution liée au besoinId (MODE-922 : depuis cet
 * écran, destinataire = le marchand demandeur, et le besoin passe à
 * « livre » après une distribution réussie).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useState } from 'react'
import { ClipboardList, Layers, CheckCircle2, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { agregerBesoins } from '@/lib/cooperatives/agregation'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import type { BesoinCoop } from '@/lib/stores/cooperative-store'

export function CoopBesoinsScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const { besoins, groupes, chargerEspaceCooperateur, traiterBesoin, marquerBesoinLivre, consoliderBesoins, distribuerStock, syncError, clearSyncError } = useCooperativeStore()

  const [vue, setVue] = useState<'groupes' | 'tous'>('groupes')
  const [dispatchBesoin, setDispatchBesoin] = useState<BesoinCoop | null>(null)
  const [quantiteAttribuee, setQuantiteAttribuee] = useState('')
  const [prixAchat, setPrixAchat] = useState('')
  const [prixDispatch, setPrixDispatch] = useState('')
  // MODE-922 : distribution liée au besoin (modal dédiée).
  const [distributionBesoin, setDistributionBesoin] = useState<BesoinCoop | null>(null)
  const [quantiteDistribution, setQuantiteDistribution] = useState('')
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ texte: string; perdu?: boolean } | null>(null)

  useEffect(() => {
    if (merchantId && useAppStore.getState().userRole === 'cooperateur') {
      void chargerEspaceCooperateur(merchantId, ['resume', 'besoins'])
    }
  }, [merchantId, chargerEspaceCooperateur])

  // Recalcul local des groupes depuis l'état courant (toujours à jour).
  const groupesRecalcules = besoins.length > 0 ? agregerBesoins(besoins) : groupes

  const annoncer = (texte: string, perdu = false) => {
    setFeedback({ texte, perdu })
    window.setTimeout(() => setFeedback(null), 5000)
  }

  const consoliderTout = async () => {
    if (!merchantId) return
    setBusy(true)
    try {
      await consoliderBesoins(merchantId)
      annoncer('Besoins en attente consolidés.')
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Consolidation impossible', true)
    } finally {
      setBusy(false)
    }
  }

  const consoliderGroupe = async (produit: string, unite: string) => {
    if (!merchantId) return
    setBusy(true)
    try {
      await consoliderBesoins(merchantId, { produit, unite })
      annoncer(`Besoins « ${produit} » consolidés.`)
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Consolidation impossible', true)
    } finally {
      setBusy(false)
    }
  }

  const ouvrirDispatch = (besoin: BesoinCoop) => {
    setDispatchBesoin(besoin)
    setQuantiteAttribuee(besoin.quantiteAttribuee ? String(besoin.quantiteAttribuee) : String(besoin.quantite))
    setPrixAchat(besoin.prixAchat ? String(besoin.prixAchat) : '')
    setPrixDispatch(besoin.prixDispatch ? String(besoin.prixDispatch) : '')
    setErreur('')
  }

  const soumettreDispatch = async () => {
    if (!merchantId || !dispatchBesoin) return
    const q = Number(quantiteAttribuee.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) {
      setErreur('Quantité attribuée invalide.')
      return
    }
    const prixAchatNum = prixAchat ? Number(prixAchat.replace(/\s/g, '')) : undefined
    const prixDispatchNum = prixDispatch ? Number(prixDispatch.replace(/\s/g, '')) : undefined
    setBusy(true)
    try {
      await traiterBesoin(merchantId, dispatchBesoin.id, {
        statut: 'en_cours',
        quantiteAttribuee: q,
        prixAchat: prixAchatNum,
        prixDispatch: prixDispatchNum,
      })
      annoncer('Besoin pris en charge — distribuez le produit depuis le stock commun.')
      setDispatchBesoin(null)
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  // MODE-922 : distribution liée au besoinId — le destinataire unique est
  // le marchand demandeur, la quantité est préremplie avec la quantité
  // attribuée. Hors file (comme toute distribution) : réseau requis.
  const ouvrirDistribution = (besoin: BesoinCoop) => {
    setDistributionBesoin(besoin)
    setQuantiteDistribution(besoin.quantiteAttribuee ? String(besoin.quantiteAttribuee) : String(besoin.quantite))
    setErreur('')
  }

  const soumettreDistributionLiaison = async () => {
    if (!merchantId || !distributionBesoin) return
    const q = Number(quantiteDistribution.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) {
      setErreur('Quantité invalide.')
      return
    }
    setBusy(true)
    setErreur('')
    try {
      await distribuerStock(merchantId, {
        produit: distributionBesoin.produit,
        quantite: q,
        unite: distributionBesoin.unite,
        destinataires: [{ membreId: distributionBesoin.marchandId, quantite: q }],
        besoinId: distributionBesoin.id,
      })
      // MODE-942 (AUDIT-003 I-06) — la RPC coop_distribuer_stock a clôturé
      // le besoin ('livre') dans la MÊME transaction que le mouvement de
      // stock : plus de PATCH après-coup qui pouvait échouer (stock parti,
      // besoin re-distribuable). Ici, alignement LOCAL de l'affichage
      // seulement — le fait serveur est certain.
      marquerBesoinLivre(distributionBesoin.id)
      annoncer(`Distribution enregistrée — « ${distributionBesoin.produit} » livré au marchand.`)
      setDistributionBesoin(null)
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Distribution impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      <header className="px-4 pt-6 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Achats groupés</h1>
          <p className="text-sm text-stone-500">Besoins des membres, groupés par produit</p>
        </div>
        <button
          onClick={() => merchantId && void chargerEspaceCooperateur(merchantId, ['resume', 'besoins'])}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-border"
          aria-label="Rafraîchir les besoins"
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

      {/* Bascule de vue (aria-pressed) */}
      <div className="px-4 mt-2 flex gap-2" role="group" aria-label="Vue des besoins">
        <button
          onClick={() => setVue('groupes')}
          aria-pressed={vue === 'groupes'}
          className="flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors"
          style={vue === 'groupes' ? { backgroundColor: COOP_COLOR, color: '#fff', borderColor: COOP_COLOR } : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }}
        >
          Groupes
        </button>
        <button
          onClick={() => setVue('tous')}
          aria-pressed={vue === 'tous'}
          className="flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors"
          style={vue === 'tous' ? { backgroundColor: COOP_COLOR, color: '#fff', borderColor: COOP_COLOR } : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }}
        >
          Tous les besoins
        </button>
      </div>

      {/* Groupes agrégés */}
      {vue === 'groupes' && (
        <section className="px-4 mt-4 space-y-3" aria-label="Besoins groupés par produit">
          {groupesRecalcules.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <ClipboardList className="w-8 h-8 mx-auto text-stone-300" />
                <p className="text-sm text-stone-500">Aucun besoin en attente. Les membres déposent leurs besoins depuis « Ma coopérative ».</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Button
                onClick={() => void consoliderTout()}
                disabled={busy}
                variant="outline"
                className="w-full h-11 min-h-[44px]"
              >
                <Layers className="w-4 h-4 mr-2" />
                Tout consolider
              </Button>
              {groupesRecalcules.map((g) => (
                <Card key={g.cle}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-stone-900">{g.produit}</p>
                        <p className="text-xs text-stone-500">
                          {g.quantiteTotale.toLocaleString('fr-FR')} {g.unite} · {g.nbBesoins} besoin(s)
                        </p>
                      </div>
                      {g.priorite === 'urgente' && (
                        <span className="shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[11px] font-semibold">
                          urgent
                        </span>
                      )}
                    </div>
                    {g.prixMax != null && (
                      <p className="text-xs text-stone-500">Prix max indiqué : {g.prixMax.toLocaleString('fr-FR')} FCFA</p>
                    )}
                    <button
                      onClick={() => void consoliderGroupe(g.produit, g.unite)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium min-h-[44px] hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Consolider ce groupe
                    </button>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </section>
      )}

      {/* Tous les besoins */}
      {vue === 'tous' && (
        <section className="px-4 mt-4 space-y-2" aria-label="Tous les besoins">
          {besoins.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-stone-500">
                Aucun besoin déposé pour le moment.
              </CardContent>
            </Card>
          ) : (
            besoins.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">
                        {b.produit} — {b.quantite.toLocaleString('fr-FR')} {b.unite}
                      </p>
                      <p className="text-xs text-stone-500">
                        Statut : {b.statut.replace('_', ' ')} ·{' '}
                        {new Date(b.date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    {b.priorite === 'urgente' && (
                      <span className="shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[11px] font-semibold">
                        urgent
                      </span>
                    )}
                  </div>
                  {b.statut === 'en_attente' && (
                    <button
                      onClick={() => ouvrirDispatch(b)}
                      className="w-full rounded-full text-xs font-semibold text-white min-h-[44px]"
                      style={{ backgroundColor: COOP_COLOR }}
                    >
                      Prendre en charge
                    </button>
                  )}
                  {b.statut === 'en_cours' && (
                    <button
                      onClick={() => ouvrirDistribution(b)}
                      className="w-full rounded-full text-xs font-semibold text-white min-h-[44px]"
                      style={{ backgroundColor: COOP_COLOR }}
                    >
                      Distribuer au marchand
                    </button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </section>
      )}

      {/* Lien vers le pot commun pour distribuer */}
      <p className="px-4 mt-4 text-xs text-stone-400 text-center">
        La distribution physique du stock se fait depuis l&apos;écran{' '}
        <button onClick={() => navigate('coop-stock')} className="underline" style={{ color: COOP_COLOR }}>
          Stock commun
        </button>
        .
      </p>

      {/* Modal dispatch */}
      <AlertDialog open={dispatchBesoin !== null} onOpenChange={(open) => { if (!open) { setDispatchBesoin(null); setErreur('') } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Prendre en charge le besoin</AlertDialogTitle>
            <AlertDialogDescription>
              {dispatchBesoin && `${dispatchBesoin.produit} — demandé : ${dispatchBesoin.quantite.toLocaleString('fr-FR')} ${dispatchBesoin.unite}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={quantiteAttribuee}
              onChange={(e) => setQuantiteAttribuee(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="Quantité attribuée"
              inputMode="decimal"
              className="h-12"
              aria-label="Quantité attribuée"
            />
            <Input
              value={prixAchat}
              onChange={(e) => setPrixAchat(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="Prix d'achat FCFA (optionnel)"
              inputMode="numeric"
              className="h-12"
              aria-label="Prix d'achat en FCFA"
            />
            <Input
              value={prixDispatch}
              onChange={(e) => setPrixDispatch(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="Prix de dispatch FCFA (optionnel)"
              inputMode="numeric"
              className="h-12"
              aria-label="Prix de dispatch en FCFA"
            />
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void soumettreDispatch() }}
              disabled={busy}
            >
              Enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal distribution liée au besoin (MODE-922) */}
      <AlertDialog open={distributionBesoin !== null} onOpenChange={(open) => { if (!open) { setDistributionBesoin(null); setErreur('') } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Distribuer au marchand</AlertDialogTitle>
            <AlertDialogDescription>
              {distributionBesoin &&
                `${distributionBesoin.produit} — demandé : ${distributionBesoin.quantite.toLocaleString('fr-FR')} ${distributionBesoin.unite}. La distribution est verrouillée côté serveur : jamais de stock négatif.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={quantiteDistribution}
              onChange={(e) => setQuantiteDistribution(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="Quantité à distribuer"
              inputMode="decimal"
              className="h-12"
              aria-label="Quantité à distribuer au marchand"
            />
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void soumettreDistributionLiaison() }}
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
