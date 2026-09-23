// Le parseur principal — VERBATIM intégral, aucune ligne du corps changée.
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import { findCatalogEntry, catalogSummaryText } from '../../supplier-catalog'
import { unitLabel, formatQuantity } from '@/lib/stock/units'
import { CONFIRM_ASK, formatMontantParle } from '../tata-phrases'
import { formatFCFA } from '@/lib/utils'
import { TATA_GOODBYE, type ParsedIntent } from './types'
import { extractAmount } from './numbers'
import { extractQuantity, extractQuantityWithUnit } from './quantities'
import { extractProduct } from './products'
import { normalizeVoiceTranscript } from './transcript'
import { END_CONVERSATION_RE, NAV_KEYWORDS, EXPENSE_CATEGORIES, EXPENSE_KEYWORDS, RESTOCK_KEYWORDS, CONSULTATION_KEYWORDS, STOCK_LOSS_RE, STOCK_ADJUST_RE, PURCHASE_RE, PURCHASE_SUPPLIER_RE, STOCK_PRODUCTION_RE, MARGIN_CHECK_RE, CREDIT_SALE_GUARD_RE, ANNULE_VENTE_RE, CREDIT_DOIT_RE, CREDIT_PAYE_MOI_RE, CREDIT_PAYE_RE, STOCK_CHECK_RE, creditClientName, creditTailAmount } from './triggers'

