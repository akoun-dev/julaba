import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { createNotification } from '@/lib/notifications/server'

// MODE-921 (§3.1-3.2) — gestion des membres (espace coopérative).
//
// GET : membres enrichis — le compte marchand joint (prénom, téléphone)
// est sanitisé : JAMAIS de hash/code (invariant fuite-champs-sensibles,
// même contrat que julaba-app stripSensitiveUserFields).
//
// POST : ajout direct d'un marchand par le responsable (recherche
// préalable via GET /cooperatives/search-marchand). Le marchand devient
// 'actif' immédiatement — c'est la différence avec la demande
// d'adhésion (POST /cooperatives/rejoindre) qui reste 'en_attente'.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cooperateurId = searchParams.get('cooperateurId')
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    const supabase = createSupabaseAdminClient()

    const { data: membres, error } = await supabase
      .from('cooperative_membres')
      .select('id, membre_id, statut, role, date_adhesion, cotisation_payee, created_at')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    const liste = membres ?? []
    if (liste.length === 0) {
      return NextResponse.json({ membres: [] })
    }

    // Jointure batchée des comptes marchands (2 requêtes, pas de N+1).
    const { data: marchands } = await supabase
      .from('merchants')
      .select('id, first_name, last_name, phone')
      .in(
        'id',
        liste.map((m) => m.membre_id)
      )
    const comptes = new Map<string, { id: string; first_name: string; last_name: string | null; phone: string }>(
      ((marchands ?? []) as { id: string; first_name: string; last_name: string | null; phone: string }[]).map((m) => [m.id, m])
    )

    // Cotisations réellement validées par membre (trésorerie = source de
    // vérité du paiement ; le flag cotisation_payee est un raccourci UI).
    const { data: cotisations } = await supabase
      .from('cooperative_transactions')
      .select('membre_id, montant')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .eq('statut', 'validee')
      .eq('categorie', 'cotisation')
    const cotisationsParMembre = ((cotisations ?? []) as { membre_id: string | null; montant: number | string }[]).reduce<Record<string, number>>(
      (acc, t) => {
        if (t.membre_id) acc[t.membre_id] = (acc[t.membre_id] || 0) + Number(t.montant)
        return acc
      },
      {}
    )

    return NextResponse.json({
      membres: liste.map((m) => {
        const compte = comptes.get(m.membre_id)
        return {
          id: m.id,
          marchandId: m.membre_id,
          prenom: compte?.first_name ?? null,
          nom: compte?.last_name ?? null,
          telephone: compte?.phone ?? null,
          statut: m.statut,
          role: m.role,
          dateAdhesion: m.date_adhesion,
          cotisationPayee: m.cotisation_payee,
          totalCotisations: Math.round(cotisationsParMembre[m.membre_id] || 0),
          membreDepuis: m.created_at,
        }
      }),
    })
  } catch (error) {
    return erreurServeur('membres GET', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cooperateurId, marchandId, dateAdhesion } = body as {
      cooperateurId?: string
      marchandId?: string
      dateAdhesion?: string
    }
    const garde = await requirePresident(req, cooperateurId)
    if ('erreur' in garde) return garde.erreur

    if (!marchandId || typeof marchandId !== 'string') {
      return NextResponse.json({ erreur: 'Marchand requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // Le compte marchand doit exister — pas de membre fantôme.
    const { data: marchand } = await supabase
      .from('merchants')
      .select('id, first_name')
      .eq('id', marchandId)
      .maybeSingle()
    if (!marchand) {
      return NextResponse.json({ erreur: 'Marchand non trouvé' }, { status: 404 })
    }

    // Un marchand ne peut avoir qu'UNE adhésion active (index unique partiel
    // côté julaba-app ; ici on vérifie explicitement pour un 409 lisible).
    const { data: dejaMembre } = await supabase
      .from('cooperative_membres')
      .select('id, cooperative_id, statut')
      .eq('membre_id', marchandId)
      .eq('actif', true)
      .maybeSingle()
    if (dejaMembre) {
      const dejaDansMaCoop = dejaMembre.cooperative_id === garde.ctx.cooperative.id
      return NextResponse.json(
        {
          erreur: dejaDansMaCoop
            ? 'Ce marchand est déjà membre de votre coopérative'
            : 'Ce marchand est déjà membre d\u2019une autre coopérative',
        },
        { status: 409 }
      )
    }

    const { data: membre, error } = await supabase
      .from('cooperative_membres')
      .insert({
        cooperative_id: garde.ctx.cooperative.id,
        membre_id: marchandId,
        statut: 'actif',
        role: 'membre',
        date_adhesion: typeof dateAdhesion === 'string' && dateAdhesion ? dateAdhesion : new Date().toISOString().slice(0, 10),
      })
      .select('id, statut, role')
      .single()
    if (error) {
      // Filet anti-course : l'index unique partiel uniq_coop_membre_actif
      // (MODE-922) rejette l'insertion si une adhésion active a été créée
      // entre le check ci-dessus et l'insertion — 409 lisible, jamais 500.
      if (error.code === '23505') {
        return NextResponse.json(
          { erreur: 'Ce marchand a une adhésion active dans une autre coopérative' },
          { status: 409 }
        )
      }
      throw error
    }

    // Le marchand ajouté est prévenu (notification réelle).
    await createNotification({
      subjectType: 'merchant',
      subjectId: marchandId,
      type: 'cooperative_info',
      title: 'Bienvenue dans la coopérative',
      body: `Vous avez été ajouté à « ${garde.ctx.cooperative.nom} » comme membre actif.`,
    })

    return NextResponse.json({ membre }, { status: 201 })
  } catch (error) {
    return erreurServeur('membres POST', error)
  }
}
