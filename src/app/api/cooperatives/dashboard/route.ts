import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { agregerTresorerieValidee } from '@/lib/cooperatives/tresorerie'

// MODE-972 (AUDIT-006 §5, Phase 1) — agrégat UNIQUE du dashboard de
// l'espace coopérative : UN aller-retour HTTP pour tout ce que les widgets
// du futur écran d'accueil affichent, calqué sur le pattern du dashboard
// BO (/api/backoffice : garde → lectures parallèles → agrégats côté Node).
//
// GET ?cooperateurId=&jours=7|30 (30 par défaut) renvoie :
//   • resume          — le MÊME agrégat que GET /api/cooperatives (les huit
//                       champs existants, solde via le module partagé
//                       MODE-935 : jamais de second calcul divergent) ;
//   • series.tresorerie — entrées/sorties/cotisations VALIDÉES par jour
//                       sur la fenêtre (zéro rempli pour les jours sans
//                       écriture) ;
//   • kpis            — membres gagnés, trésorerie nette et cotisations de
//                       la période, chacun avec la valeur de la période
//                       PRÉCÉDENTE et le delta brut (le % est une décision
//                       d'affichage, pas une donnée) ;
//   • topProduits     — top 5 du pot commun par quantité ;
//   • mouvementsRecents — les 10 derniers apports/distributions (écart #9
//                       de l'audit : le président ne voyait AUCUN journal
//                       du pot commun) ;
//   • fileActions     — adhésions en attente, écritures en attente
//                       (compteur exact, écart #7 : l'ancien compteur
//                       dérivé des 100 dernières lignes n'était jamais lu),
//                       besoins en attente à dispatcher.
//
// Choix d'implémentation (ADR, garde-fou #6 de l'audit) : le BO calcule sa
// tendance 7 jours avec un head-count PAR JOUR (compter suffit pour des
// adhésions) — ici les SÉRIES sont des sommes : 30-60 requêtes/jour
// seraient un N+1 déguisé. UNE seule lecture bornée de 2×jours (fenêtre
// courante + fenêtre précédente) sur cooperative_transactions, indexée par
// (cooperative_id, created_at desc), agrégée en JS. Coût documenté : au
// pire 60 jours d'écritures validées d'UNE coopérative (quelques centaines
// de lignes légères : type, categorie, montant, created_at).
//
// Bornes jour = UTC : le déploiement est Africa/Abidjan (UTC+0, pas
// d'heure d'été) — jour ISO = jour civil local, aucune ambiguïté.
//
// Honnêteté des données (garde-fou #1) : toutes les valeurs dérivent des
// tables — aucune cible inventée, aucun remplissage cosmétique ; les
// périodes sans activité renvoient des zéros explicites.

const PERIODES = [7, 30] as const
type Periode = (typeof PERIODES)[number]
const JOUR_MS = 86_400_000

export type DashboardKpi = { valeur: number; precedent: number; delta: number }
export type DashboardJour = {
  jour: string
  entrees: number
  sorties: number
  cotisations: number
  net: number
}
export type DashboardResponse = {
  cooperative: { id: string; nom: string; commune: string | null; responsableId: string; actif: boolean }
  periode: { jours: number; debut: string; fin: string }
  genereLe: string
  resume: {
    membresTotal: number
    membresActifs: number
    adhesionsEnAttente: number
    membresSuspendus: number
    soldeTresorerie: number
    totalCotisations: number
    produitsEnStock: number
    articlesEnStock: number
  }
  series: { tresorerie: DashboardJour[] }
  kpis: {
    membresGagnes: DashboardKpi
    tresorerieNette: DashboardKpi
    cotisations: DashboardKpi
  }
  topProduits: Array<{ produit: string; categorie: string | null; unite: string; quantite: number }>
  mouvementsRecents: Array<{
    id: string
    produit: string
    unite: string
    type: string
    quantite: number
    membreId: string | null
    date: string
  }>
  fileActions: { adhesionsEnAttente: number; ecrituresEnAttente: number; besoinsADispatcher: number }
}