export function parseIntent(transcript: string): ParsedIntent {
  const lower = normalizeVoiceTranscript(transcript)
  
  // Check for yes/no/cancel first
  if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon|oui c\'?est ça|d\'?accord|affirmatif)$/i.test(lower)) {
    return {
      type: 'yes',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: ''
    }
  }
  
  if (/^(non|non c\'?est pas|annule|n\'?annule pas|faux|pas ça|cancel)$/i.test(lower)) {
    return {
      type: 'no',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: 'D\'accord, j\'annule.'
    }
  }

  // Fidélité : ces consultations passent avant la navigation générique
  // « fidélité » afin que Tata réponde avec les données du compte au lieu de
  // seulement ouvrir l'écran.
  if (/(?:prochain|niveau|combien.*manque|manque.*points)/i.test(lower) && /points?|niveau/i.test(lower)) {
    return { type: 'loyalty_level', confidence: 0.9, rawTranscript: transcript, responseText: 'Je regarde ta progression fidélité.' }
  }
  if (/(?:que|qu['’]est-ce que)\s+(?:je peux|j['’]ai)\s+(?:avoir|obtenir)|récompenses?|avantages?\s+(?:fidélité|avec mes points)/i.test(lower)) {
    return { type: 'loyalty_rewards', confidence: 0.9, rawTranscript: transcript, responseText: 'Je regarde tes avantages disponibles.' }
  }
  if (/(?:combien|quel est|mon)\s+(?:j['’]ai\s+)?(?:de\s+)?points|solde.*points|points.*solde/i.test(lower)) {
    return { type: 'loyalty_balance', confidence: 0.95, rawTranscript: transcript, responseText: 'Je regarde tes points fidélité.' }
  }

  // ── Intents stock (STK-807, §2.7) — AVANT le détecteur de fin ──────────
  // « Il me reste plus rien de tomates » contient « plus rien » (fin de
  // conversation) : les intentions stock DOIVENT passer avant, sinon Tata
  // dit au revoir au lieu de répondre. Ordre : actions (perte, ajustement,
  // achat) > consultation (stock_check).
  const stockProduct = extractProduct(lower)
  const stockQtyUnit = extractQuantityWithUnit(lower)

  // Perte (§41) : « j'ai perdu 5 kilos de tomates », « tomates gâtées »,
  // « 3 sacs abîmés », « volés »… JAMAIS une vente ni une dépense.
  if (STOCK_LOSS_RE.test(lower) && (stockProduct || stockQtyUnit)) {
    return {
      type: 'stock_loss',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit?.quantity,
      unit: stockQtyUnit?.unit || undefined,
      rawTranscript: transcript,
      responseText: !stockQtyUnit
        ? `Qu'avez-vous perdu, et combien ?`
        : stockProduct
          ? `Perte de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ${stockProduct}, c'est bien ça ?`
          : `Perte de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''}, c'est bien ça ?`
    }
  }

  // Ajustement manuel : « ajoute 20 kilos de riz », « enlève 3 sachets ».
  // (Le « reçu / réappro / livré » reste au restock historique.)
  if (STOCK_ADJUST_RE.test(lower) && stockQtyUnit) {
    const direction = /(?:enl[eè]v|retir)/i.test(lower) ? -1 : 1
    const qtyParle = `${stockQtyUnit.quantity} ${stockQtyUnit.unit ? unitLabel(stockQtyUnit.unit, stockQtyUnit.quantity) : ''}`.trim()
    return {
      type: 'stock_adjust',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit.quantity,
      unit: stockQtyUnit.unit || undefined,
      rawTranscript: transcript,
      responseText: stockProduct
        ? `${direction < 0 ? 'Retrait' : 'Ajout'} ${stockProduct} : ${qtyParle}, c'est bien ça ?`
        : `${direction < 0 ? 'Retrait' : 'Ajout'} de ${qtyParle}, sur quel produit ?`
    }
  }

  // Achat de marchandises (§10/§30) : « j'ai acheté 2 sacs d'oignons à
  // 12 000 le sac », « acheté du riz 500 ». CAPTE le « acheté » AVANT
  // l'expense : « acheté du riz » est un ACHAT de stock (« riz » est un
  // produit), « dépensé 2000 transport » reste une dépense (pas un produit).
  if (PURCHASE_RE.test(lower) && stockProduct) {
    // MODE-907 (§15) — fournisseur dicté « chez <nom> » (1-3 mots, fin de
    // phrase, casse libre) : capté sur le transcript ORIGINAL (casse du nom
    // conservée, comme les intents crédit), puis RETIRÉ du flux montant —
    // « à 15 000 francs chez Koné » est un total de 15 000, jamais un prix
    // à multiplier après le nom. L'espace des milliers orale (« 15 000 »)
    // est normalisée dans ce flux (le lecteur de total historique ne lit
    // que des chiffres contigus) ; les phrases SANS « chez » gardent le
    // comportement exact d'avant (non-régression testée).
    const source = transcript.trim()
    const chezMatch = source.match(PURCHASE_SUPPLIER_RE)
    const supplier = chezMatch ? chezMatch[1].replace(/\s+/g, ' ').trim() : undefined
    const amountText = supplier
      ? source
          .replace(PURCHASE_SUPPLIER_RE, '')
          .toLowerCase()
          .replace(/(\d)[ \u00A0\u202F](\d{3})(?!\d)/g, '$1$2')
      : lower
    const priceMatch = amountText.match(/à\s*(\d[\d\s]*)\s*(?:francs?|fcfa|f)?\s*(?:le\s+\w+|l['’]\w+)?(?:$|\s)/i)
    const tailAmount = amountText.match(/(?:^|\s)(\d{3,7})\s*(?:francs?|fcfa|f)?\s*$/i)
    const unitPrice = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : undefined
    const total = tailAmount ? parseInt(tailAmount[1]) : unitPrice && stockQtyUnit ? Math.round(unitPrice * stockQtyUnit.quantity) : unitPrice
    return {
      type: 'purchase',
      confidence: 0.9,
      product: stockProduct,
      quantity: stockQtyUnit?.quantity,
      unit: stockQtyUnit?.unit || undefined,
      amount: total,
      unitPrice,
      supplier,
      rawTranscript: transcript,
      responseText: `Achat de ${stockQtyUnit ? `${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ` : ''}${stockProduct}${total ? ` pour ${formatFCFA(total)}` : ''}${supplier ? ` chez ${supplier}` : ''}, c'est bien ça ?`
    }
  }

  // Production propre (STK-809) : « j'ai produit 50 oeufs » — entrée
  // PRODUCTION, avant l'arbitrage achat (produire ≠ acheter).
  if (STOCK_PRODUCTION_RE.test(lower) && stockQtyUnit) {
    return {
      type: 'stock_production',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit.quantity,
      unit: stockQtyUnit.unit || undefined,
      rawTranscript: transcript,
      responseText: stockProduct
        ? `Production de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ${stockProduct}, c'est bien ça ?`
        : `Production de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''}, sur quel produit ?`
    }
  }

  // Consultation de stock (§38) : « il reste combien de tomates ? », «
  // combien de sacs d'oignons il me reste ? », « stock de riz ».
  // Exige un produit : « ouvre mon stock » reste une navigation.
  if (STOCK_CHECK_RE.test(lower) && stockProduct) {
    return {
      type: 'stock_check',
      confidence: 0.85,
      product: stockProduct,
      rawTranscript: transcript,
      responseText: `Je regarde ton stock de ${stockProduct}...`
    }
  }

  // Consultation de marge (STK-810) : coût réel (achats) vs prix dicté
  // ou enregistré — marge inconnue = « je ne sais pas », perte dite telle
  // quelle. Après stock_check (arbitrage actions>consultation, « marge »
  // ne doit jamais retomber dans « combien de »).
  if (MARGIN_CHECK_RE.test(lower) && stockProduct) {
    return {
      type: 'margin_check',
      confidence: 0.85,
      product: stockProduct,
      rawTranscript: transcript,
      responseText: `Je calcule ta marge sur ${stockProduct}...`
    }
  }

  // Fin de conversation explicite (VOCAL-607) — AVANT le cancel :
  // « plus rien » / « c'est tout » clôturent l'échange avec le goodbye,
  // ils ne sont plus des annulations génériques.
  if (END_CONVERSATION_RE.test(lower)) {
    return {
      type: 'end',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: TATA_GOODBYE
    }
  }
  
  if (/(?:annule tout|stop|arrête|ferme)/i.test(lower)) {
    return {
      type: 'cancel',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: 'D\'accord, j\'ai tout annulé.'
    }
  }

  // MODE-909 (§28) — annulation de la dernière vente : « annule la dernière
  // vente », « annule la vente » (impératif ou participe passé parlé,
  // possessif « ma » accepté). AVANT le cancel générique — « annule la
  // vente » n'est PAS « annule tout ». Le parseur ne fait que reconnaître
  // l'intention : les infos de la vente (montant, produit) viennent du
  // journal local de caisse et la confirmation orale reste côté
  // voice-modal (pendingConfirmRef) — JAMAIS d'annulation sans oui.
  if (ANNULE_VENTE_RE.test(lower)) {
    return {
      type: 'annule_vente',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: 'Annulation de la dernière vente enregistrée.'
    }
  }
  
  // ── Crédits clients (MODE-906, §21-22) — AVANT credit_block et AVANT les
  // mots-clés de dépense (« payé ») : « Adjoua m'a payé les 3 000 francs »
  // est un REMBOURSEMENT, jamais une dépense. Garde : une phrase de vente
  // (« vendu ») ou de stock (« acheté », « stock ») n'est jamais un crédit.
  // Les regex passent sur le transcript ORIGINAL (casse du nom conservée).
  if (!CREDIT_SALE_GUARD_RE.test(lower)) {
    const source = transcript.trim()
    const doitMatch = source.match(CREDIT_DOIT_RE)
    if (doitMatch) {
      const client = creditClientName(doitMatch[1] ?? '')
      if (client) {
        const amount = creditTailAmount(doitMatch[2])
        return {
          type: 'credit_doit',
          confidence: 0.9,
          client,
          amount: amount ?? undefined,
          rawTranscript: transcript,
          responseText: amount
            ? `Je note que ${client} te doit ${formatMontantParle(amount)} francs.`
            : `Combien ${client} te doit ?`,
        }
      }
    }

    const payeMoiMatch = source.match(CREDIT_PAYE_MOI_RE)
    const payeSimpleMatch = payeMoiMatch ? null : source.match(CREDIT_PAYE_RE)
    const payeMatch = payeMoiMatch ?? payeSimpleMatch
    if (payeMatch) {
      const client = creditClientName(payeMatch[1] ?? '')
      if (client) {
        const amount = creditTailAmount(payeMatch[2])
        return {
          type: 'credit_paye',
          confidence: 0.9,
          client,
          amount: amount ?? undefined,
          rawTranscript: transcript,
          responseText: amount
            ? `Je note que ${client} t'a payé ${formatMontantParle(amount)} francs.`
            : `Combien ${client} t'a payé ?`,
        }
      }
    }
  }

  // Check for credit (blocked)
  if (/(?:crédit|credit|à crédit|a credit)/i.test(lower) && !/(?:reçu|reception|reception)/i.test(lower)) {
    return {
      type: 'credit_block',
      confidence: 0.9,
      rawTranscript: transcript,
      // MODE-906 (§21) — le crédit est activé (caisse + dictée de dette) :
      // l'intent reste pour orienter les formulations non reconnues.
      responseText: 'Pour vendre à crédit, passe par la caisse et choisis Crédit. Pour noter une dette, dis : [nom] me doit [montant] francs.',
    }
  }
  
  // Check back (go to previous screen)
  if (/^(?:retour|rétour|revenir|reveni|pralé en arrière|va en arrière)$/i.test(lower)) {
    return {
      type: 'back',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: 'Retour à l\'écran précédent.'
    }
  }

  // Check supplier order ("commander") — MUST run before the navigation
  // keywords because "commandes" is also a screen name. Rules:
  //   • verb + produit/quantité reconnus  → intention 'order' complète
  //   • "commander"/"commandez" seul      → question de clarification
  //   • "mes commandes" / "commandes" (nom) → tombe jusqu'à la navigation
  if (/command(?:er|ez|ons|e)\b/i.test(lower)) {
    const catalogEntry = findCatalogEntry(lower)
    const qty = extractQuantity(lower)
    if (catalogEntry) {
      const q = qty || 1
      return {
        type: 'order',
        confidence: 0.9,
        product: catalogEntry.name,
        supplier: catalogEntry.supplier,
        quantity: q,
        rawTranscript: transcript,
        responseText: `Commande de ${q} × ${catalogEntry.name} chez ${catalogEntry.supplier}, c'est bien ça ?`
      }
    }
    const spokenProduct = extractProduct(lower)
    if (spokenProduct || qty) {
      return {
        type: 'order',
        confidence: 0.75,
        product: spokenProduct || undefined,
        quantity: qty || undefined,
        rawTranscript: transcript,
        responseText: `Je ne trouve pas « ${spokenProduct ?? 'ce produit'} » au marché. Produits disponibles : ${catalogSummaryText()}.`
      }
    }
    if (/command(?:er|ez)\b/i.test(lower)) {
      return {
        type: 'order',
        confidence: 0.7,
        rawTranscript: transcript,
        responseText: 'Que voulez-vous commander ? Dites par exemple « commander deux sacs de riz ».'
      }
    }
    // "commande"/"commandons" sans produit ni quantité : ce n'est probablement
    // pas une commande fournisseur — laisser le reste du parseur décider
    // (ex. « mes commandes » navigue vers l'écran Commandes).
  }

  // Check navigation
  for (const [keyword, route] of Object.entries(NAV_KEYWORDS)) {
    if (lower.includes(keyword)) {
      const navPhrases: Record<string, string> = {
        'stock': 'J\'ouvre ton stock.',
        'depenses': 'J\'ouvre tes dépenses.',
        'ventes': 'J\'ouvre tes ventes passées.',
        'keiwa': 'J\'ouvre ton portefeuille Keiwa.',
        'caisse': 'J\'ouvre ta caisse.',
        'marche': 'J\'ouvre le marché.',
        'tontines': 'J\'ouvre tes tontines.',
        'home': 'Retour à l\'accueil.',
        'commandes': 'J\'ouvre tes commandes.',
        'profil': 'J\'ouvre ton profil.',
        'academy': 'J\'ouvre l\'académie.',
        'fidelite': 'J\'ouvre ta fidélité.',
        'protection-sociale': 'J\'ouvre la protection sociale.',
      }
      return {
        type: 'navigation',
        confidence: 0.85,
        targetRoute: route,
        rawTranscript: transcript,
        responseText: navPhrases[route] || `J'ouvre ${keyword}.`
      }
    }
  }
  
  // Check consultation
  for (const kw of CONSULTATION_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        type: 'consultation',
        confidence: 0.85,
        rawTranscript: transcript,
        responseText: 'Consultation en cours...'
      }
    }
  }
  
  // Check restock
  for (const kw of RESTOCK_KEYWORDS) {
    if (lower.includes(kw)) {
      const product = extractProduct(lower)
      const qty = extractQuantity(lower)
      if (product || qty) {
        return {
          type: 'restock',
          confidence: 0.85,
          product: product || undefined,
          quantity: qty || undefined,
          rawTranscript: transcript,
          responseText: product
            ? `Stock reçu : ${qty || 'nouveau stock'} ${product}, c'est bien ça ?`
            : 'Stock reçu, c\'est bien ça ?'
        }
      }
    }
  }
  
  // Check expense
  for (const kw of EXPENSE_KEYWORDS) {
    if (lower.includes(kw)) {
      const amount = extractAmount(lower)
      const product = extractProduct(lower)
      let category = 'autre'
      for (const cat of EXPENSE_CATEGORIES) {
        if (lower.includes(cat)) { category = cat; break }
      }
      if (amount) {
        return {
          type: 'expense',
          confidence: 0.85,
          amount,
          product: product || undefined,
          category,
          rawTranscript: transcript,
          responseText: product
            ? `Dépense de ${formatFCFA(amount)} pour ${product}, c'est bien ça ?`
            : `Dépense de ${formatFCFA(amount)}, c'est bien ça ?`
        }
      }
    }
  }
  
  // Check for sale (default intent when amount + product found)
  const product = extractProduct(lower)
  let amount = extractAmount(lower)
  let quantity = extractQuantity(lower)

  // "J'ai vendu X à Y francs" format (VOCAL-603 — deux lectures) :
  //  • « à Y francs / Y FCFA / Yf » → le TOTAL est explicité, il fait foi
  //    (« vendu 5 kilos de tomates à 2000 francs » = 2000) ;
  //  • « à Y » NU → prix UNITAIRE : total = quantité × prix unitaire
  //    (« j'ai vendu 3 tomates à 500 » = 1500, pas 500 — l'extracteur de
  //    montant prenait le dernier nombre comme total). La quantité vient
  //    du X de « X à Y » quand aucun mot d'unité (« sacs », « kilos »…)
  //    n'a été reconnu devant.
  const atPriceMatch = lower.match(/(\d+)\s*(?:[\w'-]+\s+){0,2}?à\s*(\d+)\s*(francs?|fcfa|f)?\b/i)
  let unitPrice: number | undefined
  if (atPriceMatch) {
    unitPrice = parseInt(atPriceMatch[2])
    const atQty = parseInt(atPriceMatch[1])
    if (!atPriceMatch[3] && unitPrice > 0 && atQty > 0 && atQty <= 999) {
      amount = atQty * unitPrice
      if (!quantity) quantity = atQty
    }
  }
  
  if (amount && amount > 0 && product) {
    const saleAmount = amount
    const displayProduct = product
    // VOCAL-612 — confirmation principale PARLÉE : « Je vais enregistrer la
    // vente de 5 kilos de tomates pour 2 000 francs. Dites oui pour
    // confirmer ou non pour annuler. » L'unité naturelle vient du transcript
    // (extractQuantityWithUnit) ; le parenthésé technique « (2 unités à
    // 1 000 F) » disparaît (illisible à l'oral). Garde : une quantité égale
    // au montant (« tomates 5000f ») n'est PAS une quantité de marchandise.
    // CONFIRM_ASK est intégrée : cette phrase n'est prononcée que lorsque
    // la confirmation est demandée (shouldConfirm dans voice-modal).
    const qtyUnit = extractQuantityWithUnit(lower)
    const qtyPart = qtyUnit && qtyUnit.quantity !== saleAmount
      ? qtyUnit.unit
        ? `${formatQuantity(qtyUnit.quantity)} ${unitLabel(qtyUnit.unit, qtyUnit.quantity)} de `
        : `${formatQuantity(qtyUnit.quantity)} `
      : ''
    return {
      type: 'sale',
      confidence: 0.85,
      product: product || undefined,
      amount: saleAmount,
      quantity: quantity || undefined,
      unitPrice,
      rawTranscript: transcript,
      responseText: `Je vais enregistrer la vente de ${qtyPart}${displayProduct} pour ${formatMontantParle(saleAmount)} francs. ${CONFIRM_ASK}`
    }
  }

  // Product without amount: ask for price
  if (product && !amount) {
    return {
      type: 'unknown',
      confidence: 0.5,
      product,
      rawTranscript: transcript,
      responseText: `Combien pour ${product} ?`
    }
  }
  
  // Unknown intent
  return {
    type: 'unknown',
    confidence: 0.3,
    rawTranscript: transcript,
    responseText: 'Je n\'ai pas bien compris. Pouvez-vous répéter ?'
  }
}
