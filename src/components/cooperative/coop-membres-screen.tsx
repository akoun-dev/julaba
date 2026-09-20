'use client'

/**
 * MODE-921 — Membres de la coopérative (président).
 * Deux onglets (Actifs / Demandes en attente), recherche par nom/téléphone,
 * actions réelles : accepter, refuser, suspendre (motif), réactiver,
 * promouvoir/rétrograder chef de groupe, exclure. Cibles tactiles ≥ 44 px,
 * filtres avec aria-pressed.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useMemo, useState } from 'react'
import { Search, UserCheck, UserX, ShieldOff, ShieldCheck, Crown, Trash2, RefreshCw, Users } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type MembreCoop, type MembreStatut } from '@/lib/stores/cooperative-store'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

type Onglet = 'actifs' | 'attente' | 'suspendus'

export function CoopMembresScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const {
    membres, loading, loadError,
    changerStatutMembre, changerRoleMembre, exclureMembre,
    syncError, clearSyncError, chargerEspaceCooperateur,
  } = useCooperativeStore()

  const [onglet, setOnglet] = useState<Onglet>('actifs')
  const [recherche, setRecherche] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [sanctionMembre, setSanctionMembre] = useState<{ membre: MembreCoop; statut: 'suspendu' | 'exclu' } | null>(null)
  const [motif, setMotif] = useState('')
  const [erreurMotif, setErreurMotif] = useState(false)
  const [busy, setBusy] = useState(false)

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
    })
  }, [membres, recherche, onglet])

  const rafraichir = async () => {
    if (!merchantId) return
    await chargerEspaceCooperateur(merchantId)
  }

  const annoncer = (texte: string) => {
    setMessage(texte)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const appliquerStatut = async (membre: MembreCoop, statut: MembreStatut, motifValue?: string) => {
    if (!merchantId) return
    setBusy(true)
    try {
      await changerStatutMembre(merchantId, membre.id, statut, motifValue)
      annoncer(
        statut === 'actif'
          ? `${membre.prenom ?? 'Membre'} réactivé.`
          : statut === 'suspendu'
            ? `${membre.prenom ?? 'Membre'} suspendu.`
            : `${membre.prenom ?? 'Membre'} exclu.`
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
      await changerRoleMembre(merchantId, membre.id, nouveauRole)
      annoncer(nouveauRole === 'president' ? `${membre.prenom ?? 'Membre'} est maintenant chef de groupe.` : `${membre.prenom ?? 'Membre'} est redevenu membre.`)
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
      await exclureMembre(merchantId, membre.id)
      annoncer('Demande refusée.')
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const onglets: { id: Onglet; label: string }[] = [
    { id: 'actifs', label: 'Actifs' },
    { id: 'attente', label: 'Demandes' },
    { id: 'suspendus', label: 'Suspendus' },
  ]

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FDF3ED] to-[#F5E6D5] pb-24">
      <header className="px-4 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Membres</h1>
          <p className="text-sm text-stone-500">{membres.length} adhésion(s) au total</p>
        </div>
        <button
          onClick={() => void rafraichir()}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-border"
          aria-label="Rafraîchir la liste des membres"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      {/* Recherche */}
      <div className="px-4 mt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
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
            onClick={() => setOnglet(t.id)}
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
      {loadError && (
        <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {/* Liste */}
      <section className="px-4 mt-4 space-y-3" aria-label="Liste des membres">
        {loading && membres.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-stone-500">Chargement…</CardContent></Card>
        ) : filtres.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <Users className="w-8 h-8 mx-auto text-stone-300" />
              <p className="text-sm text-stone-500">
                {onglet === 'attente'
                  ? 'Aucune demande en attente.'
                  : recherche
                    ? 'Aucun membre ne correspond à cette recherche.'
                    : 'Aucun membre dans cet onglet.'}
              </p>
              {onglet === 'actifs' && membres.length === 0 && (
                <p className="text-xs text-stone-400">
                  Ajoutez des marchands depuis leur numéro de téléphone (via la recherche) — ils apparaîtront ici.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          filtres.map((membre) => (
            <Card key={membre.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900 truncate">
                      {membre.prenom ?? 'Marchand'} {membre.nom ?? ''}
                    </p>
                    <p className="text-xs text-stone-500">{membre.telephone ?? 'Numéro inconnu'}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: `${COOP_COLOR}12`, color: COOP_COLOR }}
                  >
                    {membre.role === 'president' ? 'Chef de groupe' : 'Membre'}
                  </span>
                </div>
                <p className="text-xs text-stone-500">
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
          ))
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

      {/* Accès alternatif pour l'ajout direct */}
      {onglet === 'actifs' && (
        <p className="px-4 mt-4 text-xs text-stone-400 text-center">
          Pour ajouter directement un marchand, il recherche votre coopérative dans
          son écran « Ma coopérative » et dépose une demande — ou utilisez la
          recherche par téléphone dans les « Demandes ».
        </p>
      )}
    </div>
  )
}
