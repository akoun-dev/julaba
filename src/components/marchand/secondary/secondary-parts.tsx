'use client'

// Types et constantes partagés par les écrans secondaires marchands
// (DET-001 tranche 6, MODE-992) : badge de statut des commandes fournisseur
// (lu par le Marché ET le suivi Commandes) et forme d'une commande.
// Transférés verbatim depuis secondary-screens.tsx.

export const ORDER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  en_attente: { label: 'En attente', className: 'bg-amber-100 text-amber-700 border-0' },
  confirmee: { label: 'Confirmée', className: 'bg-blue-100 text-blue-700 border-0' },
  livree: { label: 'Livrée', className: 'bg-green-100 text-green-700 border-0' },
  annulee: { label: 'Annulée', className: 'bg-slate-100 text-slate-500 border-0' },
}

export interface SupplierOrder {
  id: string
  supplier: string
  productName: string
  quantity: number
  totalAmount: number
  status: string
  createdAt: string
}
