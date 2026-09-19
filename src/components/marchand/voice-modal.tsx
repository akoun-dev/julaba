'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore, lastCancellableSale } from '@/lib/stores/caisse-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { parseIntent, buildClarifyingIntent, formatFCFA, TATA_GOODBYE, extractQuantityWithUnit, type ParsedIntent } from '@/lib/voice/localIntent'
import {
  formatSaleConfirmation,
  buildDayTotalText,
  formatStockRefusal,
  formatStockCheckReply,
  formatLossConfirmation,
  formatAdjustConfirmation,
  formatProductionConfirmation,
  formatPurchaseConfirmation,
  formatAskQuantity,
  formatStockWarning,
  formatMarginReply,
  CONFIRM_ASK,
} from '@/lib/voice/tata-phrases'
import { useCreditsStore, newPartnerClientId } from '@/lib/market-mode/credits-store'
import {
  annuleVenteConfirmPhrase,
  annuleVenteProduitLabel,
  saleAlreadyCancelledPhrase,
  saleReversedPhrase,
  saleToCancelNotFoundPhrase,
  voiceReversalDeclinedPhrase,
} from '@/lib/market-mode/reversal-phrases'
import {
  creditRecordedPhrase,
  repaymentExceedsDebtPhrase,
  repaymentRecordedPhrase,
} from '@/lib/market-mode/credit-phrases'
import { resolveSpokenQuantity, stockOperationClientId, buildStockPurchasePayload } from '@/lib/voice/voice-stock'
import { formatStockDisplay, getBaseUnit } from '@/lib/stock/units'
import { classifyIntentFallback, isConfidentGuess } from '@/lib/voice/nlu-ml'
import { tataStop, playBeep, haptic } from '@/lib/voice/tata-tts'
// B5-051 — chaîne baoulé via la FAÇADE unifiée BaouleVoiceEngine :
// speakBaoule (traduit fra→bci en session baoulé, repli français explicite),
// prepareBaouleParserInput (traduction bci→fr obligatoire — garde B2-022,
// jamais de baoulé brut au parseur français), fetchJsonWithTimeout (borne
// réseau conversation).
import { canAttemptSTT, describeSTTError, createSmartSingleShotSTT, type STTSession } from '@/lib/voice/stt-factory'
import { VoiceLanguageSelector } from '@/components/voice/language-selector'
import { VoiceListeningIndicator } from '@/components/shared/voice-listening-indicator'
import { pauseWakeWord, resumeWakeWord } from '@/lib/voice/wake-word'
import { queuePendingSync } from '@/lib/offline-db'
import { completeQuickSale, planQuickSale } from '@/lib/quick-sale'
import { useSellingPointsStore } from '@/lib/market-mode/selling-points-store'
import { findCatalogEntry, catalogSummaryText } from '@/lib/supplier-catalog'
import { cn } from '@/lib/utils'
import { classifyNavigation } from '@/lib/ai/gemma-model'
import { isNavigationCandidate, NAVIGATION_CONFIDENCE_THRESHOLD } from '@/lib/ai/navigation-intent'
import { speakBaoule, prepareBaouleParserInput, describeBaouleEngineError, fetchJsonWithTimeout } from '@/lib/voice/baoule-engine'
import { parseConfirmation } from '@/lib/voice/confirmations'

