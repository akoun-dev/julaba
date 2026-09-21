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
  /** > 0 le client doit au marchand ; < 0 le marchand doit au client
   * (fournisseur : balance < 0 = crédit fournisseur, le marchand lui doit). */
  balanceCfa: number
  /** MODE-907 (§15) — annuaire fournisseurs : champs structurés LOCAUX
   * (texte libre) ; ils voyagent vers le serveur composés dans `note`. */
  location?: string
  products?: string
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

/** MODE-940 (AUDIT-003 F-11) — op fusionnée depuis le SERVEUR (autre
 * appareil) : le solde après-coup projeté localement (balanceAfterCfa)
 * n'existe pas sur cet appareil — absent, JAMAIS inventé. */
export type CreditOpServeur = Omit<CreditOp, 'balanceAfterCfa'> & { balanceAfterCfa?: number }

/** Formes renvoyées par les GET serveurs (mapOp/mapPartner des routes) —
 * lecture seule, jamais de champ inventé côté client. */
interface PartenaireServeur {
  id?: string
  clientId?: string
  kind?: string
  name?: string
  phone?: string | null
  note?: string | null
  balanceCfa?: number
  createdAt?: string
  updatedAt?: string
}

interface OpServeur {
  operationId?: string
  kind?: string
  partnerId?: string
  partnerName?: string | null
  saleClientId?: string | null
  amountCfa?: number
  note?: string | null
  createdAt?: string
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
  /** MODE-907 (§15) — annuaire fournisseurs (texte libre). */
  location?: string
  products?: string
}

