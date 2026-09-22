'use client'

/**
 * MODE-921 — Trésorerie coopérative (président).
 * Solde = Σ entrées validées − Σ sorties validées (le résumé vient du
 * serveur — aucun recalcul local). Le président crée les écritures
 * (en_attente) et valide/annule — double validation, même principe que
 * julaba-app. Statuts d'écriture visibles : en attente / validée / annulée.
 */

import { COOP_COLOR } from '@/lib/design-tokens'
import { useEffect, useState } from 'react'
import { Wallet, Plus, Check, X, ArrowDownCircle, ArrowUpCircle, RefreshCw, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCooperativeStore, type TransactionCoop } from '@/lib/stores/cooperative-store'
import {
  filtrerTransactions, paginer, TAILLE_PAGE, categoriesJournal,
  type FiltreStatutTransaction, type FiltreTypeTransaction, type FiltrePeriodeTransaction,
} from '@/lib/cooperatives/coop-journal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CoopScreenShell } from './coop-shell'
import { messageDecisionCoop } from './coop-ui'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

const CATEGORIES = [
  { id: 'vente_groupee', label: 'Vente groupée' },
  { id: 'achat_groupe', label: 'Achat groupé' },
  { id: 'commission', label: 'Commission' },
  { id: 'frais', label: 'Frais' },
  { id: 'subvention', label: 'Subvention' },
  { id: 'autre', label: 'Autre' },
] as const

// MODE-976 (G13/G14) — libellés des filtres du journal (fonction pure
// testée dans coop-journal.test.ts).
const FILTRES_STATUT: { id: FiltreStatutTransaction; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'en_attente', label: 'En attente' },
  { id: 'validee', label: 'Validées' },
  { id: 'annulee', label: 'Annulées' },
]
const FILTRES_TYPE: { id: FiltreTypeTransaction; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'entree', label: 'Entrées' },
  { id: 'sortie', label: 'Sorties' },
]

// MODE-982 (DET-COOP-011, parité julaba-app §4) — filtres PÉRIODE du
// journal. Fenêtres prévisibles (7/30/90 jours, JOURS_PAR_PERIODE) —
// le libellé dit ce que le filtre fait.
const FILTRES_PERIODE: { id: FiltrePeriodeTransaction; label: string }[] = [
  { id: 'toutes', label: 'Toutes' },
  { id: '7j', label: '7 jours' },
  { id: '30j', label: '30 jours' },
  { id: '3mois', label: '3 mois' },
]

// Libellés FR des catégories connues (id base → affichage). Une catégorie
// inconnue (nouvelle écriture, historique) s'affiche TELLE QUELLE —
// jamais masquée sous prétexte qu'elle n'est pas dans la liste.
const LIBELLES_CATEGORIES: Record<string, string> = {
  cotisation: 'Cotisations',
  vente_groupee: 'Vente groupée',
  achat_groupe: 'Achat groupé',
  commission: 'Commission',
  frais: 'Frais',
  subvention: 'Subvention',
  autre: 'Autre',
}

function libelleCategorie(id: string): string {
  return LIBELLES_CATEGORIES[id] ?? id
}

