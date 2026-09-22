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
  Gift, Package, Plus, RefreshCw, Eye, ChevronDown, ChevronUp, Target,
  Banknote, Wallet,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type CanalCotisation } from '@/lib/stores/cooperative-store'
import { ScoreRing } from '@/components/ui/score-ring'
import type { NiveauPerformance } from '@/lib/scores/score-julaba'
import { COTISATION_ANNUELLE_FCFA } from '@/lib/cooperatives/regles'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

// MODE-935 (I-11) — le montant de la cotisation vient de la constante
// PARTAGÉE (client + serveur) : le serveur refuse tout autre montant.
const COTISATION_STANDARD = COTISATION_ANNUELLE_FCFA

// MODE-931 (audit 97-C2 #8) — vocabulaire d'unités proposé à la saisie du
// besoin marchand (datalist) : les libellés dispersés éclatent la
// consolidation des besoins par produit::unité.
const UNITES_COURANTES = ['kg', 'sac', 'bidon', 'caisse', 'botte', 'panier', 'litre', 'pièce']

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

  // MODE-986 (DET-COOP-003) — le marchand CHOISIT son canal, les deux
  // voies sont annoncées pour ce qu'elles sont : espèces = déclaration
  // étiquetée (aucun débit), keiwa = portefeuille débité MAINTENANT côté
  // serveur. Un « Solde insuffisant » arrive en ErreurMetier (le store ne
  // met JAMAIS ce refus en file) : il est parlé tel quel, rien n'est
  // enregistré — ni débit ni écriture.
  const cotiser = async (canal: CanalCotisation) => {
    if (!merchantId) return
    setBusy(true)
    try {
      const statut = await payerCotisation(merchantId, COTISATION_STANDARD, canal)
      if (statut === 'synced') {
        annoncer(canal === 'keiwa'
          ? `Cotisation enregistrée — portefeuille Keiwa débité de ${COTISATION_STANDARD.toLocaleString('fr-FR')} FCFA.`
          : `Cotisation de ${COTISATION_STANDARD.toLocaleString('fr-FR')} FCFA enregistrée (espèces).`)
      } else if (statut === 'queued') {
        annoncer(canal === 'keiwa'
          ? 'Hors ligne : cotisation mise en file — le débit Keiwa partira à la reconnexion.'
          : 'Hors ligne : cotisation mise en file.', true)
      } else {
        annoncer('Cotisation perdue — réessayez.', true)
      }
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

  // MODE-932 — MON score JULABA (GET /api/scores/me, session appareil).
  // null = pas encore chargé / échec — JAMAIS de score inventé côté client.
  const [monScore, setMonScore] = useState<{ score: number; niveau: NiveauPerformance } | null>(null)

  useEffect(() => {
    if (!merchantId) return
    let annule = false
    void (async () => {
      try {
        const res = await fetch(`/api/scores/me?merchantId=${encodeURIComponent(merchantId)}`)
        if (!res.ok) return
        const data = (await res.json()) as { score?: number; niveau?: NiveauPerformance }
        if (!annule && typeof data.score === 'number' && data.niveau) {
          setMonScore({ score: data.score, niveau: data.niveau })
        }
      } catch {
        // hors ligne : la carte reste neutre, sans fausse promesse
      }
    })()
    return () => { annule = true }
  }, [merchantId])

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
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border shrink-0"
          aria-label="Retour à l'accueil"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Ma coopérative</h1>
          <p className="text-sm text-muted-foreground">Achats groupés, stock commun, entraide</p>
        </div>
        <button
          onClick={() => merchantId && void chargerMaCooperative(merchantId)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border shrink-0"
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
                  <p className="font-bold text-foreground">{cooperative.nom}</p>
                  {cooperative.commune && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {cooperative.commune}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Président(e) : {cooperative.responsableNom ?? '—'}
                  </p>
                  <p className="text-[11px] mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5">
                    <BadgeCheck className="w-3 h-3" /> Membre actif{membre.role === 'president' ? ' · chef de groupe' : ''}
                  </p>
                  {/* MODE-982 (DET-COOP-011, parité julaba-app §4) — la date
                      d'adhésion était déjà LIVRÉE par l'API (membre.dateAdhesion)
                      mais jamais affichée au marchand : le membre sait depuis
                      quand il fait partie de la coopérative. */}
                  {membre.dateAdhesion && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Membre depuis le {new Date(membre.dateAdhesion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                {membre.cotisationPayee ? (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" /> Cotisation à jour — merci !
                  </p>
                ) : (
                  <div>
                    {/* MODE-986 (DET-COOP-003) — deux canaux, deux vérités,
                     * jamais un bouton unique qui cache le choix réel. */}
                    <p className="text-xs text-muted-foreground mb-2">
                      Comment payez-vous ? La trésorerie enregistre le canal choisi.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => void cotiser('especes')}
                        disabled={busy}
                        variant="outline"
                        className="w-full h-auto min-h-[56px] flex-col gap-0.5 border-border"
                      >
                        <Banknote className="w-4 h-4 mt-1" />
                        <span className="text-xs font-semibold">Espèces</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">Déclaré à la coopérative — aucun débit</span>
                      </Button>
                      <Button
                        onClick={() => void cotiser('keiwa')}
                        disabled={busy}
                        className="w-full h-auto min-h-[56px] flex-col gap-0.5 text-white font-semibold"
                        style={{ backgroundColor: COOP_COLOR }}
                      >
                        <Wallet className="w-4 h-4 mt-1" />
                        <span className="text-xs font-semibold">Keiwa</span>
                        <span className="text-[10px] opacity-90 leading-tight">Portefeuille débité de {COTISATION_STANDARD.toLocaleString('fr-FR')} FCFA</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* MODE-932 — Mon score JULABA (source unique /scores/me) */}
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <ScoreRing score={monScore?.score ?? 0} taille={56} epaisseur={6} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Target className="w-4 h-4" style={{ color: COOP_COLOR }} />
                  Mon score JULABA
                </p>
                {monScore ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Performance {monScore.niveau === 'haut' ? 'haute' : monScore.niveau === 'moyen' ? 'moyenne' : 'basse'} — ventes, journées de marché, cotisation et apports au pot commun font monter le score.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Score en cours de calcul — il reflète vos ventes, journées de marché, cotisation et apports réels.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pot commun — apport */}
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: COOP_COLOR }} />
                <p className="text-sm font-semibold text-foreground">Pot commun</p>
              </div>
              <p className="text-xs text-muted-foreground">
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80 mb-2">Mes besoins</p>
                <ul className="space-y-2">
                  {maCooperative.besoins.slice(0, toutBesoins ? undefined : 5).map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate">
                        {b.produit} — {b.quantite.toLocaleString('fr-FR')} {b.unite}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{b.statut.replace('_', ' ')}</span>
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80 mb-2">Distributions reçues</p>
                <ul className="space-y-2">
                  {maCooperative.distributionsRecues.slice(0, toutDistributions ? undefined : 5).map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate">
                        {d.produit} — {d.quantite.toLocaleString('fr-FR')} {d.unite}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
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
            <p className="font-semibold text-foreground">Demande en attente</p>
            <p className="text-sm text-muted-foreground">
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
            <p className="font-semibold text-foreground">
              Adhésion {membre.statut === 'suspendu' ? 'suspendue' : 'résiliée'}
            </p>
            <p className="text-sm text-muted-foreground">
              Contactez le président de {cooperative.nom} pour connaître la suite.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Non-membre : annuaire ── */}
      {!membre && (
        <section className="px-4 mt-3" aria-label="Annuaire des coopératives">
          <h2 className="text-sm font-semibold text-foreground px-1 mb-2">
            Rejoindre une coopérative
          </h2>
          {!loading && annuaire.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <Building2 className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
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
                    <p className="font-semibold text-foreground truncate">{c.nom}</p>
                    <p className="text-xs text-muted-foreground">
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
            {/* MODE-931 (audit 97-C2 #8) — autocomplétion sur les produits
            DÉJÀ demandés dans la coopérative (données réelles du store, pas
            de catalogue figé) : réduit les libellés dispersés (« huile »
            vs « huile de palme ») qui éclatent la consolidation. */}
            <Input
              value={produit}
              onChange={(e) => setProduit(e.target.value)}
              placeholder="Produit souhaité (ex : huile de palme)"
              className="h-12"
              aria-label="Produit souhaité"
              maxLength={120}
              list="besoins-produits-list"
            />
            <datalist id="besoins-produits-list">
              {[...new Set((maCooperative?.besoins ?? []).map((b) => b.produit))].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
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
                list="unites-courantes-list"
              />
              <datalist id="unites-courantes-list">
                {UNITES_COURANTES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2" role="group" aria-label="Priorité du besoin">
              <button
                onClick={() => setPriorite('normale')}
                aria-pressed={priorite === 'normale'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${priorite === 'normale' ? 'text-white border-transparent' : 'bg-card text-muted-foreground border-border'}`}
                style={priorite === 'normale' ? { backgroundColor: COOP_COLOR } : undefined}
              >
                Normale
              </button>
              <button
                onClick={() => setPriorite('urgente')}
                aria-pressed={priorite === 'urgente'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${priorite === 'urgente' ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
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
