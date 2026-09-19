import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// MODE-906 (§21-22/§27-28) — grand livre de crédit clients côté appareil.
//
// 100 % offline-first : les actions MUTENT le journal local PUIS mettent
// l'opération en file offline ('merchant-partner', 'credit-op') — elles ne
// font JAMAIS de réseau et ne jettent jamais (l'offline n'est pas une
// erreur). Le solde local sert à l'UI ; le serveur fait foi à la sync
// (RPC merchant_record_credit_op, idempotence sur (merchant_id, operation_id),
// refus REPAYMENT_EXCEEDS_DEBT si un remboursement dépassait la dette).
//
// Journal append-only : les ops ne sont jamais supprimées ni réécrites,
// seulement plafonnées à 200 (les plus récentes en tête).

import { useAppStore } from '@/lib/stores/app-store'
import { queuePendingSync } from '@/lib/offline-db'
import { notify } from '@/lib/notifications/triggers'
import { creditRecordedInput, repaymentReceivedInput } from '@/lib/notifications/events'

export type CreditPartnerKind = 'client' | 'fournisseur'
export type CreditOpKind = 'credit' | 'repayment'

export interface CreditPartner {
  /** client_id d'idempotence (unique côté serveur, business_partners). */
  clientId: string
  kind: CreditPartnerKind
  name: string
  phone?: string
  note?: string
  /** > 0 le client doit au marchand ; < 0 le marchand doit au client. */
  balanceCfa: number
  createdAt: number
  updatedAt: number
}

export interface CreditOp {
  /** operation_id d'idempotence (UUID — rejeu offline = même opération). */
  clientId: string
  kind: CreditOpKind
  partnerClientId: string
  partnerName: string
  amountCfa: number
  /** Solde local du partenaire APRÈS l'opération (projection UI). */
  balanceAfterCfa: number
  /** Vente à crédit liée (legacy_sales.client_id) — présent si crédit issu d'une vente. */
  saleClientId?: string
  note?: string
  createdAt: number
}

export type CreditOpInput = {
  partnerClientId?: string
  partnerName: string
  amountCfa: number
  note?: string
  saleClientId?: string
}

export type CreditActionResult =
  | { ok: true; partner: CreditPartner; op: CreditOp }
  | { ok: false; error: string }
  | { ok: false; refusal: { code: 'REPAYMENT_EXCEEDS_DEBT'; balanceCfa: number } }

export interface CreditPartnerInput {
  clientId: string
  name: string
  kind?: CreditPartnerKind
  phone?: string
  note?: string
}

interface CreditsState {
  partners: Record<string, CreditPartner>
  /** Journal append-only, plus récent en tête, plafonné à 200. */
  ops: CreditOp[]
  upsertPartner: (input: CreditPartnerInput) => CreditPartner
  recordCredit: (input: CreditOpInput) => CreditActionResult
  recordRepayment: (input: CreditOpInput) => CreditActionResult
  totalOutstandingCfa: () => number
  clientsWithDebt: () => CreditPartner[]
  partnerByName: (name: string) => CreditPartner | null
}

const MAX_OPS = 200

/** client_id d'idempotence au format UUID (crypto.randomUUID) — le rejeu
 * offline rejoue le MÊME id et le serveur reconnaît l'opération (§31-32). */
export function operationClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

