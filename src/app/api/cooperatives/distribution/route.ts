import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireMembreActifOuPresident, erreurServeur } from '@/lib/cooperatives/resolver'
import { createNotification } from '@/lib/notifications/server'

// MODE-921 (§3.4) — distribution du pot commun à UN ou PLUSIEURS membres.
//
// La cohérence est portée par la RPC coop_distribuer_stock (migration
// 20260920100100) : vérification du disponible sous verrou, refus
// INTÉGRAL si demande > disponible (jamais de stock négatif, jamais de
// distribution partielle), UN mouvement par destinataire, idempotence
// sur clientId (rejeu offline reconnu, rien re-compté).
//
// Les notifications « stock_commun_recu » sont posées APRÈS commit (le
// destinataire n'est pas prévenu d'un fait qui aurait pu être annulé).

type Destinataire = { membreId: string; quantite: number }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, cooperateurId, produit, quantite, unite, destinataires, besoinId, clientId } = body as {
      merchantId?: string
      cooperateurId?: string
      produit?: string
      quantite?: number
      unite?: string
      destinataires?: Destinataire[]
      besoinId?: string
      clientId?: string
    }
    // MODE-931 — garde duale : membre actif (merchantId) OU président
    // (cooperateurId). L'opérateur signe le mouvement du distributeur.
    const garde = await requireMembreActifOuPresident(req, { merchantId, cooperateurId })
    if ('erreur' in garde) return garde.erreur
    const operateurId = garde.ctx.type === 'president' ? garde.ctx.cooperateurId : garde.ctx.merchantId

    const produitTrim = typeof produit === 'string' ? produit.trim() : ''
    if (!produitTrim) {
      return NextResponse.json({ erreur: 'Produit requis' }, { status: 400 })
    }
    const quantiteNum = Number(quantite)
    if (!Number.isFinite(quantiteNum) || quantiteNum <= 0) {
      return NextResponse.json({ erreur: 'Quantité invalide' }, { status: 400 })
    }
    if (!Array.isArray(destinataires) || destinataires.length === 0) {
      return NextResponse.json({ erreur: 'Au moins un destinataire est requis' }, { status: 400 })
    }
    // Validation stricte des parts : membreId présent, quantité > 0.
    const parts: Destinataire[] = destinataires.map((d) => ({
      membreId: String(d.membreId ?? ''),
      quantite: Number(d.quantite),
    }))
    if (parts.some((d) => !d.membreId || !Number.isFinite(d.quantite) || d.quantite <= 0)) {
      return NextResponse.json(
        { erreur: 'Destinataire invalide — membreId et quantité positive requis' },
        { status: 400 }
      )
    }
    // Le distributeur distribue à des membres ACTIFS de SA coopérative :
    // vérification en batch (un id forgé ne reçoit pas de stock).
    const supabase = createSupabaseAdminClient()
    const { data: membresActifs } = await supabase
      .from('cooperative_membres')
      .select('membre_id')
      .eq('cooperative_id', garde.ctx.cooperative.id)
      .eq('statut', 'actif')
    const actifs = new Set((membresActifs ?? []).map((m) => m.membre_id))
    const horsCooperative = parts.filter((d) => !actifs.has(d.membreId))
    if (horsCooperative.length > 0) {
      return NextResponse.json(
        { erreur: 'Un destinataire n\u2019est pas membre actif de votre coopérative' },
        { status: 403 }
      )
    }

    const uniteTrim = typeof unite === 'string' && unite.trim() ? unite.trim() : 'kg'

    const { data: resultat, error } = await supabase.rpc('coop_distribuer_stock', {
      p_cooperative_id: garde.ctx.cooperative.id,
      p_membre_id: operateurId,
      p_produit: produitTrim,
      p_quantite: quantiteNum,
      p_unite: uniteTrim,
      p_destinataires: parts,
      p_besoin_id: typeof besoinId === 'string' && besoinId ? besoinId : null,
      p_client_id: typeof clientId === 'string' && clientId ? clientId : null,
    })
    if (error) {
      // Rejets métier définifs : l'UI peut les afficher tels quels, la
      // file offline ne doit PAS rejouer (conflit, pas erreur transitoire).
      const message = (error as { message?: string }).message || ''
      if (message.includes('STOCK_INSUFFISANT')) {
        const match = message.match(/disponible=([0-9.]+)/)
        return NextResponse.json(
          {
            erreur: 'Stock commun insuffisant pour cette distribution',
            disponible: match ? Number(match[1]) : null,
          },
          { status: 422 }
        )
      }
      if (message.includes('PRODUIT_ABSENT')) {
        return NextResponse.json({ erreur: 'Produit absent du stock commun' }, { status: 422 })
      }
      if (message.includes('PARTS_INCOHERENTES')) {
        return NextResponse.json(
          { erreur: 'La somme des parts ne correspond pas à la quantité distribuée' },
          { status: 422 }
        )
      }
      if (message.includes('PART_INVALIDE') || message.includes('QUANTITE_INVALIDE')) {
        return NextResponse.json({ erreur: 'Quantité invalide' }, { status: 422 })
      }
      if (message.includes('DESTINATAIRE_MANQUANT')) {
        return NextResponse.json({ erreur: 'Destinataire manquant' }, { status: 422 })
      }
      // MODE-942 (I-06) — la clôture du besoin vit dans la transaction :
      // ces refus protègent contre toute ré-distribution incohérente.
      if (message.includes('BESOIN_DEJA_LIVRE')) {
        return NextResponse.json({ erreur: 'Ce besoin a déjà été livré' }, { status: 409 })
      }
      if (message.includes('BESOIN_INCOHERENT')) {
        return NextResponse.json(
          { erreur: 'Le produit ou l’unité ne correspond pas à ce besoin' },
          { status: 422 }
        )
      }
      if (message.includes('BESOINTROUVABLE')) {
        return NextResponse.json({ erreur: 'Besoin introuvable dans cette coopérative' }, { status: 404 })
      }
      throw error
    }

    // Notifications post-commit — le fait est certain maintenant.
    // MODE-931 : type dédié stock_commun_recu (sévérité success, catégorie
    // stock, priorité high) au lieu du générique cooperative_info.
    await Promise.all(
      parts
        .filter((d) => d.membreId !== operateurId)
        .map((d) =>
          createNotification({
            subjectType: 'merchant',
            subjectId: d.membreId,
            type: 'stock_commun_recu',
            title: 'Stock commun reçu',
            body: `${Number(d.quantite)} ${uniteTrim} de ${produitTrim} vous ont été distribués via le stock commun de ${garde.ctx.cooperative.nom}.`,
          })
        )
    )

    return NextResponse.json({ persisted: resultat !== null, stock: resultat }, { status: 201 })
  } catch (error) {
    return erreurServeur('distribution', error)
  }
}
