import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMarchandSession, erreurServeur } from '@/lib/cooperatives/resolver'

// MODE-1006 (noImplicitAny) — types de ligne minimaux : le client admin est
// volontairement non typé (DET-008) ; schéma 20260920100000 : colonnes
// consommées NOT NULL.
interface DistributionRow {
  id: string
  produit: string
  unite: string
  quantite: number
  created_at: string
}
interface BesoinRow {
  id: string
  produit: string
  quantite: number
  unite: string
  statut: string
  priorite: string
  created_at: string
}

// MODE-921 (§2.5) — « Ma coopérative » côté MARCHAND : l'adhésion courante
// de l'appelant (la plus récente, quels que soient son statut et son état
// actif) + la coopérative jointe. Le marchand non-membre reçoit
// { membre: null } — l'écran propose alors l'annuaire (GET /cooperatives/
// liste) et le bouton « Rejoindre ». AUCUNE donnée de démonstration : un
// marchand sans adhésion voit un état vide honnête.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const garde = await requireMarchandSession(req, merchantId)
    if (garde) return garde

    const supabase = createSupabaseAdminClient()

    // Dernière adhésion du marchand, active ou non — l'écran doit pouvoir
    // afficher « en attente », « suspendu », « exclu » ou « aucune ».
    const { data: adhesion, error } = await supabase
      .from('cooperative_membres')
      .select(
        'id, statut, role, date_adhesion, cotisation_payee, cooperative:cooperatives(id, nom, commune, responsable_id)'
      )
      .eq('membre_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    if (!adhesion || !(adhesion as { cooperative: unknown }).cooperative) {
      return NextResponse.json({ membre: null })
    }

    const row = adhesion as unknown as {
      id: string
      statut: string
      role: string
      date_adhesion: string | null
      cotisation_payee: boolean
      cooperative: { id: string; nom: string; commune: string | null; responsable_id: string }
    }

    // Nom du responsable + mes distributions reçues récentes (batch).
    const [{ data: responsable }, { data: distributions }] = await Promise.all([
      supabase
        .from('cooperateurs')
        .select('first_name')
        .eq('id', row.cooperative.responsable_id)
        .maybeSingle(),
      supabase
        .from('cooperative_stock_mouvements')
        .select('id, produit, unite, quantite, created_at')
        .eq('membre_id', merchantId!)
        .eq('type', 'distribution')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    // Mes besoins en cours (pour le résumé de l'écran marchand).
    const { data: besoins } = await supabase
      .from('cooperative_besoins')
      .select('id, produit, quantite, unite, statut, priorite, created_at')
      .eq('marchand_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(30)

    return NextResponse.json({
      membre: {
        id: row.id,
        statut: row.statut,
        role: row.role,
        dateAdhesion: row.date_adhesion,
        cotisationPayee: row.cotisation_payee,
      },
      cooperative: {
        ...row.cooperative,
        responsableNom: (responsable as { first_name: string } | null)?.first_name ?? null,
      },
      distributionsRecues: ((distributions ?? []) as DistributionRow[]).map((d) => ({
        id: d.id,
        produit: d.produit,
        unite: d.unite,
        quantite: Number(d.quantite),
        date: d.created_at,
      })),
      besoins: ((besoins ?? []) as BesoinRow[]).map((b) => ({
        id: b.id,
        produit: b.produit,
        quantite: Number(b.quantite),
        unite: b.unite,
        statut: b.statut,
        priorite: b.priorite,
        date: b.created_at,
      })),
    })
  } catch (error) {
    return erreurServeur('ma-cooperative', error)
  }
}