/** Recherche de nom insensible à la casse ET aux accents (Adjoua Koné =
 * adjoua kone). */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function newClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useCreditsStore = create<CreditsState>()(
  persist(
    (set, get) => ({
      partners: {},
      ops: [],

      upsertPartner: (input) => {
        const now = Date.now()
        const existing = get().partners[input.clientId]
        if (existing) {
          // Déjà connu localement : mise à jour locale, PAS de nouvelle
          // entrée en file (l'upsert serveur est idempotent sur client_id —
          // la première entrée suffit, le rejeu peut porter la même).
          const updated: CreditPartner = {
            ...existing,
            name: input.name.trim() || existing.name,
            kind: input.kind ?? existing.kind,
            phone: input.phone ?? existing.phone,
            note: input.note ?? existing.note,
            updatedAt: now,
          }
          set((s) => ({ partners: { ...s.partners, [updated.clientId]: updated } }))
          return updated
        }
        const partner: CreditPartner = {
          clientId: input.clientId,
          kind: input.kind ?? 'client',
          name: input.name.trim(),
          phone: input.phone,
          note: input.note,
          balanceCfa: 0,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ partners: { ...s.partners, [partner.clientId]: partner } }))
        const merchantId = useAppStore.getState().merchantId
        if (merchantId) {
          void queuePendingSync('merchant-partner', {
            merchantId,
            clientId: partner.clientId,
            kind: partner.kind,
            name: partner.name,
            phone: partner.phone,
            note: partner.note,
          })
        }
        return partner
      },

      recordCredit: (input) => {
        const merchantId = useAppStore.getState().merchantId
        if (!merchantId) return { ok: false, error: 'Compte non identifié' }
        const name = (input.partnerName ?? '').trim()
        if (name.length < 2) return { ok: false, error: 'Nom du client requis' }
        if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
          return { ok: false, error: 'Montant invalide' }
        }

        // Crée/récupère le partenaire (par clientId, sinon par nom, sinon à la volée).
        let partner = (input.partnerClientId ? get().partners[input.partnerClientId] : undefined)
          ?? get().partnerByName(name)
        if (!partner) {
          partner = get().upsertPartner({
            clientId: input.partnerClientId ?? newClientId('partner'),
            name,
            kind: 'client',
          })
        }

        const now = Date.now()
        const op: CreditOp = {
          clientId: operationClientId(),
          kind: 'credit',
          partnerClientId: partner.clientId,
          partnerName: partner.name,
          amountCfa: input.amountCfa,
          balanceAfterCfa: partner.balanceCfa + input.amountCfa,
          saleClientId: input.saleClientId,
          note: input.note,
          createdAt: now,
        }
        const updatedPartner: CreditPartner = {
          ...partner,
          balanceCfa: op.balanceAfterCfa,
          updatedAt: now,
        }
        set((s) => ({
          partners: { ...s.partners, [updatedPartner.clientId]: updatedPartner },
          ops: [op, ...s.ops].slice(0, MAX_OPS),
        }))
        const payload: Record<string, unknown> = {
          merchantId,
          clientId: op.clientId,
          kind: 'credit',
          partnerClientId: updatedPartner.clientId,
          partnerName: updatedPartner.name,
          amountCfa: op.amountCfa,
          note: op.note,
        }
        if (op.saleClientId) payload.saleClientId = op.saleClientId
        void queuePendingSync('credit-op', payload)
        // Notification locale catégorie crédit — best-effort, jamais bloquante.
        void notify(creditRecordedInput({
          clientName: updatedPartner.name,
          amount: op.amountCfa,
          newBalance: updatedPartner.balanceCfa,
        }))
        return { ok: true, partner: updatedPartner, op }
      },

      recordRepayment: (input) => {
        const merchantId = useAppStore.getState().merchantId
        if (!merchantId) return { ok: false, error: 'Compte non identifié' }
        const name = (input.partnerName ?? '').trim()
        if (name.length < 2) return { ok: false, error: 'Nom du client requis' }
        if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
          return { ok: false, error: 'Montant invalide' }
        }

        const partner = (input.partnerClientId ? get().partners[input.partnerClientId] : undefined)
          ?? get().partnerByName(name)
        // Client inconnu = dette nulle : le refus dépassement dit la vérité.
        const balanceCfa = partner?.balanceCfa ?? 0
        if (input.amountCfa > balanceCfa) {
          // REFUS MÉTIER : rien n'est muté, rien n'est mis en file (§27) —
          // le solde ne passe jamais négatif côté dette client.
          return { ok: false, refusal: { code: 'REPAYMENT_EXCEEDS_DEBT', balanceCfa } }
        }
        if (!partner) return { ok: false, error: 'Client inconnu' }

        const now = Date.now()
        const op: CreditOp = {
          clientId: operationClientId(),
          kind: 'repayment',
          partnerClientId: partner.clientId,
          partnerName: partner.name,
          amountCfa: input.amountCfa,
          balanceAfterCfa: balanceCfa - input.amountCfa,
          note: input.note,
          createdAt: now,
        }
        const updatedPartner: CreditPartner = {
          ...partner,
          balanceCfa: op.balanceAfterCfa,
          updatedAt: now,
        }
        set((s) => ({
          partners: { ...s.partners, [updatedPartner.clientId]: updatedPartner },
          ops: [op, ...s.ops].slice(0, MAX_OPS),
        }))
        void queuePendingSync('credit-op', {
          merchantId,
          clientId: op.clientId,
          kind: 'repayment',
          partnerClientId: updatedPartner.clientId,
          partnerName: updatedPartner.name,
          amountCfa: op.amountCfa,
          note: op.note,
        })
        void notify(repaymentReceivedInput({
          clientName: updatedPartner.name,
          amount: op.amountCfa,
          remainingBalance: updatedPartner.balanceCfa,
        }))
        return { ok: true, partner: updatedPartner, op }
      },

      totalOutstandingCfa: () =>
        Object.values(get().partners).reduce((sum, p) => (p.balanceCfa > 0 ? sum + p.balanceCfa : sum), 0),

      clientsWithDebt: () =>
        Object.values(get().partners)
          .filter((p) => p.balanceCfa > 0)
          .sort((a, b) => b.balanceCfa - a.balanceCfa),

      partnerByName: (name) => {
        const needle = normalizeName(name)
        if (!needle) return null
        return Object.values(get().partners).find((p) => normalizeName(p.name) === needle) ?? null
      },
    }),
    {
      name: 'julaba-credits-store',
      partialize: (state) => ({
        partners: state.partners,
        ops: state.ops,
      }),
    },
  ),
)