function kpi(valeur: number, precedent: number): DashboardKpi {
  return { valeur, precedent, delta: valeur - precedent }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    // Garde d'abord (identité avant validation — convention MODE-965) :
    // session appareil + coopérative résolue SERVEUR depuis responsable_id.
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur
    const { cooperative } = garde.ctx

    const joursBrut = searchParams.get('jours')
    const jours = joursBrut == null || joursBrut === '' ? 30 : Number(joursBrut)
    if (!PERIODES.includes(jours as Periode)) {
      return NextResponse.json({ erreur: 'Période invalide (7|30 jours)' }, { status: 400 })
    }

    // Fenêtre courante = les `jours` derniers jours (aujourd'hui inclus) ;
    // fenêtre précédente = les `jours` d'avant (deltas). Bornes [incluse,
    // excluse) alignées sur des minuits UTC — finExcl = demain 00:00.
    const maintenant = new Date()
    const finExcl = new Date(maintenant)
    finExcl.setUTCHours(0, 0, 0, 0)
    finExcl.setUTCDate(finExcl.getUTCDate() + 1)
    const debutCourante = new Date(finExcl.getTime() - jours * JOUR_MS)
    const debutPrecedente = new Date(debutCourante.getTime() - jours * JOUR_MS)
    const tCourante = debutCourante.getTime()
    const tPrecedente = debutPrecedente.getTime()

    const supabase = createSupabaseAdminClient()

    // 6 lectures PARALLÈLES, toutes bornées/indexées — zéro N+1, puis
    // l'agrégat partagé en séquence (l'ordre est aussi celui attendu par
    // le harnais) :
    //   1. membres (statut + created_at : répartition ET fenêtres d'adhésion)
    //   2. écritures validées des 2 fenêtres (séries + KPI)
    //   3. pot commun complet (resume + top 5 en JS — table bornée par
    //      l'UNIQUE (cooperative_id, produit))
    //   4. 10 derniers mouvements du pot commun
    //   5. compteur exact des écritures en attente (head-count, pas la
    //      distorsion des 100 dernières lignes)
    //   6. compteur exact des besoins en attente
    const [
      membresRes,
      fenetreRes,
      stockRes,
      mouvementsRes,
      ecrituresAttenteRes,
      besoinsAttenteRes,
    ] = await Promise.all([
      supabase
        .from('cooperative_membres')
        .select('statut, created_at')
        .eq('cooperative_id', cooperative.id),
      supabase
        .from('cooperative_transactions')
        .select('type, categorie, montant, created_at')
        .eq('cooperative_id', cooperative.id)
        .eq('statut', 'validee')
        .gte('created_at', debutPrecedente.toISOString())
        .lt('created_at', finExcl.toISOString()),
      supabase
        .from('cooperative_stock')
        .select('produit, categorie, quantite, unite')
        .eq('cooperative_id', cooperative.id),
      supabase
        .from('cooperative_stock_mouvements')
        .select('id, produit, unite, type, quantite, membre_id, created_at')
        .eq('cooperative_id', cooperative.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('cooperative_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('cooperative_id', cooperative.id)
        .eq('statut', 'en_attente'),
      supabase
        .from('cooperative_besoins')
        .select('id', { count: 'exact', head: true })
        .eq('cooperative_id', cooperative.id)
        .eq('statut', 'en_attente'),
    ])

    if (membresRes.error) throw membresRes.error
    if (fenetreRes.error) throw fenetreRes.error
    if (stockRes.error) throw stockRes.error
    if (mouvementsRes.error) throw mouvementsRes.error
    if (ecrituresAttenteRes.error) throw ecrituresAttenteRes.error
    if (besoinsAttenteRes.error) throw besoinsAttenteRes.error

    // ── Solde/cotisations TOUTES périodes — module partagé MODE-935 ──
    // Séquencé après les lectures parallèles (même pattern que
    // GET /api/cooperatives et que le BO, dont les compteurs annexes
    // suivent aussi son Promise.all) : MÊME agrégat que les deux routes
    // existantes, jamais un second calcul divergent.
    const treso = await agregerTresorerieValidee(supabase, cooperative.id)

    // ── Répartition des membres (resume + adhésions en attente) ──
    const membres = ((membresRes.data ?? []) as { statut: string; created_at: string }[])
    const parStatut = membres.reduce<Record<string, number>>((acc, m) => {
      acc[m.statut] = (acc[m.statut] || 0) + 1
      return acc
    }, {})

    // ── Membres gagnés : nouvelles adhésions par fenêtre ──
    let membresCourant = 0
    let membresPrecedent = 0
    for (const m of membres) {
      const t = new Date(m.created_at).getTime()
      if (t >= tCourante && t < finExcl.getTime()) membresCourant += 1
      else if (t >= tPrecedente && t < tCourante) membresPrecedent += 1
    }

    // ── Séries jour par jour + sommes de période ──
    const fenetre = (fenetreRes.data ?? []) as Array<{
      type: string
      categorie: string
      montant: number | string
      created_at: string
    }>
    const serie: DashboardJour[] = Array.from({ length: jours }, (_, i) => ({
      jour: new Date(tCourante + i * JOUR_MS).toISOString().slice(0, 10),
      entrees: 0,
      sorties: 0,
      cotisations: 0,
      net: 0,
    }))
    const courant = { entrees: 0, sorties: 0, cotisations: 0 }
    const precedent = { entrees: 0, sorties: 0, cotisations: 0 }
    for (const row of fenetre) {
      const t = new Date(row.created_at).getTime()
      const montant = Number(row.montant) || 0
      const entree = row.type === 'entree'
      // La cotisation est une ENTRÉE catégorie 'cotisation' (les sorties
      // ne peuvent pas porter cette catégorie — même sémantique que le
      // module partagé MODE-935).
      const cotisation = entree && row.categorie === 'cotisation'
      if (t >= tCourante && t < finExcl.getTime()) {
        const jour = serie[Math.floor((t - tCourante) / JOUR_MS)]
        if (entree) {
          jour.entrees += montant
          courant.entrees += montant
        } else {
          jour.sorties += montant
          courant.sorties += montant
        }
        if (cotisation) {
          jour.cotisations += montant
          courant.cotisations += montant
        }
      } else if (t >= tPrecedente && t < tCourante) {
        if (entree) precedent.entrees += montant
        else precedent.sorties += montant
        if (cotisation) precedent.cotisations += montant
      }
    }
    for (const j of serie) {
      j.entrees = Math.round(j.entrees)
      j.sorties = Math.round(j.sorties)
      j.cotisations = Math.round(j.cotisations)
      j.net = j.entrees - j.sorties
    }

    // ── Pot commun : resume + top 5 (par quantité décroissante) ──
    const stock = ((stockRes.data ?? []) as {
      produit: string
      categorie: string | null
      quantite: number | string
      unite: string
    }[])
    const produitsEnStock = stock.length
    // MÊME calcul que GET /api/cooperatives (pas d'arrondi : Σ des
    // quantités numeric(15,2) telles quelles).
    const articlesEnStock = stock.reduce((s, p) => s + Number(p.quantite), 0)
    const topProduits = [...stock]
      .sort((a, b) => Number(b.quantite) - Number(a.quantite))
      .slice(0, 5)
      .map((p) => ({
        produit: p.produit,
        categorie: p.categorie,
        unite: p.unite,
        quantite: Number(p.quantite),
      }))

    // ── Journal du pot commun (10 derniers mouvements) ──
    const mouvementsRecents = ((mouvementsRes.data ?? []) as Array<{
      id: string
      produit: string
      unite: string
      type: string
      quantite: number | string
      membre_id: string | null
      created_at: string
    }>).map((m) => ({
      id: m.id,
      produit: m.produit,
      unite: m.unite,
      type: m.type,
      quantite: Number(m.quantite),
      membreId: m.membre_id,
      date: m.created_at,
    }))

    return NextResponse.json({
      cooperative: {
        id: cooperative.id,
        nom: cooperative.nom,
        commune: cooperative.commune,
        responsableId: cooperative.responsable_id,
        actif: cooperative.actif,
      },
      periode: {
        jours,
        debut: serie[0].jour,
        fin: serie[serie.length - 1].jour,
      },
      genereLe: maintenant.toISOString(),
      resume: {
        membresTotal: membres.length,
        membresActifs: parStatut['actif'] || 0,
        adhesionsEnAttente: parStatut['en_attente'] || 0,
        membresSuspendus: parStatut['suspendu'] || 0,
        soldeTresorerie: treso.solde,
        totalCotisations: treso.totalCotisations,
        produitsEnStock,
        articlesEnStock,
      },
      series: { tresorerie: serie },
      kpis: {
        membresGagnes: kpi(membresCourant, membresPrecedent),
        tresorerieNette: kpi(
          Math.round(courant.entrees - courant.sorties),
          Math.round(precedent.entrees - precedent.sorties)
        ),
        cotisations: kpi(Math.round(courant.cotisations), Math.round(precedent.cotisations)),
      },
      topProduits,
      mouvementsRecents,
      fileActions: {
        adhesionsEnAttente: parStatut['en_attente'] || 0,
        ecrituresEnAttente: ecrituresAttenteRes.count ?? 0,
        besoinsADispatcher: besoinsAttenteRes.count ?? 0,
      },
    })
  } catch (error) {
    return erreurServeur('dashboard GET', error)
  }
}