/** Display state for the result feedback */
type FeedbackState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'processing'; text: string }
  | { kind: 'confirm'; intent: ParsedIntent; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

export function VoiceModal() {
  const { showVoiceModal, closeVoiceModal, navigate, goBack, soleilMode, voiceAutoRecord, setVoiceAutoRecord, voiceStopRequested, requestVoiceStop, voiceConfirmation } = useAppStore()
  const [sttAvailable] = useState(() => typeof window !== 'undefined' && canAttemptSTT())
  const sttSessionRef = useRef<STTSession | null>(null)
  const feedbackRef = useRef<FeedbackState>({ kind: 'idle' })
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When bottom bar releases before startListening could run, remember to skip start
  const pendingStopRef = useRef(false)
  // Pressing the mic again to answer "oui"/"non" flips feedbackRef to
  // 'listening' the instant it's pressed — well before any transcript comes
  // back — so by the time processTranscript runs, feedbackRef.current.kind
  // is never still 'confirm'. This ref snapshots which intent is awaiting
  // confirmation independently of that state churn.
  const pendingConfirmRef = useRef<ParsedIntent | null>(null)
  // §12 — montant dicté sans quantité (« vendu des tomates 2000 ») :
  // on mémorise l'intent, Tata demande la quantité et la prochaine prise
  // de parole est fusionnée dans l'intent avant exécution.
  const pendingQuantityRef = useRef<ParsedIntent | null>(null)
  // VOCAL-612 — relance automatique de l'écoute après les questions de Tata
  // (confirmation, quantité) : startListening est déclaré PLUS BAS dans le
  // composant — une référence directe créerait un cycle de déclarations
  // (react-hooks/immutability, cf. BUG-001 vente-rapide-modal) →
  // indirection par ref, synchronisée par effet après la déclaration
  // (fusion commit externe 1c2941d).
  const startListeningRef = useRef<() => Promise<void>>(async () => {})
  // Garde anti-boucle (scénario CTO n°4) : chaque reformulation d'une
  // réponse incompte incrémente ; au-delà de 2, Tata abandonne et propose
  // le clavier. Remis à 0 à chaque NOUVELLE question posée.
  const confirmRetryRef = useRef(0)

  // Reactive copy for rendering
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: 'idle' })
  const set = useCallback((s: FeedbackState) => {
    feedbackRef.current = s
    setFeedback(s)
  }, [])

  // Pause/resume wake word.
  // Cleanup : ne reprendre le wake word QUE si la modale ÉTAIT ouverte —
  // ce cleanup s'exécute AUSSI à l'OUVERTURE (transition false→true) et un
  // resume inconditionnel y créait un start de fond concurrençant la pause
  // (audit mot de réveil F1 ; même motif que vente-rapide-modal VOCAL-604).
  useEffect(() => {
    if (showVoiceModal) pauseWakeWord()
    else resumeWakeWord()
    return () => { if (showVoiceModal) resumeWakeWord() }
  }, [showVoiceModal])

  // Cleanup STT on unmount
  useEffect(() => {
    return () => { sttSessionRef.current?.abort() }
  }, [])

  const scheduleAutoClose = useCallback((delay = 2000) => {
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
    autoCloseTimer.current = setTimeout(() => {
      sttSessionRef.current?.abort()
      closeVoiceModal()
    }, delay)
  }, [closeVoiceModal])

  const executeIntent = useCallback(async (intent: ParsedIntent) => {
    playBeep('success')
    haptic('success')

    if (intent.type === 'sale' && intent.amount && intent.product) {
      const product = useStockStore.getState().getProductByName(intent.product)
      // §12 — montant dicté SANS quantité sur un produit suivi : Tata
      // demande la quantité au lieu d'enregistrer 1 en silence. La
      // prochaine prise de parole (réponse) fusionne dans l'intent.
      if (!intent.quantity && product) {
        const baseUnit = getBaseUnit(useStockStore.getState().getUnitConfig(product.id))
        // VOCAL-612 — la réf est posée AVANT de parler : la prochaine prise
        // de parole est forcément interprétée comme une quantité.
        pendingQuantityRef.current = intent
        confirmRetryRef.current = 0
        const askText = formatAskQuantity({ product: product.name, unit: baseUnit?.unitCode })
        set({ kind: 'confirm', intent, text: askText })
        // Relance automatique (défaut CTO) : Tata parle puis RÉOUVRE le
        // micro — le marchand n'a plus à ré-appuyer sur le bouton.
        void speakBaoule(askText, () => {
          requestAnimationFrame(() => { void startListeningRef.current() })
        })
        return
      }
      // Audit VOCAL-603 : le montant DICTÉ fait loi (planQuickSale) — le
      // priceUnit du stock n'écrase plus jamais le total parlé par le
      // marchand (« tomates 2000 » s'enregistre pour 2000, pas au prix
      // catalogue).
      const plan = planQuickSale(intent, product)!
      // MODE-908 (§18) — le point actif suit la vente vocale (passé par
      // arguments, sens unique : ce modal n'écrit jamais dans le store).
      const sellingPoint = useSellingPointsStore.getState().activePoint()
      const result = await completeQuickSale({
        name: plan.name,
        quantity: plan.quantity,
        unitPrice: plan.unitPrice,
        total: plan.total,
        productId: plan.productId,
      }, {
        sellingPointClientId: sellingPoint.clientId,
        sellingPointName: sellingPoint.name,
      })
      if (!result.ok) {
        // STK-805 — refus strict stock insuffisant : Tata dit la vérité
        // du stock avec la phrase imposée (§18), elle ne dit JAMAIS
        // « enregistrée » pour une vente refusée.
        const failureText = result.refusal
          ? formatStockRefusal({
              product: result.refusal.product ?? plan.name,
              available: result.refusal.available,
              requested: result.refusal.requested,
              unit: result.refusal.unit,
            })
          : 'Vente non enregistrée. Réessayez.'
        void speakBaoule(failureText)
        set({ kind: 'error', text: failureText })
        scheduleAutoClose(result.refusal ? 6000 : 3000)
        return
      }
      // Confirmation contextuelle (VOCAL-607) : produit, quantité, montant
      // réel — AUCUNE formule de fin, la conversation reste ouverte.
      const confirmText = formatSaleConfirmation({
        name: plan.name,
        quantity: plan.quantity,
        total: plan.total,
        synced: result.synced,
      })
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    } else if (intent.type === 'sale' && intent.amount) {
      // MODE-908 (§18) — même étiquette du point actif sur la vente sans
      // produit reconnu.
      const sellingPoint = useSellingPointsStore.getState().activePoint()
      const result = await completeQuickSale({
        name: intent.product || 'Article',
        quantity: intent.quantity || 1,
        unitPrice: intent.amount,
      }, {
        sellingPointClientId: sellingPoint.clientId,
        sellingPointName: sellingPoint.name,
      })
      if (!result.ok) {
        // STK-805 — refus strict stock insuffisant : Tata dit la vérité
        // du stock et propose implicitement la correction (§18), elle ne
        // dit JAMAIS « enregistrée » pour une vente refusée.
        const failureText = result.refusal
          ? formatStockRefusal({
              product: result.refusal.product ?? intent.product,
              available: result.refusal.available,
              requested: result.refusal.requested,
              unit: result.refusal.unit,
            })
          : 'Vente non enregistrée. Réessayez.'
        void speakBaoule(failureText)
        set({ kind: 'error', text: failureText })
        scheduleAutoClose(result.refusal ? 6000 : 3000)
        return
      }
      const confirmText = formatSaleConfirmation({
        name: intent.product,
        quantity: intent.quantity || 1,
        total: (intent.quantity || 1) * intent.amount,
        synced: result.synced,
      })
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    } else if (intent.type === 'expense' && intent.amount) {
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId) {
        void speakBaoule('Compte non identifié.')
        set({ kind: 'error', text: 'Compte non identifié.' })
        scheduleAutoClose(3000)
        return
      }
      const category = intent.category || 'autre'
      const description = intent.product || intent.rawTranscript
      const expensePayload = {
        merchantId,
        clientId: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount: intent.amount,
        category,
        description,
        isVoice: true,
        voiceTranscript: intent.rawTranscript,
      }
      try {
        // B4-041 — borne de temps : un serveur injoignable ne doit jamais
        // laisser la conversation pendre ; l'échec explicite bascule sur
        // la file offline ci-dessous.
        const res = await fetchJsonWithTimeout('/api/marchand/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expensePayload),
        })
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      } catch {
        const queued = await queuePendingSync('expense', expensePayload)
        if (!queued.ok) {
          // Neither the live request nor the offline queue worked — the
          // expense genuinely was not recorded. Say so instead of the usual
          // success line.
          void speakBaoule('Dépense non enregistrée. Réessayez.')
          set({ kind: 'error', text: 'Dépense non enregistrée.' })
          scheduleAutoClose(3000)
          return
        }
      }
      useCaisseStore.getState().addTodayExpense(intent.amount)
      void speakBaoule('Dépense enregistrée !')
      set({ kind: 'success', text: 'Dépense enregistrée !' })
      scheduleAutoClose(2500)
    } else if (intent.type === 'stock_loss' || intent.type === 'stock_adjust' || intent.type === 'stock_production') {
      // STK-807/809 — perte (LOSS), ajustement (ADJUSTMENT_IN/OUT) et
      // production (PRODUCTION) dictés : RPC transactionnelle + delta
      // local post-verdict. Le serveur est la vérité : stock insuffisant
      // → refus parlé.
      const merchantId = useAppStore.getState().merchantId
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!merchantId || !product) {
        void speakBaoule(intent.product ? 'Produit introuvable dans le stock.' : 'Sur quel produit ?')
        set({ kind: 'error', text: 'Produit introuvable.' })
        scheduleAutoClose(3000)
        return
      }
      const resolved = resolveSpokenQuantity(intent.quantity, intent.unit, useStockStore.getState().getUnitConfig(product.id))
      if (!resolved.ok) {
        const msg = resolved.reason === 'INVALID_UNIT'
          ? `Je ne connais pas la taille d'un ${resolved.unitCode} pour ${product.name}. Configure ses unités dans MES PRODUITS.`
          : 'Je n\'ai pas compris la quantité. Répète.'
        void speakBaoule(msg)
        set({ kind: 'error', text: msg })
        scheduleAutoClose(6000)
        return
      }
      const isLoss = intent.type === 'stock_loss'
      const isProduction = intent.type === 'stock_production'
      const isOut = isLoss || (!isProduction && intent.rawTranscript.match(/enl[eè]v|retir/i))
      const movementPayload = {
        merchantId,
        productId: product.id,
        movementType: isLoss ? 'LOSS' : isProduction ? 'PRODUCTION' : isOut ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
        quantityBase: resolved.quantityBase,
        unitCode: resolved.unitCode || undefined,
        reason: isLoss ? 'PERTE_VOCALE' : isProduction ? 'PRODUCTION_VOCALE' : 'AJUSTEMENT_VOCALE',
        // STK-808 — id local lisible : la route le convertit en UUID
        // déterministe, le rejeu offline ne duplique jamais l'opération.
        clientId: stockOperationClientId(isLoss ? 'perte' : isProduction ? 'production' : 'ajustement'),
      }
      try {
        const res = await fetchJsonWithTimeout('/api/marchand/stock/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(movementPayload),
        })
        if (res.status === 422) {
          // Stock insuffisant / stock inconnu : refus parlé honnête.
          const body = await res.json().catch(() => ({}))
          void speakBaoule(body.erreur ?? 'Opération refusée par le serveur.')
          set({ kind: 'error', text: body.erreur ?? 'Opération refusée.' })
          scheduleAutoClose(6000)
          return
        }
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      } catch {
        // STK-808 — serveur injoignable : la file offline porte l'opération
        // (idempotence sur clientId), Tata dit la vérité, ne ment pas.
        const queued = await queuePendingSync('stock-movement', movementPayload)
        if (!queued.ok) {
          void speakBaoule('Serveur injoignable, rien n\'est enregistré. Réessayez.')
          set({ kind: 'error', text: 'Serveur injoignable.' })
          scheduleAutoClose(3000)
          return
        }
        const pendingText = `${isLoss ? 'Perte' : isProduction ? 'Production' : 'Ajustement'} noté, en attente de synchronisation.`
        void speakBaoule(pendingText)
        set({ kind: 'success', text: pendingText })
        scheduleAutoClose(4000)
        return
      }
      // Delta local post-verdict (D3) : la projection UI suit le verdict.
      useStockStore.getState().adjustLocalStock(product.id, isOut ? -resolved.quantityBase : resolved.quantityBase)
      const confirmText = isLoss
        ? formatLossConfirmation({ product: product.name, quantityBase: resolved.quantityBase, unit: resolved.unitCode })
        : isProduction
          ? formatProductionConfirmation({ product: product.name, quantityBase: resolved.quantityBase, unit: resolved.unitCode })
          : formatAdjustConfirmation({
              product: product.name,
              deltaBase: isOut ? -resolved.quantityBase : resolved.quantityBase,
              unit: resolved.unitCode,
            })
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    } else if (intent.type === 'stock_check') {
      // STK-807 §38 — « il reste combien de tomates ? » : balance réelle
      // du serveur + affichage converti (config §8), jamais d'invention.
      const merchantId = useAppStore.getState().merchantId
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!product) {
        void speakBaoule('Ce produit n\'est pas dans votre stock.')
        set({ kind: 'error', text: 'Produit introuvable.' })
        scheduleAutoClose(3000)
        return
      }
      const unitConfig = useStockStore.getState().getUnitConfig(product.id)
      const baseUnit = getBaseUnit(unitConfig)
      let quantityBase: number | null = null
      try {
        const res = await fetchJsonWithTimeout(
          `/api/marchand/stock/balance?merchantId=${merchantId}&productId=${product.id}`,
          { method: 'GET' },
        )
        if (res.ok) {
          const data = await res.json()
          const balance = (data.balances ?? []).find(
            (b: { productId: string }) => b.productId === product.id,
          )
          if (balance) quantityBase = balance.quantityBase as number
        }
      } catch {
        // Réseau mort : la projection locale reste honnête (dernier delta).
        quantityBase = product.stockQty
      }
      const displayConverted =
        quantityBase !== null && unitConfig
          ? formatStockDisplay(quantityBase, unitConfig, baseUnit?.unitCode).replace(/\+/g, 'et')
          : undefined
      const checkText = formatStockCheckReply({
        product: product.name,
        quantityBase,
        unit: baseUnit?.unitCode,
        displayConverted: displayConverted !== formatStockDisplay(quantityBase ?? 0, null) ? displayConverted : undefined,
      })
      void speakBaoule(checkText)
      set({ kind: 'success', text: checkText })
      scheduleAutoClose(6000)
    } else if (intent.type === 'margin_check') {
      // STK-810 — « marge du riz ? » : coût moyen pondéré (achats réels)
      // vs prix de vente enregistré — coût inconnu = « je ne sais pas »,
      // perte dite telle quelle.
      const merchantId = useAppStore.getState().merchantId
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!product) {
        void speakBaoule('Ce produit n\'est pas dans votre stock.')
        set({ kind: 'error', text: 'Produit introuvable.' })
        scheduleAutoClose(3000)
        return
      }
      const baseUnit = getBaseUnit(useStockStore.getState().getUnitConfig(product.id))
      let margin: { marginCfa: number; marginPct: number; isLoss: boolean } | null = null
      try {
        const res = await fetchJsonWithTimeout(
          `/api/marchand/stock/marge?merchantId=${merchantId}&productId=${product.id}`,
          { method: 'GET' },
        )
        if (res.ok) {
          const data = await res.json()
          margin = (data.margin as typeof margin) ?? null
        }
      } catch {
        // Réseau mort : margin reste null → la réponse honnête « je ne
        // sais pas » plutôt qu'un chiffre inventé.
      }
      const marginText = formatMarginReply({ product: product.name, margin, unit: baseUnit?.unitCode })
      void speakBaoule(marginText)
      set({ kind: 'success', text: marginText })
      scheduleAutoClose(6000)
    } else if (intent.type === 'purchase' || intent.type === 'restock') {
      // STK-807 §10 + BUG-002 — achat dicté (« j'ai acheté… ») ET réappro
      // reçu (« reçu / réappro / livré ») suivent le MÊME chemin serveur-
      // vérité : RPC merchant_record_purchase (mouvement PURCHASE + coût
      // moyen pondéré), clientId idempotent local (rejeu offline = un seul
      // achat). L'ancien handler restock calculait un PATCH absolu côté
      // client (updateProduct stockQty + X) — SUPPRIMÉ : aucune valeur
      // absolue calculée client (D3/STK-805/811), et la quantité absente
      // n'est plus remplacée par un « || 1 » silencieux.
      const merchantId = useAppStore.getState().merchantId
      const product = intent.product ? useStockStore.getState().getProductByName(intent.product) : undefined
      if (!merchantId || !product) {
        void speakBaoule(intent.product ? 'Produit introuvable dans le stock.' : intent.type === 'restock' ? 'Sur quel produit ?' : 'Quel achat ?')
        set({ kind: 'error', text: 'Produit introuvable.' })
        scheduleAutoClose(3000)
        return
      }
      const resolved = resolveSpokenQuantity(intent.quantity, intent.unit, useStockStore.getState().getUnitConfig(product.id))
      if (!resolved.ok) {
        const msg = resolved.reason === 'INVALID_UNIT'
          ? `Je ne connais pas la taille d'un ${resolved.unitCode} pour ${product.name}. Configure ses unités dans MES PRODUITS.`
          : 'Je n\'ai pas compris la quantité. Répète.'
        void speakBaoule(msg)
        set({ kind: 'error', text: msg })
        scheduleAutoClose(6000)
        return
      }
      // MODE-907 (§15) — fournisseur dicté « chez X » : le partenaire est
      // créé/récupéré LOCALEMENT (credits-store, kind 'fournisseur') AVANT
      // la construction de l'achat — la file FIFO part donc
      // 'merchant-partner' AVANT 'stock-purchase' et le rejeu offline crée
      // le fournisseur avant l'achat qui le référence. Le payload porte
      // supplierClientId (+ supplierName, filet de sécurité serveur).
      let supplierClientId: string | undefined
      const supplierName = intent.supplier?.trim()
      if (supplierName && supplierName.length >= 2) {
        const credits = useCreditsStore.getState()
        const known = credits.partnerByName(supplierName)
        const partner = credits.upsertPartner({
          clientId: known?.clientId ?? newPartnerClientId(),
          name: supplierName,
          kind: 'fournisseur',
        })
        supplierClientId = partner.clientId
      }
      // BUG-002 — contrat unique achat/réappro (builder pur testé) : RPC
      // '/api/marchand/purchases' + file offline 'stock-purchase'.
      const purchaseContract = buildStockPurchasePayload({
        merchantId,
        productId: product.id,
        productName: product.name,
        intent,
        quantityBase: resolved.quantityBase,
        supplierClientId,
      })
      const purchasePayload = purchaseContract.payload
      let synced = true
      try {
        const res = await fetchJsonWithTimeout(purchaseContract.apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(purchasePayload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          void speakBaoule(body.erreur ?? 'Achat refusé par le serveur.')
          set({ kind: 'error', text: body.erreur ?? 'Achat refusé.' })
          scheduleAutoClose(6000)
          return
        }
      } catch {
        // STK-808 — hors ligne : l'achat part en file (idempotent sur
        // clientId), le delta local reste affiché comme acheté.
        const queued = await queuePendingSync(purchaseContract.offlineEntity, purchasePayload)
        if (!queued.ok) {
          void speakBaoule('Achat non enregistré. Réessayez.')
          set({ kind: 'error', text: 'Achat non enregistré.' })
          scheduleAutoClose(3000)
          return
        }
        synced = false
      }
      // Delta local post-verdict : l'achat augmente le stock (§10).
      if (synced) {
        useStockStore.getState().adjustLocalStock(product.id, resolved.quantityBase)
      }
      const confirmText = formatPurchaseConfirmation({
        product: product.name,
        quantityBase: resolved.quantityBase,
        unit: resolved.unitCode,
        total: intent.amount,
        synced,
        supplier: supplierName,
      })
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    } else if (intent.type === 'order') {
      // Commande fournisseur à la voix — même contrat que l'écran Marché :
      // total et prix viennent du catalogue partagé (jamais du client),
      // création queue-safe offline (rejeu idempotent sur clientId).
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId) {
        void speakBaoule('Compte non identifié.')
        set({ kind: 'error', text: 'Compte non identifié.' })
        scheduleAutoClose(3000)
        return
      }
      // Re-résolution depuis le transcript : le prix unitaire officiel ne
      // peut pas venir d'un intent reconstruit, uniquement du catalogue.
      const catalogEntry = findCatalogEntry(intent.rawTranscript)
      if (!catalogEntry) {
        const msg = `Je ne trouve pas ce produit au marché. Produits disponibles : ${catalogSummaryText()}.`
        void speakBaoule(msg)
        set({ kind: 'error', text: 'Produit indisponible au marché.' })
        scheduleAutoClose(4500)
        return
      }
      const orderPayload = {
        merchantId,
        supplier: catalogEntry.supplier,
        productName: catalogEntry.name,
        quantity: intent.quantity || 1,
        unitPrice: catalogEntry.price,
        note: 'Commande vocale Tata',
        clientId: `sorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
      let queuedInstead = false
      try {
        const res = await fetchJsonWithTimeout('/api/marchand/supplier-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        })
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
      } catch {
        // Hors ligne : pure création (aucun solde, aucun état serveur à
        // dériver) — même règle que le bouton « Commander » de l'écran Marché.
        const queued = await queuePendingSync('supplier-order', orderPayload)
        if (!queued.ok) {
          void speakBaoule('Commande non enregistrée. Réessayez.')
          set({ kind: 'error', text: 'Commande non enregistrée.' })
          scheduleAutoClose(3000)
          return
        }
        queuedInstead = true
      }
      const total = orderPayload.quantity * catalogEntry.price
      const successText = queuedInstead
        ? 'Commande en attente de synchronisation.'
        : `Commande envoyée chez ${catalogEntry.supplier}. Total ${formatFCFA(total)}.`
      void speakBaoule(
        queuedInstead
          ? `Commande de ${catalogEntry.name} enregistrée, en attente de synchronisation.`
          : `Commande envoyée chez ${catalogEntry.supplier}. Total ${formatFCFA(total)}.`,
      )
      set({ kind: 'success', text: successText })
      scheduleAutoClose(3000)
    } else if (intent.type === 'credit_doit' || intent.type === 'credit_paye') {
      // MODE-906 (§21-22) — dette dictée ou remboursement dicté, APRES
      // confirmation orale (l'écriture au grand livre est sensible). Le
      // journal local est muté PUIS l'op part en file ('credit-op') —
      // offline-first, jamais de réseau bloquant ici.
      const merchantId = useAppStore.getState().merchantId
      if (!merchantId || !intent.client || !intent.amount) {
        void speakBaoule('Compte non identifié.')
        set({ kind: 'error', text: 'Compte non identifié.' })
        scheduleAutoClose(3000)
        return
      }
      const isDebt = intent.type === 'credit_doit'
      const credits = useCreditsStore.getState()
      const result = isDebt
        ? credits.recordCredit({
            partnerName: intent.client,
            amountCfa: intent.amount,
            note: 'Crédit dicté à Tata',
          })
        : credits.recordRepayment({
            partnerName: intent.client,
            amountCfa: intent.amount,
            note: 'Paiement dicté à Tata',
          })
      if (!result.ok) {
        // Refus honnête (§27) : « X ne te doit que Y francs. Je ne peux
        // pas noter un paiement de Z. »
        const failureText = 'refusal' in result
          ? repaymentExceedsDebtPhrase(intent.client, result.refusal.balanceCfa, intent.amount)
          : 'Je n\'ai pas pu noter. Réessaie.'
        void speakBaoule(failureText)
        set({ kind: 'error', text: failureText })
        scheduleAutoClose(6000)
        return
      }
      const confirmText = isDebt
        ? creditRecordedPhrase(result.partner.name, result.op.amountCfa, result.partner.balanceCfa)
        : repaymentRecordedPhrase(
            result.partner.name,
            result.op.balanceAfterCfa + result.op.amountCfa,
            result.partner.balanceCfa,
          )
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    } else if (intent.type === 'annule_vente') {
      // MODE-909 (§28) — « oui » reçu : la dernière vente locale NON
      // annulée est annulée (raison fixe — l'oral ne dicte pas de raison).
      // Le journal local est MARQUÉ (append-only), l'opération inverse part
      // en file ('sale-reversal', après la vente — FIFO) et le stock local
      // revient en DELTA. JAMAIS une suppression : l'historique reste.
      const last = lastCancellableSale(useCaisseStore.getState().todaySalesJournal)
      if (!last) {
        const notFoundText = saleToCancelNotFoundPhrase()
        void speakBaoule(notFoundText)
        set({ kind: 'error', text: notFoundText })
        scheduleAutoClose(4000)
        return
      }
      const result = useCaisseStore.getState().reverseSale(last.saleClientId, 'Annulée à la voix')
      if (!result.ok) {
        // Refus honnête : déjà annulée (une vente ne s'annule qu'UNE fois),
        // ou autre refus du store (raison, vente introuvable) — dit tel quel.
        const refusalText = /déjà annulée/i.test(result.error)
          ? saleAlreadyCancelledPhrase()
          : result.error
        void speakBaoule(refusalText)
        set({ kind: 'error', text: refusalText })
        scheduleAutoClose(5000)
        return
      }
      const confirmText = saleReversedPhrase()
      void speakBaoule(confirmText)
      set({ kind: 'success', text: confirmText })
      scheduleAutoClose(4000)
    }
  }, [set, scheduleAutoClose])

  const processTranscript = useCallback((text: string) => {
    // VOCAL-612 — sait-on ATTENDAIT une confirmation/quantité avant de
    // consommer les refs : si la réponse re-parsée finit « unknown »,
    // Tata reformule sa question et rouvre le micro (max 2 fois).
    const wasAwaitingConfirm = pendingConfirmRef.current != null
    const wasAwaitingQuantity = pendingQuantityRef.current != null
    // If awaiting confirmation \u2014 checked via pendingConfirmRef, not
    // feedbackRef.current.kind \u2014 pressing the mic to answer already moved
    // that to 'listening' before this runs.
    if (pendingConfirmRef.current) {
      const pending = pendingConfirmRef.current
      pendingConfirmRef.current = null
      // B4-041 — confirmations bilingues fr + bci (ɛhɛ = oui, ao = non,
      // liste pilote) : null = hors vocabulaire → ré-analysée comme
      // nouvelle commande (comportement historique conservé).
      const confirmed = parseConfirmation(text)
      if (confirmed === 'yes') {
        executeIntent(pending)
        return
      }
      if (confirmed === 'no') {
        // VOCAL-612 — refus honnête par type : le pending peut être une
        // vente (le plus souvent), un crédit (MODE-906), une annulation
        // (MODE-909) ou autre chose (dépense, réappro…).
        const cancelText = pending.type === 'annule_vente'
          ? voiceReversalDeclinedPhrase()
          : pending.type === 'credit_doit' || pending.type === 'credit_paye'
            ? "Je n'ai rien noté."
            : pending.type === 'sale'
              ? "D'accord, la vente n'est pas enregistrée."
              : "D'accord, rien n'est enregistré."
        void speakBaoule(cancelText)
        set({ kind: 'error', text: cancelText })
        scheduleAutoClose(2000)
        return
      }
    }

    // §12 — Tata attend une quantité (« deux kilos », « 1,5 kilo ») :
    // la réponse est fusionnée dans l'intent en attente puis exécutée.
    // Une réponse hors-quantité (« annule », autre commande) retombe sur
    // le parseur normal — la vente se perd proprement.
    if (pendingQuantityRef.current) {
      const pending = pendingQuantityRef.current
      pendingQuantityRef.current = null
      const confirmed = parseConfirmation(text)
      if (confirmed === 'no') {
        // §12 — le pending quantité est TOUJOURS une vente.
        const cancelText = "D'accord, la vente n'est pas enregistrée."
        void speakBaoule(cancelText)
        set({ kind: 'error', text: cancelText })
        scheduleAutoClose(2000)
        return
      }
      const qtyAnswer = extractQuantityWithUnit(text)
      if (qtyAnswer) {
        executeIntent({
          ...pending,
          quantity: qtyAnswer.quantity,
          unit: qtyAnswer.unit ?? pending.unit,
        })
        return
      }
    }

    set({ kind: 'processing', text })

    setTimeout(async () => {
      // Business intent always remains local. Gemma only receives clear screen
      // or consultation requests, and failure is intentionally silent.
      let intent = parseIntent(text)

      if (isNavigationCandidate(text)) {
        set({ kind: 'processing', text })
        const navigation = await classifyNavigation(text)
        if (
          navigation.intent === 'navigation' &&
          navigation.targetRoute &&
          navigation.confidence >= NAVIGATION_CONFIDENCE_THRESHOLD
        ) {
          const responseText = `J'ouvre ${navigation.targetRoute === 'keiwa' ? 'votre portefeuille' : `votre écran ${navigation.targetRoute}`}.`
          void speakBaoule(responseText, () => {
            closeVoiceModal()
            navigate(navigation.targetRoute!)
          })
          haptic('success')
          set({ kind: 'success', text: responseText })
          return
        }
      }

      // Regex parser found nothing at all: try the on-device ML classifier
      // (niveau 2 NLU) to at least steer the user with a targeted follow-up
      // instead of a flat "je n'ai pas compris". Best-effort — any failure
      // (offline, model not cached, WASM unsupported) leaves `intent` as-is.
      if (intent.type === 'unknown' && intent.confidence < 0.6) {
        const guess = await classifyIntentFallback(text)
        if (guess && isConfidentGuess(guess)) {
          intent = buildClarifyingIntent(guess.type, text, guess.confidence)
        }
      }

      if (intent.type === 'navigation' && intent.targetRoute) {
        void speakBaoule(intent.responseText, () => {
          closeVoiceModal()
          navigate(intent.targetRoute! as ReturnType<typeof useAppStore.getState>['currentScreen'])
        })
        set({ kind: 'success', text: intent.responseText })
        return
      }

      if (intent.type === 'back') {
        void speakBaoule(intent.responseText, () => {
          closeVoiceModal()
          goBack()
        })
        set({ kind: 'success', text: intent.responseText })
        return
      }

      // Fin de conversation explicite (VOCAL-607) : « c'est tout », « j'ai
      // fini », « au revoir », « plus rien »… → goodbye puis fermeture (le
      // mot de réveil reprend à la fermeture de la modale).
      if (intent.type === 'end') {
        void speakBaoule(TATA_GOODBYE)
        set({ kind: 'success', text: TATA_GOODBYE })
        scheduleAutoClose(2500)
        return
      }

      // Consultation : vrai total du jour (agrégats caisse) au lieu du
      // mensonger « Consultation en cours... » — information utile, sans
      // formule de fin (VOCAL-607).
      if (intent.type === 'consultation') {
        const { todaySales, todaySalesCount } = useCaisseStore.getState()
        const text = buildDayTotalText(todaySalesCount, todaySales)
        void speakBaoule(text)
        set({ kind: 'success', text })
        scheduleAutoClose(4000)
        return
      }

      if (intent.type === 'credit_block' || intent.type === 'unknown' || intent.type === 'cancel') {
        // VOCAL-612 (scénario 3) — réponse incompte ALORS QUE Tata
        // attendait une confirmation/quantité : reformule et ROUVRE le
        // micro (max 2 relances — anti-boucle, scénario 4 — ensuite le
        // clavier). Toute autre commande valide a déjà été traitée plus
        // haut (comportement historique conservé).
        if (wasAwaitingConfirm || wasAwaitingQuantity) {
          if (confirmRetryRef.current < 2) {
            confirmRetryRef.current += 1
            const isQuantity = wasAwaitingQuantity && !wasAwaitingConfirm
            const retryText = `Je n'ai pas compris. ${isQuantity ? 'Dites la quantité vendue.' : CONFIRM_ASK}`
            set({ kind: 'error', text: retryText })
            void speakBaoule(retryText, () => {
              requestAnimationFrame(() => { startListeningRef.current() })
            })
            return
          }
          const giveUpText = "Je n'ai pas compris. Utilisez le clavier."
          void speakBaoule(giveUpText)
          set({ kind: 'error', text: giveUpText })
          scheduleAutoClose(3000)
          return
        }
        void speakBaoule(intent.responseText)
        set({ kind: 'error', text: intent.responseText })
        scheduleAutoClose(3000)
        return
      }

      // MODE-906 (§21-22) — crédit à la voix : action SENSIBLE → la
      // confirmation orale est TOUJOURS demandée (indépendamment de la
      // préférence voiceConfirmation), même mécanisme pendingConfirmRef
      // que la vente. Sans montant, Tata demande combien et réouvre le
      // micro (sans ref : la phrase complète est redite).
      if (intent.type === 'credit_doit' || intent.type === 'credit_paye') {
        const hasAmount = Boolean(intent.amount) && Boolean(intent.client)
        const askText = hasAmount
          ? `${intent.responseText} Je confirme ?`
          : intent.responseText
        if (hasAmount) {
          pendingConfirmRef.current = intent
          confirmRetryRef.current = 0
        }
        set({ kind: 'confirm', intent, text: askText })
        void speakBaoule(askText, () => {
          requestAnimationFrame(() => { void startListeningRef.current() })
        })
        return
      }

      // MODE-909 (§28) — annulation de la dernière vente : action SENSIBLE
      // → confirmation orale TOUJOURS (même mécanisme pendingConfirmRef),
      // avec les infos RÉELLES de la dernière vente locale non annulée
      // (journal de caisse — montant, produit ; jamais devinés). S'il n'y
      // en a pas, Tata le dit honnêtement sans poser de confirmation.
      if (intent.type === 'annule_vente') {
        const last = lastCancellableSale(useCaisseStore.getState().todaySalesJournal)
        if (!last) {
          const notFoundText = saleToCancelNotFoundPhrase()
          void speakBaoule(notFoundText)
          set({ kind: 'error', text: notFoundText })
          scheduleAutoClose(4000)
          return
        }
        const askText = annuleVenteConfirmPhrase(last.amountCfa, annuleVenteProduitLabel(last.items))
        pendingConfirmRef.current = intent
        confirmRetryRef.current = 0
        set({ kind: 'confirm', intent, text: askText })
        void speakBaoule(askText, () => {
          requestAnimationFrame(() => { void startListeningRef.current() })
        })
        return
      }

      // Sale / expense / restock — check voiceConfirmation preference
      const shouldConfirm =
        voiceConfirmation === 'always' ||
        (voiceConfirmation === 'high-amount' && (intent.amount || 0) > 10000)

      if (shouldConfirm) {
        // VOCAL-612 — réf posée AVANT l'écoute (la réponse suivante est
        // une confirmation) ; l'instruction CONFIRM_ASK est ajoutée aux
        // intents qui ne l'ont pas déjà (la vente l'intègre dans son
        // responseText côté parseur). À la fin de la question, le micro
        // se RÉOUVRE automatiquement (requestAnimationFrame = pattern
        // vente-rapide-modal : laisse le TTS rendre la main).
        const askFull = intent.responseText.includes(CONFIRM_ASK)
          ? intent.responseText
          : `${intent.responseText} ${CONFIRM_ASK}`
        pendingConfirmRef.current = intent
        confirmRetryRef.current = 0
        set({ kind: 'confirm', intent, text: askFull })
        void speakBaoule(askFull, () => {
          requestAnimationFrame(() => { void startListeningRef.current() })
        })
      } else {
        void executeIntent(intent)
      }
    }, 300)
  }, [executeIntent, set, closeVoiceModal, navigate, scheduleAutoClose, voiceConfirmation])

  // B5-051 — lien montant via la façade : le transcript brut passe par
  // BaouleVoiceEngine AVANT le parseur. En session baoulé, la traduction
  // bci→fr est obligatoire (garde B2-022) : si elle échoue, la chaîne
  // s'arrête ici avec une erreur explicite — jamais de baoulé brut au
  // parseur français, jamais de repli silencieux.
  const handleTranscript = useCallback(async (raw: string) => {
    set({ kind: 'processing', text: raw })
    try {
      const input = await prepareBaouleParserInput(raw)
      processTranscript(input.text)
    } catch (err) {
      playBeep('error')
      const msg = describeBaouleEngineError(err)
      set({ kind: 'error', text: msg })
      void speakBaoule(msg)
      scheduleAutoClose(4000)
    }
  }, [processTranscript, set, scheduleAutoClose])

  const startListening = useCallback(async () => {
    if (feedbackRef.current.kind === 'listening' || !sttAvailable) return

    // Cancel pending auto-close
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }

    tataStop()
    set({ kind: 'listening' })
    playBeep('start')

    sttSessionRef.current = await createSmartSingleShotSTT({
      onResult: (result) => {
        playBeep('stop')
        void handleTranscript(result.transcript)
      },
      onError: (err) => {
        if (err === 'aborted') return
        if (err === 'no-speech') {
          void speakBaoule("Je n'ai rien entendu. Réessayez.")
          set({ kind: 'error', text: "Je n'ai rien entendu. Réessayez." })
        } else {
          playBeep('error')
          // Codes STT connus → message dédié ; tout autre message est déjà
          // formulé (VoiceService : micro, moteur, Baoulé non prêt…) →
          // affiché tel quel (Task 32).
          const msg = describeSTTError(err)
          void speakBaoule(msg)
          set({ kind: 'error', text: msg })
        }
        scheduleAutoClose(2500)
      },
      onEnd: () => {
        // If STT ends while still in listening state (no speech detected),
        // reset to idle so user can try again
        if (feedbackRef.current.kind === 'listening') {
          set({ kind: 'idle' })
        }
      },
    })
    sttSessionRef.current.start()
  }, [sttAvailable, handleTranscript, set, scheduleAutoClose])

  // VOCAL-612 — indirection (pattern BUG-001, fusion 1c2941d) : startListening
  // est déclaré après executeIntent/processTranscript ; les relances
  // automatiques lisent la ref, synchronisée après chaque rendu.
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // --- Bottom bar PTT signal handling ---
  // ORDER MATTERS: stop effect declared BEFORE start effect so it runs first

  // 1) Consume stop signal from bottom bar release
  useEffect(() => {
    if (!voiceStopRequested) return
    requestVoiceStop() // consume the signal
    if (feedbackRef.current.kind === 'listening') {
      // Already recording — stop it
      sttSessionRef.current?.stop()
    } else {
      // Recording hasn't started yet (too-fast release) — mark pending
      pendingStopRef.current = true
    }
  }, [voiceStopRequested, requestVoiceStop])

  // 2) Consume start signal from the bottom Tata button. The bottom-bar
  // gesture is the only activation control (click-to-toggle since 0e14560);
  // the modal is feedback only.
  useEffect(() => {
    if (!showVoiceModal || !voiceAutoRecord) return
    setVoiceAutoRecord(false)
    if (pendingStopRef.current) {
      // Bottom bar already released — don't start, just show idle overlay
      pendingStopRef.current = false
      return
    }
    void startListeningRef.current()
    // voiceAutoRecord deliberately left out of the dependency array: this
    // effect consumes the one-shot signal immediately.
  }, [showVoiceModal, setVoiceAutoRecord, startListening])

  const handleClose = () => {
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
    sttSessionRef.current?.abort()
    tataStop()
    closeVoiceModal()
  }

  // Cancel pending auto-close when modal closes
  useEffect(() => {
    if (!showVoiceModal && autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current)
      autoCloseTimer.current = null
    }
  }, [showVoiceModal])

  if (!showVoiceModal) return null

  const isListening = feedback.kind === 'listening'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-4 py-[max(1rem,env(safe-area-inset-top))]"
      onClick={handleClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Centered floating content */}
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-6 px-2 sm:gap-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -right-2 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/30 hover:text-white sm:-right-3"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Feedback text */}
          <div className="flex min-h-[80px] w-full max-w-[min(90vw,24rem)] items-center justify-center text-center leading-snug animate-in fade-in duration-300 slide-in-from-bottom-2">
          {feedback.kind === 'idle' && (
            <div className="space-y-2">
               <p className="text-white/90 text-lg font-medium">Appuyez pour parler</p>
              <p className="text-white/50 text-sm">« Tomates deux mille » · « Ouvre Keiwa »</p>
              <p className="text-white/50 text-sm">« Commander 5 sacs de riz »</p>
            </div>
          )}

          {feedback.kind === 'listening' && (
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-1 h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1.5 bg-[#D2622A] rounded-full voice-wave-bar" style={{ height: '16px' }} />
                ))}
              </div>
            </div>
          )}

          {feedback.kind === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 bg-[#D2622A]/50 rounded-full voice-wave-bar" style={{ height: '12px' }} />
                ))}
              </div>
              <p className="text-white/70 text-sm">&laquo; {feedback.text} &raquo;</p>
            </div>
          )}

          {feedback.kind === 'confirm' && (
            <div className="space-y-3 max-w-xs">
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3">
                <p className="text-white text-sm font-medium">{feedback.text}</p>
              </div>
              <p className="text-white/50 text-xs">
                {pendingQuantityRef.current
                  ? 'Je vous écoute. Dis la quantité vendue.'
                  : 'Je vous écoute. Dis oui pour confirmer ou non pour annuler.'}
              </p>
            </div>
          )}

          {feedback.kind === 'success' && (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              <p className="text-green-300 text-lg font-medium">{feedback.text}</p>
            </div>
          )}

          {feedback.kind === 'error' && (
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
               <p className="text-amber-300 text-base font-medium sm:text-lg">{feedback.text}</p>
            </div>
          )}
        </div>

        {/* Tata is controlled only from the bottom navigation button. */}
        {/* Effet d'écoute aligné sur la page d'authentification (bouton micro
            orange vif qui pulse avec un halo ring-4) — avec le logo de Tata. */}
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full shadow-md transition-all duration-300 sm:h-24 sm:w-24',
            isListening
              ? 'bg-[#D2622A] shadow-[#D2622A]/40 ring-4 ring-[#D2622A]/25 animate-pulse'
              : 'bg-white/10 shadow-none'
          )}
        >
          <img src="/icon-only.png" alt="Tata" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
        </div>

        {/* Bottom label */}
        <p className={cn(
          'text-sm font-medium transition-colors',
          isListening ? 'text-white' : 'text-white/40',
          soleilMode && 'text-base'
        )}>
          {isListening ? 'Je vous écoute…' : 'Tata Nanti Lou'}
        </p>

        {/* Task 32 — langue de reconnaissance (Français / Baoulé β) */}
        <VoiceLanguageSelector />
      </div>
      {isListening && (
        <VoiceListeningIndicator
          // VOCAL-612 — sous-titre aligné sur la question en attente
          // (confirmation / quantité / réponse libre).
          subtitle={
            pendingQuantityRef.current
              ? 'Dites la quantité vendue'
              : pendingConfirmRef.current
                ? 'Dites oui ou non'
                : 'Dites votre réponse'
          }
          onStop={handleClose}
        />
      )}
    </div>
  )
}
