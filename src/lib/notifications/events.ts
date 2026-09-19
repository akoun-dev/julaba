// Déclencheurs métier (§4 de la spec) — une fonction par événement, avec :
// titre/corps en français explicite (jamais « Une erreur est survenue »),
// sévérité, priorité, clé de déduplication stable, action de navigation
// quand un écran cible a du sens, expiration adaptée. Chaque helper
// construit une NotificationInput ; la création effective passe par le
// service client (createNotification → local + serveur si en ligne).

import type { NotificationInput } from './types'
import { formatFCFA } from '@/lib/utils'

// Clés de déduplication — format documenté dans la spec :
//   sale:{saleId}:created   stock:{productId}:low   sync:{queueId}:completed
// Les événements « de session » (hors-ligne, connexion) utilisent une clé
// par fenêtre de temps pour ne pas spammer : {event}:{date-heure tronquée}.

function hourWindow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
}
function dayWindow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD
}

// ── Ventes ────────────────────────────────────────────────────────────────
export function saleCreatedInput(params: { saleId: string | null; amount: number; synced: boolean; viaVoice?: boolean }): NotificationInput {
  const { saleId, amount, synced, viaVoice } = params
  if (!synced) {
    return {
      type: 'sale_created',
      category: 'vente',
      severity: 'warning',
      title: 'Vente enregistrée hors ligne',
      body: `La vente de ${formatFCFA(amount)} est enregistrée sur l'appareil${viaVoice ? ' (par la voix)' : ''}. Elle sera envoyée dès le retour de la connexion.`,
      priority: 'normal',
      deduplicationKey: saleId ? `sale:${saleId}:queued` : undefined,
      actionLabel: 'Voir les ventes',
      actionRoute: 'ventes',
    }
  }
  return {
    type: 'sale_created',
    category: 'vente',
    severity: 'success',
    title: viaVoice ? 'Vente vocale confirmée' : 'Vente enregistrée',
    body: `La vente de ${formatFCFA(amount)} a bien été enregistrée${viaVoice ? ' par la voix' : ''}.`,
    priority: 'low',
    deduplicationKey: saleId ? `sale:${saleId}:created` : `sale:local:${Date.now()}`,
    actionLabel: 'Voir la vente',
    actionRoute: 'ventes',
  }
}

export function saleRejectedInput(reason: string): NotificationInput {
  return {
    type: 'sale_rejected',
    category: 'vente',
    severity: 'error',
    title: 'Vente non enregistrée',
    body: `La vente n'a pas pu être enregistrée (${reason}). Vérifiez la connexion puis réessayez.`,
    priority: 'high',
    deduplicationKey: `sale:rejected:${dayWindow()}`,
    actionLabel: 'Ouvrir la caisse',
    actionRoute: 'caisse',
  }
}

export function saleIncompletePaymentInput(params: { amountDue: number; amountReceived: number }): NotificationInput {
  const { amountDue, amountReceived } = params
  const missing = Math.max(0, amountDue - amountReceived)
  return {
    type: 'sale_payment_incomplete',
    category: 'vente',
    severity: 'warning',
    title: 'Paiement incomplet',
    body: `Il manque ${formatFCFA(missing)} sur ${formatFCFA(amountDue)}. La vente attend le complément.`,
    priority: 'high',
    deduplicationKey: `sale:payment:${dayWindow()}:${amountDue}:${amountReceived}`,
    actionLabel: 'Ouvrir la caisse',
    actionRoute: 'caisse',
  }
}

