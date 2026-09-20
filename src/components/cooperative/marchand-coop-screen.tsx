'use client'

/**
 * MODE-921 (§5) — « Ma coopérative » côté MARCHAND.
 * Non-membre : annuaire réel des coopératives actives + demande d'adhésion.
 * En attente : badge + annulation possible via refus président.
 * Membre actif : cotisation annuelle, soumission de besoin, apports au pot
 * commun, distributions reçues. Suspendu/exclu : message honnête.
 * Feedback sync honnête partout (synced / en file / perdu).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useState } from 'react'
import {
  ArrowLeft, Users, Building2, MapPin, BadgeCheck, Clock, Ban,
  Gift, Package, Plus, RefreshCw, Eye, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

const COTISATION_STANDARD = 25000

export function MarchandCoopScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const {
    maCooperative, annuaire, loading, loadError,
    chargerMaCooperative, chargerAnnuaire,
    rejoindreCooperative, payerCotisation, soumettreBesoin, apporterStock,
  } = useCooperativeStore()

  const [modalBesoin, setModalBesoin] = useState(false)
  const [produit, setProduit] = useState('')
  const [quantite, setQuantite] = useState('')
  const [unite, setUnite] = useState('kg')
  const [priorite, setPriorite] = useState<'normale' | 'urgente'>('normale')
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ texte: string; perdu?: boolean } | null>(null)

  useEffect(() => {
    if (!merchantId) return
    void chargerMaCooperative(merchantId)
    void chargerAnnuaire(merchantId)
  }, [merchantId, chargerMaCooperative, chargerAnnuaire])

  const annoncer = (texte: string, perdu = false) => {
    setFeedback({ texte, perdu })
    window.setTimeout(() => setFeedback(null), 5000)
  }

  const rejoindre = async (cooperativeId: string) => {
    if (!merchantId) return
    setBusy(true)
    setErreur('')
    try {
      const statut = await rejoindreCooperative(merchantId, cooperativeId)
      if (statut === 'synced') annoncer('Demande envoyée — le président va l\u2019examiner.')
      else if (statut === 'queued') annoncer('Hors ligne : demande mise en file, elle partira à la reconnexion.', true)
      else annoncer('Demande perdue — ni envoyée ni mise en file. Réessayez.', true)
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Demande impossible')
    } finally {
      setBusy(false)
    }
  }

  const cotiser = async () => {
    if (!merchantId) return
    setBusy(true)
    try {
      const statut = await payerCotisation(merchantId, COTISATION_STANDARD)
      if (statut === 'synced') annoncer(`Cotisation de ${COTISATION_STANDARD.toLocaleString('fr-FR')} FCFA enregistrée.`)
      else if (statut === 'queued') annoncer('Hors ligne : cotisation mise en file.', true)
      else annoncer('Cotisation perdue — réessayez.', true)
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Paiement impossible', true)
    } finally {
      setBusy(false)
    }
  }

  const deposerBesoin = async () => {
    if (!merchantId) return
    const quantiteNum = Number(quantite.replace(',', '.'))
    if (!produit.trim()) {
      setErreur('Indiquez le produit souhaité.')
      return
    }
    if (!Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      setErreur('Quantité invalide — strictement positive.')
      return
    }
    setBusy(true)
    setErreur('')
    try {
      const statut = await soumettreBesoin(merchantId, {
        produit: produit.trim(),
        quantite: quantiteNum,
        unite,
        priorite,
      })
      if (statut === 'synced') annoncer('Besoin déposé — il rejoint l\u2019achat groupé.')
      else if (statut === 'queued') annoncer('Hors ligne : besoin mis en file.', true)
      else annoncer('Besoin perdu — réessayez.', true)
      setModalBesoin(false)
      setProduit('')
      setQuantite('')
      setPriorite('normale')
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Dépôt impossible')
    } finally {
      setBusy(false)
    }
  }

  const apporter = async () => {
    if (!merchantId) return
    // Apport express : réutilise le modal besoin avec le même formulaire ?
    // Non — l'apport porte son propre formulaire (produit + quantité +
    // unité), ouvert depuis le bloc Pot commun.
    setModalApportOuvert(true)
    setErreur('')
  }

  const [modalApportOuvert, setModalApportOuvert] = useState(false)
  const [apportProduit, setApportProduit] = useState('')
  const [apportQuantite, setApportQuantite] = useState('')
  const [apportUnite, setApportUnite] = useState('kg')
  // MODE-922 : affichage complet des listes tronquées (API renvoie 30).
  const [toutBesoins, setToutBesoins] = useState(false)
  const [toutDistributions, setToutDistributions] = useState(false)

  const validerApport = async () => {
    if (!merchantId) return
    const quantiteNum = Number(apportQuantite.replace(',', '.'))
    if (!apportProduit.trim() || !Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      setErreur('Produit et quantité positive requis.')
      return
    }
    setBusy(true)
    try {
      const statut = await apporterStock(merchantId, {
        produit: apportProduit.trim(),
        quantite: quantiteNum,
        unite: apportUnite,
      })
      if (statut === 'synced') {
        annoncer('Apport enregistré au pot commun.')
        await chargerMaCooperative(merchantId)
      } else if (statut === 'queued') annoncer('Hors ligne : apport mis en file.', true)
      else annoncer('Apport perdu — réessayez.', true)
      setModalApportOuvert(false)
      setApportProduit('')
      setApportQuantite('')
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Apport impossible')
    } finally {
      setBusy(false)
    }
  }

  const membre = maCooperative?.membre
  const cooperative = maCooperative?.cooperative

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      <header className="px-4 pt-6 pb-2 flex items-center gap-2">
        <button
          onClick={() => navigate('home')}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-border shrink-0"
          aria-label="Retour à l'accueil"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-stone-900">Ma coopérative</h1>
          <p className="text-sm text-stone-500">Achats groupés, stock commun, entraide</p>
        </div>
        <button
          onClick={() => merchantId && void chargerMaCooperative(merchantId)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-border shrink-0"
          aria-label="Rafraîchir"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      {feedback && (
        <p role="status" className={`mx-4 mt-2 rounded-xl px-3 py-2 text-sm border ${feedback.perdu ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {feedback.texte}
        </p>
      )}
      {erreur && (
        <p role="alert" className="mx-4 mt-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mx-4 mt-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {/* ── Membre actif ── */}
      {membre?.statut === 'actif' && cooperative && (
        <section className="px-4 mt-3 space-y-3" aria-label="Ma coopérative">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${COOP_COLOR}15` }}>
                  <Users className="w-6 h-6" style={{ color: COOP_COLOR }} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-stone-900">{cooperative.nom}</p>
                  {cooperative.commune && (
                    <p className="text-xs text-stone-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {cooperative.commune}
                    </p>
                  )}
                  <p className="text-xs text-stone-500">
                    Président(e) : {cooperative.responsableNom ?? '—'}
                  </p>
                  <p className="text-[11px] mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5">
                    <BadgeCheck className="w-3 h-3" /> Membre actif{membre.role === 'president' ? ' · chef de groupe' : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {membre.cotisationPayee ? (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" /> Cotisation à jour — merci !
                  </p>
                ) : (
                  <Button
                    onClick={() => void cotiser()}
                    disabled={busy}
                    className="w-full h-11 min-h-[44px] text-white font-semibold"
                    style={{ backgroundColor: COOP_COLOR }}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    Payer ma cotisation ({COTISATION_STANDARD.toLocaleString('fr-FR')} FCFA)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pot commun — apport */}
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: COOP_COLOR }} />
                <p className="text-sm font-semibold text-stone-900">Pot commun</p>
              </div>
              <p className="text-xs text-stone-500">
                Apportez vos surplus au stock commun — la coopérative les redistribue là où le besoin est réel.
              </p>
              <Button
                variant="outline"
                onClick={() => void apporter()}
                disabled={busy}
                className="w-full h-11 min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Apporter au pot commun
              </Button>
              {/* MODE-922 : le marchand membre consulte le stock commun
                  (parité julaba-app CROSS_ROLE_ROUTES — la route accepte
                  déjà sa session). */}
              <Button
                variant="ghost"
                onClick={() => navigate('coop-stock')}
                className="w-full h-11 min-h-[44px]"
                style={{ color: COOP_COLOR }}
              >
                <Eye className="w-4 h-4 mr-2" />
                Voir le stock commun
              </Button>
            </CardContent>
          </Card>

          {/* Besoin */}
          <Button
            onClick={() => setModalBesoin(true)}
            disabled={busy}
            className="w-full h-12 min-h-[44px] text-white font-semibold"
            style={{ backgroundColor: COOP_COLOR }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Soumettre un besoin d&apos;achat
          </Button>

          {/* Mes besoins */}
          {maCooperative && maCooperative.besoins.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400 mb-2">Mes besoins</p>
                <ul className="space-y-2">
                  {maCooperative.besoins.slice(0, toutBesoins ? undefined : 5).map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm">
                      <span className="text-stone-700 truncate">
                        {b.produit} — {b.quantite.toLocaleString('fr-FR')} {b.unite}
                      </span>
                      <span className="shrink-0 text-[11px] text-stone-500">{b.statut.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
                {maCooperative.besoins.length > 5 && (
                  <button
                    onClick={() => setToutBesoins((v) => !v)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium min-h-[44px]"
                    style={{ color: COOP_COLOR }}
                  >
                    {toutBesoins ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {toutBesoins ? 'Réduire' : `Voir tout (${maCooperative.besoins.length})`}
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Distributions reçues */}
          {maCooperative && maCooperative.distributionsRecues.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400 mb-2">Distributions reçues</p>
                <ul className="space-y-2">
                  {maCooperative.distributionsRecues.slice(0, toutDistributions ? undefined : 5).map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-stone-700 truncate">
                        {d.produit} — {d.quantite.toLocaleString('fr-FR')} {d.unite}
                      </span>
                      <span className="shrink-0 text-[11px] text-stone-500">
                        {new Date(d.date).toLocaleDateString('fr-FR')}
                      </span>
                    </li>
                  ))}
                </ul>
                {maCooperative.distributionsRecues.length > 5 && (
                  <button
                    onClick={() => setToutDistributions((v) => !v)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium min-h-[44px]"
                    style={{ color: COOP_COLOR }}
                  >
                    {toutDistributions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {toutDistributions ? 'Réduire' : `Voir tout (${maCooperative.distributionsRecues.length})`}
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* ── Demande en attente ── */}
      {membre?.statut === 'en_attente' && cooperative && (
        <Card className="mx-4 mt-4">
          <CardContent className="p-5 text-center space-y-2">
            <Clock className="w-8 h-8 mx-auto text-amber-500" />
            <p className="font-semibold text-stone-900">Demande en attente</p>
            <p className="text-sm text-stone-500">
              Votre demande pour rejoindre {cooperative.nom} attend le feu vert du président.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Suspendu / exclu ── */}
      {(membre?.statut === 'suspendu' || membre?.statut === 'exclu') && cooperative && (
        <Card className="mx-4 mt-4">
          <CardContent className="p-5 text-center space-y-2">
            <Ban className="w-8 h-8 mx-auto text-red-400" />
            <p className="font-semibold text-stone-900">
              Adhésion {membre.statut === 'suspendu' ? 'suspendue' : 'résiliée'}
            </p>
            <p className="text-sm text-stone-500">
              Contactez le président de {cooperative.nom} pour connaître la suite.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Non-membre : annuaire ── */}
      {!membre && (
        <section className="px-4 mt-3" aria-label="Annuaire des coopératives">
          <h2 className="text-sm font-semibold text-stone-700 px-1 mb-2">
            Rejoindre une coopérative
          </h2>
          {!loading && annuaire.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <Building2 className="w-8 h-8 mx-auto text-stone-300" />
                <p className="text-sm text-stone-500">
                  Aucune coopérative active pour l&apos;instant. Un président peut créer son espace depuis l&apos;écran de connexion.
                </p>
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {annuaire.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900 truncate">{c.nom}</p>
                    <p className="text-xs text-stone-500">
                      {c.commune ? `${c.commune} · ` : ''}
                      {c.membresActifs} membre(s) actif(s)
                    </p>
                  </div>
                  <button
                    onClick={() => void rejoindre(c.id)}
                    disabled={busy}
                    className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white min-h-[44px] disabled:opacity-50"
                    style={{ backgroundColor: COOP_COLOR }}
                  >
                    Rejoindre
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Modal besoin */}
      <AlertDialog open={modalBesoin} onOpenChange={setModalBesoin}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Soumettre un besoin</AlertDialogTitle>
            <AlertDialogDescription>
              Votre besoin rejoint les autres — le président consolide les demandes par produit pour acheter en groupe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={produit}
              onChange={(e) => setProduit(e.target.value)}
              placeholder="Produit souhaité (ex : huile de palme)"
              className="h-12"
              aria-label="Produit souhaité"
              maxLength={120}
            />
            <div className="flex gap-2">
              <Input
                value={quantite}
                onChange={(e) => setQuantite(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="Quantité"
                inputMode="decimal"
                className="h-12 flex-1"
                aria-label="Quantité souhaitée"
              />
              <Input
                value={unite}
                onChange={(e) => setUnite(e.target.value || 'kg')}
                placeholder="Unité"
                className="h-12 w-28"
                aria-label="Unité"
                maxLength={12}
              />
            </div>
            <div className="flex gap-2" role="group" aria-label="Priorité du besoin">
              <button
                onClick={() => setPriorite('normale')}
                aria-pressed={priorite === 'normale'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${priorite === 'normale' ? 'text-white border-transparent' : 'bg-white text-stone-600 border-border'}`}
                style={priorite === 'normale' ? { backgroundColor: COOP_COLOR } : undefined}
              >
                Normale
              </button>
              <button
                onClick={() => setPriorite('urgente')}
                aria-pressed={priorite === 'urgente'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${priorite === 'urgente' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-stone-600 border-border'}`}
              >
                Urgente
              </button>
            </div>
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void deposerBesoin() }}
              disabled={busy}
            >
              Déposer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal apport */}
      <AlertDialog open={modalApportOuvert} onOpenChange={setModalApportOuvert}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apporter au pot commun</AlertDialogTitle>
            <AlertDialogDescription>
              Votre apport s&apos;ajoute au stock commun de {cooperative?.nom ?? 'la coopérative'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Input
              value={apportProduit}
              onChange={(e) => setApportProduit(e.target.value)}
              placeholder="Produit (ex : riz local)"
              className="h-12"
              aria-label="Produit apporté"
              maxLength={120}
            />
            <div className="flex gap-2">
              <Input
                value={apportQuantite}
                onChange={(e) => setApportQuantite(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="Quantité"
                inputMode="decimal"
                className="h-12 flex-1"
                aria-label="Quantité apportée"
              />
              <Input
                value={apportUnite}
                onChange={(e) => setApportUnite(e.target.value || 'kg')}
                placeholder="Unité"
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
              onClick={(e) => { e.preventDefault(); void validerApport() }}
              disabled={busy}
            >
              Apporter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