function formaterFCFA(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

export function CoopTresorerieScreen() {
  const merchantId = useAppStore((s) => s.merchantId)
  const { cooperative, transactions, solde, totalCotisations, chargerEspaceCooperateur, ajouterTransaction, changerStatutTransaction } = useCooperativeStore()

  const [modalOuvert, setModalOuvert] = useState(false)
  const [type, setType] = useState<'entree' | 'sortie'>('entree')
  const [categorie, setCategorie] = useState<string>('vente_groupee')
  const [montant, setMontant] = useState('')
  const [description, setDescription] = useState('')
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ texte: string; perdu?: boolean } | null>(null)
  // MODE-976 (G13/G14) — filtres + pagination « charger plus » du journal
  // (logique pure coop-journal.ts ; la page retombe à 1 à chaque filtre).
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatutTransaction>('tous')
  const [filtreType, setFiltreType] = useState<FiltreTypeTransaction>('tous')
  // MODE-982 (DET-COOP-011) — fenêtre temporelle + catégorie du journal.
  const [filtrePeriode, setFiltrePeriode] = useState<FiltrePeriodeTransaction>('toutes')
  const [filtreCategorie, setFiltreCategorie] = useState<string>('toutes')
  const [page, setPage] = useState(1)

  // MODE-974 (G7) — rechargement À L'ENTRÉE de l'écran : le solde et le
  // journal ne dépendent plus d'un passage préalable par l'accueil.
  useEffect(() => {
    if (merchantId) void chargerEspaceCooperateur(merchantId, ['resume', 'tresorerie'])
  }, [merchantId, chargerEspaceCooperateur])

  const rafraichir = async () => {
    if (merchantId) await chargerEspaceCooperateur(merchantId, ['resume', 'tresorerie'])
  }

  // MODE-976 — dérivations pures au rendu (filtre → pagination) : la fiche
  // affiche le nombre RÉEL filtré et le nombre restant, jamais déguisés.
  // MODE-982 — la catégorie proposée vient des ÉCRITURES RÉELLES du journal
  // (categoriesJournal) : un chip sans objet n'existe pas ; la rangée de
  // filtre catégorie n'apparaît que s'il y a au moins 2 catégories (sinon
  // filtrer ne changerait rien — pas de bouton décoratif).
  const filtrées = filtrerTransactions(transactions, {
    statut: filtreStatut,
    type: filtreType,
    periode: filtrePeriode,
    categorie: filtreCategorie,
  })
  const pageJournal = paginer(filtrées, page)
  const catégoriesPrésentes = categoriesJournal(transactions)

  const annoncer = (texte: string, perdu = false) => {
    setFeedback({ texte, perdu })
    window.setTimeout(() => setFeedback(null), 5000)
  }

  const soumettre = async () => {
    if (!merchantId) return
    const montantNum = Number(montant.replace(/\s/g, ''))
    if (!Number.isInteger(montantNum) || montantNum <= 0) {
      setErreur('Montant invalide — un entier FCFA strictement positif.')
      return
    }
    if (!description.trim()) {
      setErreur('Décrivez l\u2019écriture (ex : achat groupé d\u2019ignames du 12/09).')
      return
    }
    setBusy(true)
    setErreur('')
    try {
      const statut = await ajouterTransaction(merchantId, {
        type,
        categorie,
        montant: montantNum,
        description: description.trim(),
      })
      if (statut === 'synced') annoncer('Écriture enregistrée en attente de validation.')
      else if (statut === 'queued') annoncer('Hors ligne : écriture mise en file, elle partira à la reconnexion.', true)
      else annoncer('Écriture perdue — ni envoyée ni mise en file. Réessayez.', true)
      setModalOuvert(false)
      setMontant('')
      setDescription('')
      setType('entree')
      setCategorie('vente_groupee')
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  const changerStatut = async (transaction: TransactionCoop, nouveauStatut: 'validee' | 'annulee') => {
    if (!merchantId) return
    setBusy(true)
    try {
      // MODE-977 (G9) — décision en file hors ligne (contrat synced | queued | lost).
      const statutSync = await changerStatutTransaction(merchantId, transaction.id, nouveauStatut)
      annoncer(
        messageDecisionCoop(
          statutSync,
          nouveauStatut === 'validee' ? 'Écriture validée — comptée dans le solde.' : 'Écriture annulée.',
          { queued: 'Hors ligne : décision appliquée localement, elle partira à la reconnexion.' },
        ),
        statutSync !== 'synced',
      )
    } catch (error) {
      annoncer(error instanceof Error ? error.message : 'Action impossible', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CoopScreenShell>
      {/* MODE-974 (G11) — habillage et erreurs globales portés par le shell. */}
      <header className="px-4 pt-5 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Trésorerie</h1>
          {cooperative && <p className="text-sm text-muted-foreground">{cooperative.nom}</p>}
        </div>
        <button
          onClick={() => void rafraichir()}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-card border border-border"
          aria-label="Rafraîchir la trésorerie"
        >
          <RefreshCw className="w-5 h-5" style={{ color: COOP_COLOR }} />
        </button>
      </header>

      {/* Solde héros */}
      <section className="px-4 mt-2" aria-label="Solde de trésorerie">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" style={{ color: COOP_COLOR }} />
              <p className="text-xs text-muted-foreground">Solde (écritures validées uniquement)</p>
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{formaterFCFA(solde)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cotisations collectées : {formaterFCFA(totalCotisations)}
            </p>
          </CardContent>
        </Card>
      </section>

      {feedback && (
        <p
          role="status"
          className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm border ${feedback.perdu ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}
        >
          {feedback.texte}
        </p>
      )}

      {/* Nouvelle écriture */}
      <div className="px-4 mt-4">
        <Button
          onClick={() => setModalOuvert(true)}
          className="w-full h-12 min-h-[44px] text-white font-semibold"
          style={{ backgroundColor: COOP_COLOR }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle écriture
        </Button>
      </div>

      {/* Journal (filtres + pagination « charger plus » — MODE-976) */}
      <section className="px-4 mt-4 space-y-2" aria-label="Journal des écritures">
        <h2 className="text-sm font-semibold text-foreground px-1">Journal</h2>

        {/* Filtres statut + type (aria-pressed, cibles ≥ 44 px) — changer
            un filtre ramène à la page 1, le compte reste honnête. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {FILTRES_STATUT.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFiltreStatut(f.id); setPage(1) }}
              aria-pressed={filtreStatut === f.id}
              className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
              style={
                filtreStatut === f.id
                  ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                  : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type">
          {FILTRES_TYPE.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFiltreType(f.id); setPage(1) }}
              aria-pressed={filtreType === f.id}
              className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
              style={
                filtreType === f.id
                  ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                  : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* MODE-982 (DET-COOP-011) — fenêtre 7 j / 30 j / 3 mois : même
            vocabulaire que le sélecteur du dashboard (CoopPeriodeSwitch). */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par période">
          {FILTRES_PERIODE.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFiltrePeriode(f.id); setPage(1) }}
              aria-pressed={filtrePeriode === f.id}
              className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
              style={
                filtrePeriode === f.id
                  ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                  : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* MODE-982 — catégorie : chips DÉRIVÉES des écritures réelles,
            affichée seulement si ≥ 2 catégories coexistent. */}
        {catégoriesPrésentes.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
            <button
              onClick={() => { setFiltreCategorie('toutes'); setPage(1) }}
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
                onClick={() => { setFiltreCategorie(c); setPage(1) }}
                aria-pressed={filtreCategorie === c}
                className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
                style={
                  filtreCategorie === c
                    ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                    : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
                }
              >
                {libelleCategorie(c)}
              </button>
            ))}
          </div>
        )}
        {transactions.length > 0 && (
          <p className="px-1 text-[11px] text-muted-foreground/80" role="status">
            {pageJournal.total === transactions.length
              ? `${pageJournal.total} écriture${pageJournal.total > 1 ? 's' : ''} chargée${pageJournal.total > 1 ? 's' : ''}`
              : `${pageJournal.total} sur ${transactions.length} après filtre`}
          </p>
        )}

        {filtrées.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {transactions.length === 0
                ? 'Aucune écriture. Les cotisations des membres et vos écritures apparaîtront ici.'
                : 'Aucune écriture ne correspond à ce filtre.'}
            </CardContent>
          </Card>
        ) : (
          pageJournal.visible.map((tx) => (
            <Card key={tx.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {tx.type === 'entree' ? (
                      <ArrowDownCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <ArrowUpCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {tx.type === 'entree' ? '+' : '−'} {formaterFCFA(tx.montant)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                      <p className="text-[11px] text-muted-foreground/80">
                        {tx.categorie} · {new Date(tx.date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      tx.statut === 'validee'
                        ? 'bg-green-100 text-green-800'
                        : tx.statut === 'annulee'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {tx.statut === 'validee' ? 'validée' : tx.statut === 'annulee' ? 'annulée' : 'en attente'}
                  </span>
                </div>
                {tx.statut === 'en_attente' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => void changerStatut(tx, 'validee')}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-green-600 px-3 py-2 text-xs font-semibold text-white min-h-[44px] disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Valider
                    </button>
                    <button
                      onClick={() => void changerStatut(tx, 'annulee')}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-800 min-h-[44px] hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Annuler
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}

        {/* MODE-976 (G13) — « charger plus » : le total affiché reste le
            nombre RÉEL de lignes filtrées restantes, jamais un au-delà. */}
        {pageJournal.restantes > 0 && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium min-h-[48px] hover:bg-foreground/5 transition-colors"
            style={{ color: COOP_COLOR }}
          >
            <ChevronDown className="w-4 h-4 inline mr-1.5" />
            Charger plus ({pageJournal.restantes} restante{pageJournal.restantes > 1 ? 's' : ''})
          </button>
        )}
      </section>

      {/* Modal nouvelle écriture */}
      <AlertDialog open={modalOuvert} onOpenChange={setModalOuvert}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Nouvelle écriture</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;écriture part « en attente » : validez-la pour qu&apos;elle compte dans le solde.
              Les cotisations sont posées par les membres eux-mêmes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2" role="group" aria-label="Type d'écriture">
              <button
                onClick={() => setType('entree')}
                aria-pressed={type === 'entree'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${type === 'entree' ? 'bg-green-600 text-white border-green-600' : 'bg-card text-muted-foreground border-border'}`}
              >
                Entrée
              </button>
              <button
                onClick={() => setType('sortie')}
                aria-pressed={type === 'sortie'}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-medium border transition-colors ${type === 'sortie' ? 'bg-red-600 text-white border-red-600' : 'bg-card text-muted-foreground border-border'}`}
              >
                Sortie
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégorie">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategorie(c.id)}
                  aria-pressed={categorie === c.id}
                  className="rounded-full border px-3 py-2 text-xs font-medium min-h-[44px] transition-colors"
                  style={
                    categorie === c.id
                      ? { backgroundColor: `${COOP_COLOR}15`, borderColor: COOP_COLOR, color: COOP_COLOR }
                      : { backgroundColor: '#fff', borderColor: '#e7e5e4', color: '#57534e' }
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Input
              value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="Montant en FCFA (ex : 25 000)"
              inputMode="numeric"
              className="h-12"
              aria-label="Montant en FCFA"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (obligatoire)"
              className="h-12"
              aria-label="Description de l'écriture"
              maxLength={200}
            />
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 text-white"
              style={{ backgroundColor: COOP_COLOR }}
              onClick={(e) => { e.preventDefault(); void soumettre() }}
            >
              Enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CoopScreenShell>
  )
}
