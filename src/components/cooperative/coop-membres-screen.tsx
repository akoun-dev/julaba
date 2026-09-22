'use client'

/**
 * MODE-921 — Membres de la coopérative (président).
 * Deux onglets (Actifs / Demandes en attente), recherche par nom/téléphone,
 * actions réelles : accepter, refuser, suspendre (motif), réactiver,
 * promouvoir/rétrograder chef de groupe, exclure. Cibles tactiles ≥ 44 px,
 * filtres avec aria-pressed.
 * MODE-922 : ajout direct d'un marchand par recherche téléphone (l'API
 * search-marchand + POST membres existait — plus d'UI). Parité julaba-app
 * (écran Membres, « ajouter un marchand »).
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useMemo, useState } from 'react'
import { Search, UserCheck, UserX, ShieldOff, ShieldCheck, Crown, Trash2, RefreshCw, Users, UserPlus, ChevronRight, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type MembreCoop, type MembreStatut } from '@/lib/stores/cooperative-store'
import { paginer, TAILLE_PAGE_MEMBRES } from '@/lib/cooperatives/coop-journal'
import { ScoreRing } from '@/components/ui/score-ring'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CoopScreenShell } from './coop-shell'
import { CoopSkeleton, messageDecisionCoop } from './coop-ui'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

type Onglet = 'actifs' | 'attente' | 'suspendus'
// MODE-932 — filtre performance sur le score JULABA (parité julaba-app,
// seuils 71/41). 'tous' ne filtre pas ; les membres sans score (API
// indisponible au dernier chargement) ne passent que dans 'tous'.
type FiltrePerf = 'tous' | 'haut' | 'moyen' | 'bas'

export function CoopMembresScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const navigate = useAppStore((s) => s.navigate)
  const selectionnerMembre = useCooperativeStore((s) => s.selectionnerMembre)
  const {
    membres, loading, loadError,
    changerStatutMembre, changerRoleMembre, exclureMembre,
    ajouterMarchand,
    syncError, clearSyncError, chargerEspaceCooperateur,
  } = useCooperativeStore()

  const [onglet, setOnglet] = useState<Onglet>('actifs')
  const [recherche, setRecherche] = useState('')
  const [filtrePerf, setFiltrePerf] = useState<FiltrePerf>('tous')
  // MODE-982 (DET-COOP-011, parité julaba-app §4) — la liste des membres
  // pagine par 20 (« charger plus ») : 100 adhésions ne crachent plus
  // d'un coup sur un téléphone. La page retombe à 1 à chaque filtre.
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [sanctionMembre, setSanctionMembre] = useState<{ membre: MembreCoop; statut: 'suspendu' | 'exclu' } | null>(null)
  const [motif, setMotif] = useState('')
  const [erreurMotif, setErreurMotif] = useState(false)
  const [busy, setBusy] = useState(false)
  // MODE-922 : ajout direct par recherche téléphone.
  const [modalAjout, setModalAjout] = useState(false)
  const [telRecherche, setTelRecherche] = useState('')
  const [marchandTrouve, setMarchandTrouve] = useState<{ id: string; prenom: string | null; nom: string | null; telephone: string; adhesionActuelle: { cooperativeNom: string | null; statut: string } | null } | null>(null)
  const [rechercheEnCours, setRechercheEnCours] = useState(false)
  const [erreurAjout, setErreurAjout] = useState('')

  // MODE-974 (G7) — rechargement À L'ENTRÉE de l'écran : la liste des
  // membres ne dépend plus d'un passage préalable par l'accueil
  // (navigation directe = données fraîches, même contrat que MODE-951).
  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId, ['membres'])
  }, [merchantId, chargerEspaceCooperateur])

  // Filtrage local (dérivation directe au rendu — pas de useMemo store).
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return membres.filter((m) => {
      if (q) {
        const texte = `${m.prenom ?? ''} ${m.nom ?? ''} ${m.telephone ?? ''}`.toLowerCase()
        if (!texte.includes(q)) return false
      }
      if (onglet === 'actifs') return m.statut === 'actif'
      if (onglet === 'attente') return m.statut === 'en_attente'
      return m.statut === 'suspendu'
    }).filter((m) => {
      if (filtrePerf === 'tous') return true
      return m.scoreJulaba?.niveau === filtrePerf
    })
  }, [membres, recherche, onglet, filtrePerf])

  // MODE-982 — fenêtrage 20/page (fonction pure partagée avec les
  // journaux, taille dédiée ; cumulatif comme « charger plus »).
  const pageMembres = paginer(filtres, page, TAILLE_PAGE_MEMBRES)

  const rafraichir = async () => {
    if (!merchantId) return
    await chargerEspaceCooperateur(merchantId, ['resume', 'membres'])
  }

  const annoncer = (texte: string) => {
    setMessage(texte)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const appliquerStatut = async (membre: MembreCoop, statut: MembreStatut, motifValue?: string) => {
    if (!merchantId) return
    setBusy(true)
    try {
      // MODE-977 (G9) — décision en file hors ligne : le feedback consomme
      // le contrat synced | queued | lost (jamais un succès inventé).
      const statutSync = await changerStatutMembre(merchantId, membre.id, statut, motifValue)
      annoncer(
        messageDecisionCoop(
          statutSync,
          statut === 'actif'
            ? `${membre.prenom ?? 'Membre'} réactivé.`
            : statut === 'suspendu'
              ? `${membre.prenom ?? 'Membre'} suspendu.`
              : `${membre.prenom ?? 'Membre'} exclu.`,
        ),
      )
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const changerRole = async (membre: MembreCoop) => {
    if (!merchantId) return
    const nouveauRole = membre.role === 'president' ? 'membre' : 'president'
    setBusy(true)
    try {
      const statutSync = await changerRoleMembre(merchantId, membre.id, nouveauRole)
      annoncer(
        messageDecisionCoop(
          statutSync,
          nouveauRole === 'president' ? `${membre.prenom ?? 'Membre'} est maintenant chef de groupe.` : `${membre.prenom ?? 'Membre'} est redevenu membre.`,
        ),
      )
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const confirmerSanction = async () => {
    if (!sanctionMembre) return
    const motifTrim = motif.trim()
    if (motifTrim.length < 3) {
      setErreurMotif(true)
      return
    }
    setBusy(true)
    try {
      await appliquerStatut(sanctionMembre.membre, sanctionMembre.statut, motifTrim)
      setSanctionMembre(null)
      setMotif('')
    } finally {
      setBusy(false)
    }
  }

  const accepterDemande = async (membre: MembreCoop) => {
    setBusy(true)
    try {
      await appliquerStatut(membre, 'actif')
    } finally {
      setBusy(false)
    }
  }

  const refuserDemande = async (membre: MembreCoop) => {
    if (!merchantId) return
    setBusy(true)
    try {
      const statutSync = await exclureMembre(merchantId, membre.id)
      annoncer(messageDecisionCoop(statutSync, 'Demande refusée.'))
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  // MODE-922 : recherche du marchand par téléphone (API réservée au
  // président) puis ajout direct — le marchand devient membre actif.
  const rechercherMarchand = async () => {
    if (!merchantId) return
    const tel = telRecherche.trim()
    setErreurAjout('')
    if (tel.replace(/\D/g, '').length < 10) {
      setErreurAjout('Numéro invalide — 10 chiffres minimum.')
      return
    }
    setRechercheEnCours(true)
    setMarchandTrouve(null)
    try {
      const res = await fetch(
        `/api/cooperatives/search-marchand?cooperateurId=${encodeURIComponent(merchantId)}&phone=${encodeURIComponent(tel)}`
      )
      const data = await res.json()
      if (!res.ok) {
        setErreurAjout((data?.erreur as string) || 'Recherche impossible')
        return
      }
      setMarchandTrouve(data.marchand ?? null)
    } catch {
      setErreurAjout('Réseau indisponible — réessayez.')
    } finally {
      setRechercheEnCours(false)
    }
  }

  const confirmerAjout = async () => {
    if (!merchantId || !marchandTrouve) return
    setBusy(true)
    setErreurAjout('')
    try {
      const statutSync = await ajouterMarchand(merchantId, marchandTrouve.id)
      if (statutSync === 'synced') {
        annoncer(`${marchandTrouve.prenom ?? 'Le marchand'} ajouté à la coopérative.`)
      } else {
        annoncer(messageDecisionCoop(statutSync, `${marchandTrouve.prenom ?? 'Le marchand'} sera ajouté dès la reconnexion.`))
      }
      setModalAjout(false)
      setTelRecherche('')
      setMarchandTrouve(null)
      if (statutSync === 'synced') await rafraichir()
    } catch (error) {
      setErreurAjout(error instanceof Error ? error.message : 'Ajout impossible')
    } finally {
      setBusy(false)
    }
  }

  const onglets: { id: Onglet; label: string }[] = [
    { id: 'actifs', label: 'Actifs' },
    { id: 'attente', label: 'Demandes' },
    { id: 'suspendus', label: 'Suspendus' },
  ]

  // MODE-932 — filtre performance (seuils 71/41 → haut/moyen/bas).
  const filtresPerf: { id: FiltrePerf; label: string }[] = [
    { id: 'tous', label: 'Tous' },
    { id: 'haut', label: 'Haut' },
    { id: 'moyen', label: 'Moyen' },
    { id: 'bas', label: 'Bas' },
  ]

  return (
    <CoopScreenShell>
      {/* MODE-974 (G11) — le gradient, le header d'espace et les erreurs
          globales sont portés par le shell ; l'écran garde son en-tête de
          section avec ses actions. */}
      <header className="px-4 pt-5 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Membres</h1>
          <p className="text-sm text-muted-foreground">{membres.length} adhésion(s) au total</p>
        </div>
        <button
          onClick={() => { setModalAjout(true); setMarchandTrouve(null); setErreurAjout(''); setTelRecherche('') }}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border"
          aria-label="Ajouter un marchand par téléphone"
        >
          <UserPlus className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
        <button
          onClick={() => void rafraichir()}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border"
          aria-label="Rafraîchir la liste des membres"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      {/* Recherche */}
      <div className="px-4 mt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
          <Input
            value={recherche}
            onChange={(e) => { setRecherche(e.target.value); setPage(1) }}
            placeholder="Rechercher un membre (nom, téléphone)"
            className="pl-9 h-12 min-h-[44px]"
            aria-label="Rechercher un membre"
          />
        </div>
      </div>

      {/* Onglets (aria-pressed — cible ≥ 44 px) */}
      <div className="px-4 mt-3 flex gap-2" role="group" aria-label="Filtrer les membres par statut">
        {onglets.map((t) => (
          <button
            key={t.id}
            onClick={() => { setOnglet(t.id); setPage(1) }}
            aria-pressed={onglet === t.id}
            className="flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors"
            style={
              onglet === t.id
                ? { backgroundColor: COOP_COLOR, color: '#fff', borderColor: COOP_COLOR }
                : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtre performance (MODE-932 — score JULABA, aria-pressed ≥ 44 px) */}
      <div className="px-4 mt-2 flex gap-2" role="group" aria-label="Filtrer les membres par performance">
        {filtresPerf.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFiltrePerf(f.id); setPage(1) }}
            aria-pressed={filtrePerf === f.id}
            className="min-h-[44px] px-4 rounded-full text-xs font-medium border transition-colors"
            style={
              filtrePerf === f.id
                ? { backgroundColor: '#EAF2F8', color: COOP_COLOR, borderColor: COOP_COLOR }
                : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Messages de feedback */}
      {syncError && (
        <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {syncError}
          <button onClick={clearSyncError} className="ml-2 underline">Fermer</button>
        </p>
      )}
      {message && (
        <p role="status" className="mx-4 mt-3 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      )}
      {/* MODE-974 (G8) — le loadError global est affiché par le shell sur
          TOUS les écrans ; plus de silence hors accueil. */}

      {/* Liste — MODE-982 : fenêtre de 20 (pageMembres.visible), le
          compteur honnête des restes sous la vague (« charger plus »). */}
      <section className="px-4 mt-4 space-y-3" aria-label="Liste des membres">
        {loading && membres.length === 0 ? (
          <div className="px-1"><CoopSkeleton lignes={3} /></div>
        ) : filtres.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                {onglet === 'attente'
                  ? 'Aucune demande en attente.'
                  : recherche
                    ? 'Aucun membre ne correspond à cette recherche.'
                    : 'Aucun membre dans cet onglet.'}
              </p>
              {onglet === 'actifs' && membres.length === 0 && (
                <p className="text-xs text-muted-foreground/80">
                  Utilisez le bouton « + » en haut pour ajouter un marchand par son numéro — ils apparaîtront ici.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {pageMembres.visible.map((membre) => (
            <Card key={membre.id}>
              <CardContent className="p-4 space-y-3">
                {/* MODE-976 (G3) — la zone d'identité OUvre LA FICHE du
                    membre (premier drill-down de l'espace coopérative) : la
                    sélection est persistée (G10), le retour matériel ne
                    perd plus le contexte. */}
                <button
                  onClick={() => { selectionnerMembre(membre.id); navigate('coop-membre-detail') }}
                  className="w-full flex items-start justify-between gap-2 text-left rounded-lg -m-1 p-1 hover:bg-foreground/5 transition-colors"
                  aria-label={`Ouvrir la fiche de ${membre.prenom ?? 'membre'} ${membre.nom ?? ''}`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {membre.prenom ?? 'Marchand'} {membre.nom ?? ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{membre.telephone ?? 'Numéro inconnu'}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${COOP_COLOR}12`, color: COOP_COLOR }}
                    >
                      {membre.role === 'president' ? 'Chef de groupe' : 'Membre'}
                    </span>
                    {/* MODE-932 — anneau du score JULABA réel (null = pas de
                        score calculé au dernier chargement, jamais inventé) */}
                    <ScoreRing score={membre.scoreJulaba?.score ?? 0} taille={44} epaisseur={4} />
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60" aria-hidden="true" />
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">
                  Cotisations : {membre.totalCotisations.toLocaleString('fr-FR')} FCFA ·{' '}
                  {membre.cotisationPayee ? 'cotisation à jour' : 'cotisation non payée'}
                </p>

                {onglet === 'actifs' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void changerRole(membre)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium min-h-[44px] hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      {membre.role === 'president' ? 'Rétrograder' : 'Chef de groupe'}
                    </button>
                    <button
                      onClick={() => setSanctionMembre({ membre, statut: 'suspendu' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 px-3 py-2 text-xs font-medium text-amber-800 min-h-[44px] hover:bg-amber-50 transition-colors disabled:opacity-50"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      Suspendre
                    </button>
                    <button
                      onClick={() => setSanctionMembre({ membre, statut: 'exclu' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-800 min-h-[44px] hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Exclure
                    </button>
                  </div>
                )}

                {onglet === 'attente' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void accepterDemande(membre)}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white min-h-[44px] disabled:opacity-50"
                      style={{ backgroundColor: COOP_COLOR }}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Accepter
                    </button>
                    <button
                      onClick={() => void refuserDemande(membre)}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-800 min-h-[44px] hover:bg-red-50 disabled:opacity-50"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Refuser
                    </button>
                  </div>
                )}

                {onglet === 'suspendus' && (
                  <button
                    onClick={() => void appliquerStatut(membre, 'actif')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-green-400 px-3 py-2 text-xs font-medium text-green-800 min-h-[44px] hover:bg-green-50 disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Réactiver
                  </button>
                )}
              </CardContent>
            </Card>
            ))}

            {/* MODE-982 — « charger plus » : le nombre RÉEL de membres
                encore masqués est annoncé, jamais un au-delà du total. */}
            {pageMembres.restantes > 0 && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium min-h-[48px] hover:bg-foreground/5 transition-colors"
                style={{ color: COOP_COLOR }}
              >
                <ChevronDown className="w-4 h-4 inline mr-1.5" />
                Charger plus ({pageMembres.restantes} membre{pageMembres.restantes > 1 ? 's' : ''} restant{pageMembres.restantes > 1 ? 's' : ''})
              </button>
            )}
          </>
        )}
      </section>

      {/* Modal sanction (motif obligatoire — traçabilité) */}
      <AlertDialog open={sanctionMembre !== null} onOpenChange={(open) => { if (!open) { setSanctionMembre(null); setMotif(''); setErreurMotif(false) } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sanctionMembre?.statut === 'suspendu' ? 'Suspendre ce membre ?' : 'Exclure ce membre ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Un motif de 3 à 200 caractères est requis — une sanction sans pourquoi n&apos;est pas traçable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={motif}
            onChange={(e) => { setMotif(e.target.value); setErreurMotif(false) }}
            placeholder="Motif (ex : cotisations impayées depuis 3 mois)"
            aria-label="Motif de la sanction"
            maxLength={200}
          />
          {erreurMotif && <p className="text-xs text-red-600">Le motif est requis (3 caractères minimum).</p>}
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: sanctionMembre?.statut === 'suspendu' ? '#b45309' : '#b91c1c' }}
              onClick={(e) => { e.preventDefault(); void confirmerSanction() }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal ajout par téléphone (MODE-922) */}
      <AlertDialog open={modalAjout} onOpenChange={(open) => { if (!open) { setModalAjout(false); setMarchandTrouve(null); setErreurAjout('') } }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Ajouter un marchand</AlertDialogTitle>
            <AlertDialogDescription>
              Recherchez son numéro — le marchand devient membre actif de la coopérative.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={telRecherche}
                onChange={(e) => setTelRecherche(e.target.value.replace(/[^\d+\s]/g, ''))}
                placeholder="01 02 03 04 05"
                inputMode="tel"
                className="h-12 flex-1"
                aria-label="Téléphone du marchand"
                maxLength={16}
              />
              <button
                onClick={() => void rechercherMarchand()}
                disabled={rechercheEnCours}
                className="rounded-full px-4 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50 shrink-0"
                style={{ backgroundColor: COOP_COLOR }}
              >
                {rechercheEnCours ? '…' : 'Chercher'}
              </button>
            </div>
            {marchandTrouve && (
              <div className="rounded-xl border border-border p-3 space-y-1">
                <p className="font-semibold text-foreground text-sm">
                  {marchandTrouve.prenom ?? 'Marchand'} {marchandTrouve.nom ?? ''}
                </p>
                <p className="text-xs text-muted-foreground">{marchandTrouve.telephone}</p>
                {marchandTrouve.adhesionActuelle && (
                  <p className="text-xs text-amber-700">
                    Déjà actif dans « {marchandTrouve.adhesionActuelle.cooperativeNom ?? 'une coopérative'} » — l&apos;ajout sera refusé.
                  </p>
                )}
                <button
                  onClick={() => void confirmerAjout()}
                  disabled={busy}
                  className="w-full rounded-full text-xs font-semibold text-white min-h-[44px] disabled:opacity-50 mt-1"
                  style={{ backgroundColor: COOP_COLOR }}
                >
                  Ajouter à la coopérative
                </button>
              </div>
            )}
            {erreurAjout && <p className="text-xs text-red-600">{erreurAjout}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accès alternatif pour la demande d'adhésion */}
      {onglet === 'actifs' && (
        <p className="px-4 mt-4 text-xs text-muted-foreground/80 text-center">
          Un marchand peut aussi déposer lui-même une demande depuis son écran
          « Ma coopérative » — elle apparaîtra dans l&apos;onglet « Demandes ».
        </p>
      )}
    </CoopScreenShell>
  )
}