export function saleChangeDueInput(params: { change: number }): NotificationInput {
  return {
    type: 'sale_change_due',
    category: 'vente',
    severity: 'info',
    title: 'Monnaie à rendre',
    body: `Rendez ${formatFCFA(params.change)} au client.`,
    priority: 'low',
    deduplicationKey: `sale:change:${Date.now()}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 h — la monnaie se rend tout de suite
  }
}

// ── Caisse ────────────────────────────────────────────────────────────────
export function caisseOpenedInput(openingFund: number): NotificationInput {
  return {
    type: 'caisse_opened',
    category: 'caisse',
    severity: 'info',
    title: 'Caisse ouverte',
    body: `La session de caisse est ouverte avec un fond de ${formatFCFA(openingFund)}.`,
    priority: 'low',
    deduplicationKey: `caisse:opened:${dayWindow()}`,
    actionLabel: 'Ouvrir la caisse',
    actionRoute: 'caisse',
  }
}

export function caisseClosedInput(params: { expected: number; counted: number }): NotificationInput {
  const gap = params.counted - params.expected
  const gapLabel = gap === 0 ? 'Aucun écart.' : `Écart de ${formatFCFA(Math.abs(gap))} ${gap > 0 ? 'en plus' : 'en moins'}.`
  return {
    type: 'caisse_closed',
    category: 'caisse',
    severity: gap === 0 ? 'success' : 'warning',
    title: gap === 0 ? 'Caisse clôturée' : 'Caisse clôturée avec écart',
    body: `Attendu ${formatFCFA(params.expected)}, compté ${formatFCFA(params.counted)}. ${gapLabel}`,
    priority: gap === 0 ? 'low' : 'normal',
    deduplicationKey: `caisse:closed:${dayWindow()}`,
    actionLabel: 'Voir la caisse',
    actionRoute: 'caisse',
  }
}

export function caisseNotClosedInput(params: { openedAt: string }): NotificationInput {
  return {
    type: 'caisse_not_closed',
    category: 'caisse',
    severity: 'reminder',
    title: 'Clôturer la caisse',
    body: `Votre session de caisse ouverte à ${new Date(params.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} n'est pas encore clôturée. Pensez à clôturer avant de partir.`,
    priority: 'high',
    deduplicationKey: `caisse:not-closed:${dayWindow()}`,
    actionLabel: 'Clôturer maintenant',
    actionRoute: 'caisse',
  }
}

export function caisseFundChangedInput(newFund: number): NotificationInput {
  return {
    type: 'caisse_fund_changed',
    category: 'caisse',
    severity: 'info',
    title: 'Fond de caisse modifié',
    body: `Le fond de caisse est désormais de ${formatFCFA(newFund)}.`,
    priority: 'low',
    deduplicationKey: `caisse:fund:${Date.now()}`,
  }
}

// ── Stock ─────────────────────────────────────────────────────────────────
export function stockLowInput(params: { productId: string; productName: string; quantity: number }): NotificationInput {
  const { productId, productName, quantity } = params
  return {
    type: 'stock_low',
    category: 'stock',
    severity: 'warning',
    title: 'Stock faible',
    body: quantity <= 0
      ? `Il ne reste plus rien de ${productName}.`
      : `Il reste seulement ${quantity} unité${quantity > 1 ? 's' : ''} de ${productName}.`,
    priority: 'normal',
    deduplicationKey: `stock:${productId}:low:${dayWindow()}`,
    actionLabel: 'Voir le stock',
    actionRoute: 'stock',
    metadata: { productId, groupTitlePlural: '{count} produits ont atteint le seuil de stock faible' },
  }
}

export function stockOutOfStockInput(params: { productId: string; productName: string }): NotificationInput {
  return {
    type: 'stock_out',
    category: 'stock',
    severity: 'error',
    title: 'Stock épuisé',
    body: `${params.productName} est épuisé. Réapprovisionnez avant de continuer à vendre.`,
    priority: 'high',
    deduplicationKey: `stock:${params.productId}:out:${dayWindow()}`,
    actionLabel: 'Voir le stock',
    actionRoute: 'stock',
  }
}

export function productAddedInput(productName: string): NotificationInput {
  return {
    type: 'product_added',
    category: 'stock',
    severity: 'success',
    title: 'Produit ajouté',
    body: `${productName} est disponible dans votre stock.`,
    priority: 'low',
    deduplicationKey: `product:added:${Date.now()}`,
  }
}

export function restockRecordedInput(params: { productId: string; productName: string; quantity: number }): NotificationInput {
  return {
    type: 'product_restocked',
    category: 'stock',
    severity: 'success',
    title: 'Réapprovisionnement enregistré',
    body: `${params.quantity} unité${params.quantity > 1 ? 's' : ''} de ${params.productName} ajoutée${params.quantity > 1 ? 's' : ''} au stock.`,
    priority: 'low',
    deduplicationKey: `stock:${params.productId}:restock:${Date.now()}`,
  }
}

export function productDisabledInput(productName: string): NotificationInput {
  return {
    type: 'product_disabled',
    category: 'stock',
    severity: 'info',
    title: 'Produit désactivé',
    body: `${productName} n'est plus en vente.`,
    priority: 'low',
    deduplicationKey: `product:disabled:${Date.now()}`,
  }
}

// ── Dépenses ──────────────────────────────────────────────────────────────
export function expenseRecordedInput(params: { amount: number; label?: string; synced: boolean }): NotificationInput {
  const label = params.label ? ` « ${params.label} »` : ''
  if (!params.synced) {
    return {
      type: 'expense_created',
      category: 'depense',
      severity: 'warning',
      title: 'Dépense enregistrée hors ligne',
      body: `La dépense de ${formatFCFA(params.amount)}${label} sera synchronisée au retour de la connexion.`,
      priority: 'normal',
      deduplicationKey: `expense:queued:${Date.now()}`,
      actionLabel: 'Voir les dépenses',
      actionRoute: 'depenses',
    }
  }
  return {
    type: 'expense_created',
    category: 'depense',
    severity: 'success',
    title: 'Dépense enregistrée',
    body: `La dépense de ${formatFCFA(params.amount)}${label} a bien été enregistrée.`,
    priority: 'low',
    deduplicationKey: `expense:created:${Date.now()}`,
    actionLabel: 'Voir les dépenses',
    actionRoute: 'depenses',
  }
}

export function expenseNeedsReviewInput(label: string): NotificationInput {
  return {
    type: 'expense_needs_review',
    category: 'depense',
    severity: 'warning',
    title: 'Dépense à vérifier',
    body: `La dépense « ${label} » a un montant inhabituel. Vérifiez-la dans la liste.`,
    priority: 'normal',
    deduplicationKey: `expense:review:${dayWindow()}`,
    actionLabel: 'Vérifier',
    actionRoute: 'depenses',
  }
}

// ── Commandes ─────────────────────────────────────────────────────────────
export function orderStatusInput(params: { orderId: string; status: 'created' | 'sent' | 'pending' | 'confirmed' | 'canceled' | 'failed' | 'synced_after_offline'; supplierName?: string }): NotificationInput {
  const supplier = params.supplierName ? ` chez ${params.supplierName}` : ''
  switch (params.status) {
    case 'created':
      return {
        type: 'order_created', category: 'commande', severity: 'info',
        title: 'Commande créée',
        body: `Votre commande${supplier} a été créée. Envoyez-la au fournisseur quand elle est complète.`,
        priority: 'low', deduplicationKey: `order:${params.orderId}:created`,
        actionLabel: 'Voir les commandes', actionRoute: 'commandes',
      }
    case 'sent':
      return {
        type: 'order_sent', category: 'commande', severity: 'success',
        title: 'Commande envoyée',
        body: `Votre commande${supplier} a été envoyée au fournisseur.`,
        priority: 'normal', deduplicationKey: `order:${params.orderId}:sent`,
        actionLabel: 'Voir les commandes', actionRoute: 'commandes',
      }
    case 'pending':
      return {
        type: 'order_pending', category: 'commande', severity: 'reminder',
        title: 'Commande à confirmer',
        body: `La commande${supplier} attend une réponse du fournisseur.`,
        priority: 'normal', deduplicationKey: `order:${params.orderId}:pending:${dayWindow()}`,
        actionLabel: 'Suivre la commande', actionRoute: 'commandes',
      }
    case 'confirmed':
      return {
        type: 'order_confirmed', category: 'commande', severity: 'success',
        title: 'Commande confirmée',
        body: `Le fournisseur${supplier ? ` ${params.supplierName}` : ''} a confirmé votre commande.`,
        priority: 'normal', deduplicationKey: `order:${params.orderId}:confirmed`,
        actionLabel: 'Voir les commandes', actionRoute: 'commandes',
      }
    case 'canceled':
      return {
        type: 'order_canceled', category: 'commande', severity: 'warning',
        title: 'Commande annulée',
        body: `La commande${supplier} a été annulée. Vérifiez le stock avant de recommander.`,
        priority: 'normal', deduplicationKey: `order:${params.orderId}:canceled`,
        actionLabel: 'Voir les commandes', actionRoute: 'commandes',
      }
    case 'failed':
      return {
        type: 'order_failed', category: 'commande', severity: 'error',
        title: 'Commande échouée',
        body: `L'envoi de la commande${supplier} a échoué. Réessayez ou contactez le fournisseur.`,
        priority: 'high', deduplicationKey: `order:${params.orderId}:failed`,
        actionLabel: 'Réessayer', actionRoute: 'commandes',
      }
    case 'synced_after_offline':
      return {
        type: 'order_synced', category: 'commande', severity: 'info',
        title: 'Commande synchronisée',
        body: `Votre commande passée hors ligne${supplier} a été transmise au serveur.`,
        priority: 'low', deduplicationKey: `order:${params.orderId}:synced`,
        actionLabel: 'Voir les commandes', actionRoute: 'commandes',
      }
  }
}

// ── Tontines ──────────────────────────────────────────────────────────────
export function tontineInput(params: { event: 'created' | 'member_joined' | 'contribution' | 'late' | 'due_soon' | 'closed'; tontineId: string; tontineName: string; memberName?: string; amount?: number; dueDate?: string }): NotificationInput {
  const base = { category: 'tontine' as const, deduplicationKey: undefined as string | undefined }
  switch (params.event) {
    case 'created':
      return { ...base, type: 'tontine_created', severity: 'success', title: 'Tontine créée', body: `La tontine « ${params.tontineName} » est prête à recevoir ses membres.`, priority: 'normal', deduplicationKey: `tontine:${params.tontineId}:created` }
    case 'member_joined':
      return { ...base, type: 'tontine_member', severity: 'info', title: 'Nouveau membre', body: `${params.memberName ?? 'Un nouveau membre'} a rejoint « ${params.tontineName} ».`, priority: 'low', deduplicationKey: `tontine:${params.tontineId}:member:${params.memberName ?? Date.now()}` }
    case 'contribution':
      return { ...base, type: 'tontine_contribution', severity: 'success', title: 'Cotisation enregistrée', body: `${params.memberName ?? 'Un membre'} a cotisé${params.amount ? ` ${formatFCFA(params.amount)}` : ''} à « ${params.tontineName} ».`, priority: 'low', deduplicationKey: `tontine:${params.tontineId}:contribution:${Date.now()}` }
    case 'late':
      return { ...base, type: 'tontine_late', severity: 'warning', title: 'Cotisation en retard', body: `La cotisation de ${params.memberName ?? 'un membre'} à « ${params.tontineName} » est en retard.`, priority: 'high', deduplicationKey: `tontine:${params.tontineId}:late:${dayWindow()}`, actionLabel: 'Voir la tontine', actionRoute: 'tontines' }
    case 'due_soon':
      return { ...base, type: 'tontine_due_soon', severity: 'reminder', title: 'Cotisation bientôt échue', body: `La prochaine échéance de « ${params.tontineName} » est le ${params.dueDate ? new Date(params.dueDate).toLocaleDateString('fr-FR') : 'prochain tour'}.`, priority: 'normal', deduplicationKey: `tontine:${params.tontineId}:due:${dayWindow()}`, actionLabel: 'Voir la tontine', actionRoute: 'tontines' }
    case 'closed':
      return { ...base, type: 'tontine_closed', severity: 'info', title: 'Tontine clôturée', body: `La tontine « ${params.tontineName} » est terminée. Merci !`, priority: 'low', deduplicationKey: `tontine:${params.tontineId}:closed` }
  }
}

// ── Keiwa ─────────────────────────────────────────────────────────────────
export function keiwaInput(params: { event: 'deposit' | 'withdrawal' | 'transfer_sent' | 'transfer_received' | 'insufficient' | 'failed' | 'unusual'; txId?: string; amount?: number }): NotificationInput {
  const amount = params.amount ? ` de ${formatFCFA(params.amount)}` : ''
  switch (params.event) {
    case 'deposit':
      return { type: 'keiwa_deposit', category: 'keiwa', severity: 'success', title: 'Dépôt confirmé', body: `Le dépôt${amount} a été crédité sur votre portefeuille.`, priority: 'normal', deduplicationKey: params.txId ? `keiwa:${params.txId}:deposit` : undefined }
    case 'withdrawal':
      return { type: 'keiwa_withdrawal', category: 'keiwa', severity: 'success', title: 'Retrait confirmé', body: `Le retrait${amount} a été débité de votre portefeuille.`, priority: 'normal', deduplicationKey: params.txId ? `keiwa:${params.txId}:withdrawal` : undefined }
    case 'transfer_sent':
      return { type: 'keiwa_transfer_sent', category: 'keiwa', severity: 'info', title: 'Transfert envoyé', body: `Votre transfert${amount} a été envoyé.`, priority: 'normal', deduplicationKey: params.txId ? `keiwa:${params.txId}:sent` : undefined }
    case 'transfer_received':
      return { type: 'keiwa_transfer_received', category: 'keiwa', severity: 'success', title: 'Transfert reçu', body: `Vous avez reçu un transfert${amount}.`, priority: 'normal', deduplicationKey: params.txId ? `keiwa:${params.txId}:received` : undefined }
    case 'insufficient':
      return { type: 'keiwa_insufficient', category: 'keiwa', severity: 'warning', title: 'Solde insuffisant', body: `Votre portefeuille ne couvre pas l'opération${amount}. Effectuez un dépôt et réessayez.`, priority: 'high', deduplicationKey: `keiwa:insufficient:${hourWindow()}` }
    case 'failed':
      return { type: 'keiwa_failed', category: 'keiwa', severity: 'error', title: 'Transaction échouée', body: `L'opération${amount} n'a pas abouti. Aucun montant n'a été débité ; réessayez.`, priority: 'high', deduplicationKey: params.txId ? `keiwa:${params.txId}:failed` : `keiwa:failed:${Date.now()}` }
    case 'unusual':
      return { type: 'keiwa_unusual', category: 'keiwa', severity: 'warning', title: 'Activité inhabituelle', body: `Une opération inhabituelle a été détectée sur votre portefeuille. Vérifiez vos dernières transactions.`, priority: 'critical', deduplicationKey: `keiwa:unusual:${dayWindow()}` }
  }
}

// ── Synchronisation ───────────────────────────────────────────────────────
export function syncQueuedInput(params: { entity: string; queueId: number }): NotificationInput {
  return {
    type: 'sync_queued', category: 'synchronisation', severity: 'info',
    title: 'Opération mise en attente',
    body: 'Vous êtes hors ligne. Cette opération sera envoyée dès que la connexion sera rétablie.',
    priority: 'low', deduplicationKey: `sync:${params.queueId}:queued`,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  }
}

export function syncCompletedInput(params: { count: number }): NotificationInput {
  return {
    type: 'sync_completed', category: 'synchronisation', severity: 'success',
    title: 'Synchronisation terminée',
    body: params.count > 1
      ? `${params.count} opérations en attente ont été envoyées au serveur.`
      : 'Votre opération en attente a été envoyée au serveur.',
    priority: 'low', deduplicationKey: `sync:completed:${hourWindow()}:${params.count}`,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  }
}

export function syncConflictInput(params: { entity: string }): NotificationInput {
  return {
    type: 'sync_conflict', category: 'synchronisation', severity: 'error',
    title: 'Conflit de synchronisation',
    body: `Une opération (${params.entity}) n'a pas pu être synchronisée : elle a été modifiée ailleurs. Comparez les deux versions pour choisir.`,
    priority: 'high', deduplicationKey: `sync:conflict:${params.entity}:${Date.now()}`,
    actionLabel: 'Voir les dépenses', actionRoute: 'depenses',
  }
}

export function syncUnrecoverableInput(params: { entity: string; reason: string }): NotificationInput {
  return {
    type: 'sync_unrecoverable', category: 'synchronisation', severity: 'error',
    title: 'Synchronisation impossible',
    body: `Une opération (${params.entity}) a été refusée par le serveur (${params.reason}). Elle est conservée dans les conflits.`,
    priority: 'high', deduplicationKey: `sync:unrecoverable:${Date.now()}`,
  }
}

// ── Connexion (hors ligne / retour) ───────────────────────────────────────
export function connectionLostInput(): NotificationInput {
  return {
    type: 'connection_lost', category: 'synchronisation', severity: 'info',
    title: 'Connexion instable',
    body: 'Vous êtes hors ligne. Vous pouvez continuer à vendre : les opérations seront envoyées au retour du réseau.',
    priority: 'low', deduplicationKey: `connection:lost:${hourWindow()}`,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  }
}

export function connectionRestoredInput(params: { pendingCount: number }): NotificationInput {
  return {
    type: 'connection_restored', category: 'synchronisation', severity: 'info',
    title: 'Connexion rétablie',
    body: params.pendingCount > 0
      ? `${params.pendingCount} opération${params.pendingCount > 1 ? 's' : ''} en attente va${params.pendingCount > 1 ? 'nt' : ''} être synchronisée${params.pendingCount > 1 ? 's' : ''}.`
      : 'La connexion est de retour. Tout est à jour.',
    priority: 'low', deduplicationKey: `connection:restored:${hourWindow()}`,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  }
}

// ── Sécurité ──────────────────────────────────────────────────────────────
export function securityInput(params: { event: 'new_device' | 'pin_changed' | 'access_denied' | 'session_expired' | 'role_changed'; deviceName?: string }): NotificationInput {
  switch (params.event) {
    case 'new_device':
      return { type: 'security_new_device', category: 'securite', severity: 'info', title: 'Connexion sur un nouvel appareil', body: `Une session a été ouverte sur ${params.deviceName ?? 'un nouvel appareil'}. Ce n'était pas vous ? Changez votre code PIN.`, priority: 'high' }
    case 'pin_changed':
      return { type: 'security_pin_changed', category: 'securite', severity: 'info', title: 'Code PIN modifié', body: 'Votre code PIN a été modifié avec succès. Si vous n\'êtes pas à l\'origine de ce changement, contactez le support.', priority: 'high' }
    case 'access_denied':
      return { type: 'security_access_denied', category: 'securite', severity: 'error', title: 'Tentative d\'accès refusée', body: 'Une tentative d\'accès à votre compte a été bloquée. Si c\'était vous, ignorez ce message.', priority: 'critical' }
    case 'session_expired':
      return { type: 'security_session_expired', category: 'securite', severity: 'warning', title: 'Session expirée', body: 'Votre session a expiré pour des raisons de sécurité. Reconnectez-vous pour continuer.', priority: 'high' }
    case 'role_changed':
      return { type: 'security_role_changed', category: 'securite', severity: 'warning', title: 'Rôle modifié', body: 'Vos permissions sur Jùlaba ont été modifiées par un administrateur.', priority: 'high' }
  }
}

// ── Divers (formation, production, système) ──────────────────────────────
export function trainingContentAvailableInput(contentTitle: string): NotificationInput {
  return {
    type: 'training_available', category: 'formation', severity: 'info',
    title: 'Nouveau contenu disponible',
    body: `« ${contentTitle} » vient d'être publié dans l'Académie.`,
    priority: 'low', deduplicationKey: `training:${contentTitle}:${dayWindow()}`,
    actionLabel: 'Ouvrir l\'Académie', actionRoute: 'academy',
  }
}

export function harvestRecordedInput(params: { culture: string; quantity: string; synced: boolean }): NotificationInput {
  if (!params.synced) {
    return {
      type: 'harvest_created', category: 'production', severity: 'warning',
      title: 'Récolte enregistrée hors ligne',
      body: `Votre récolte de ${params.culture} (${params.quantity}) sera synchronisée au retour du réseau.`,
      priority: 'normal', deduplicationKey: `harvest:queued:${Date.now()}`,
      actionLabel: 'Voir mes récoltes', actionRoute: 'prod-recoltes',
    }
  }
  return {
    type: 'harvest_created', category: 'production', severity: 'success',
    title: 'Récolte enregistrée',
    body: `Récolte de ${params.culture} (${params.quantity}) enregistrée avec succès.`,
    priority: 'low', deduplicationKey: `harvest:created:${Date.now()}`,
    actionLabel: 'Voir mes récoltes', actionRoute: 'prod-recoltes',
  }
}

export function systemStatusInput(params: { service: string; message: string; severity?: 'info' | 'warning' | 'error' }): NotificationInput {
  return {
    type: 'system_status', category: 'systeme', severity: params.severity ?? 'info',
    title: params.service,
    body: params.message,
    priority: params.severity === 'error' ? 'high' : 'normal',
    deduplicationKey: `system:${params.service}:${dayWindow()}`,
  }
}

// ── Crédits clients (MODE-906, §21-22/§27-28) ────────────────────────────
// Grand livre de crédit : crédit noté (vente à crédit ou dette dictée) et
// remboursement encaissé. Best-effort côté store — jamais bloquant.
export function creditRecordedInput(params: { clientName: string; amount: number; newBalance: number }): NotificationInput {
  return {
    type: 'credit_recorded',
    category: 'credit',
    severity: 'success',
    title: 'Crédit enregistré',
    body: `${params.clientName} vous doit désormais ${formatFCFA(params.newBalance)} (crédit de ${formatFCFA(params.amount)} noté).`,
    priority: 'normal',
    deduplicationKey: `credit:recorded:${Date.now()}`,
    actionLabel: 'Voir mes crédits',
    actionRoute: 'credits',
  }
}

export function repaymentReceivedInput(params: { clientName: string; amount: number; remainingBalance: number }): NotificationInput {
  return {
    type: 'repayment_received',
    category: 'credit',
    severity: 'success',
    title: params.remainingBalance <= 0 ? 'Dette soldée' : 'Paiement enregistré',
    body: params.remainingBalance <= 0
      ? `${params.clientName} a payé ses ${formatFCFA(params.amount)} : sa dette est soldée.`
      : `${params.clientName} a payé ${formatFCFA(params.amount)}. Il reste ${formatFCFA(params.remainingBalance)} à payer.`,
    priority: 'normal',
    deduplicationKey: `credit:repayment:${Date.now()}`,
    actionLabel: 'Voir mes crédits',
    actionRoute: 'credits',
  }
}