interface CreditsState {
  partners: Record<string, CreditPartner>
  /** Journal append-only, plus récent en tête, plafonné à 200. */
  ops: CreditOpServeur[]
  upsertPartner: (input: CreditPartnerInput) => CreditPartner
  recordCredit: (input: CreditOpInput) => CreditActionResult
  recordRepayment: (input: CreditOpInput) => CreditActionResult
  totalOutstandingCfa: () => number
  clientsWithDebt: () => CreditPartner[]
  partnerByName: (name: string) => CreditPartner | null
  /** MODE-940 (AUDIT-003 F-11) — resynchronisation multi-appareils :
   * lit GET /api/marchand/partners + GET /api/marchand/credit-ops et
   * fusionne DOUCEMENT (jamais de perte locale, jamais de chiffre
   * inventé). Ne jette jamais : { ok:false } hors ligne/serveur dur. */
  resyncFromServer: (merchantId: string) => Promise<{ ok: boolean; partnersMerged: number; opsMerged: number }>
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

/** client_id d'idempotence pour un NOUVEAU partenaire (annuaire
 * fournisseurs, capture vocale « chez X » — MODE-907) : format lisible
 * « partner-<ts>-<rand> », jamais court (min 8 côté schéma). */
export function newPartnerClientId(): string {
  return newClientId('partner')
}

/** Note serveur d'un partenaire (texte libre, createPartnerSchema) : la
 * localisation et les produits structurés côté local y sont composés —
 * aucune information perdue, aucune colonne/migration nouvelle. */
function composePartnerNote(partner: Pick<CreditPartner, 'note' | 'location' | 'products'>): string | undefined {
  const parts = [
    partner.location?.trim() ? `Localisation : ${partner.location.trim()}` : '',
    partner.products?.trim() ? `Produits : ${partner.products.trim()}` : '',
    partner.note?.trim() ?? '',
  ].filter(Boolean)
  const note = parts.join(' · ')
  return note || undefined
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
            location: input.location ?? existing.location,
            products: input.products ?? existing.products,
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
          location: input.location,
          products: input.products,
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
            // MODE-907 — la localisation et les produits (texte libre)
            // voyagent composés dans note (aucune perte, pas de migration).
            note: composePartnerNote(partner),
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

      // MODE-940 (AUDIT-003 F-11) — le grand livre de crédit SERVEUR est
      // enfin relu (fin de la dérive multi-appareils) : fusion douce de
      // l'annuaire (GET /partners, client+fournisseur) et des opérations
      // (GET /credit-ops, 50 dernières). Règles, documentées :
      //  • partenaire connu : le SERVEUR fait foi sur le solde (seul le
      //    grand livre RPC le modifie) et sur name/phone/note si sa
      //    version est la plus récente ; les champs APPAREIL (location,
      //    products — texte libre non serveur) restent locaux ;
      //  • partenaire inconnu : ajouté tel quel (jamais de perte) ;
      //  • op inconnue : ajoutée au journal SANS balanceAfterCfa (la
      //    projection après-coup d'un autre appareil n'existe pas ici —
      //    jamais de chiffre inventé) ;
      //  • hors ligne / erreur serveur : { ok:false }, l'état local reste
      //    la source affichée (offline-first inchangé).
      resyncFromServer: async (merchantId) => {
        try {
          const base = `merchantId=${encodeURIComponent(merchantId)}`
          const [clientsRes, foursRes, opsRes] = await Promise.all([
            fetch(`/api/marchand/partners?${base}&kind=client&limit=200`),
            fetch(`/api/marchand/partners?${base}&kind=fournisseur&limit=200`),
            fetch(`/api/marchand/credit-ops?${base}`),
          ])
          if (!clientsRes.ok || !foursRes.ok) return { ok: false, partnersMerged: 0, opsMerged: 0 }
          const clients = (await clientsRes.json()) as { partners?: PartenaireServeur[] }
          const fours = (await foursRes.json()) as { partners?: PartenaireServeur[] }
          const serveurs = [...(clients.partners ?? []), ...(fours.partners ?? [])]

          // id UUID serveur → client_id : permet de rattacher les ops
          // serveur (partnerId) à nos partenaires (partnerClientId).
          const idVersClientId = new Map<string, string>()
          let partnersMerged = 0
          set((s) => {
            const partners = { ...s.partners }
            for (const sp of serveurs) {
              if (!sp.clientId) continue
              if (sp.id) idVersClientId.set(sp.id, sp.clientId)
              const local = partners[sp.clientId]
              if (!local) {
                partners[sp.clientId] = {
                  clientId: sp.clientId,
                  kind: sp.kind === 'fournisseur' ? 'fournisseur' : 'client',
                  name: sp.name ?? 'Sans nom',
                  phone: sp.phone ?? undefined,
                  note: sp.note ?? undefined,
                  balanceCfa: typeof sp.balanceCfa === 'number' ? sp.balanceCfa : 0,
                  createdAt: Date.parse(sp.createdAt ?? '') || Date.now(),
                  updatedAt: Date.parse(sp.updatedAt ?? '') || Date.now(),
                }
              } else {
                const serveurPlusRecent = (Date.parse(sp.updatedAt ?? '') || 0) >= local.updatedAt
                partners[sp.clientId] = {
                  ...local,
                  // Le grand livre serveur fait TOUJOURS foi sur le solde.
                  balanceCfa: typeof sp.balanceCfa === 'number' ? sp.balanceCfa : local.balanceCfa,
                  name: serveurPlusRecent && sp.name ? sp.name : local.name,
                  phone: serveurPlusRecent ? (sp.phone ?? local.phone) : local.phone,
                  note: serveurPlusRecent ? (sp.note ?? local.note) : local.note,
                  updatedAt: Math.max(local.updatedAt, Date.parse(sp.updatedAt ?? '') || 0),
                }
              }
              partnersMerged++
            }
            return { partners }
          })

          let opsMerged = 0
          if (opsRes.ok) {
            const data = (await opsRes.json()) as { ops?: OpServeur[] }
            const serveursOps = data.ops ?? []
            set((s) => {
              const connues = new Set(s.ops.map((o) => o.clientId))
              const fusionnees: CreditOpServeur[] = []
              for (const so of serveursOps) {
                if (!so.operationId || connues.has(so.operationId)) continue
                const partnerClientId = idVersClientId.get(so.partnerId ?? '') ?? ''
                // Sans rattachement de partenaire, l'op reste lisible via
                // partnerName (snapshot serveur) — jamais d'invention.
                fusionnees.push({
                  clientId: so.operationId,
                  kind: so.kind === 'repayment' ? 'repayment' : 'credit',
                  partnerClientId,
                  partnerName: so.partnerName ?? 'Sans nom',
                  amountCfa: typeof so.amountCfa === 'number' ? so.amountCfa : 0,
                  saleClientId: so.saleClientId ?? undefined,
                  note: so.note ?? undefined,
                  createdAt: Date.parse(so.createdAt ?? '') || 0,
                })
                opsMerged++
              }
              if (fusionnees.length === 0) return {}
              const journal = [...fusionnees, ...s.ops]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, MAX_OPS)
              return { ops: journal }
            })
          }
          return { ok: true, partnersMerged, opsMerged }
        } catch {
          return { ok: false, partnersMerged: 0, opsMerged: 0 }
        }
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
