// MODE-990 (DET-001 tranche 4) — slice objectifs & alertes du store
// back-office : objectifs mensuels (mois/année), seuils d'alertes,
// évaluation (la cloche du header est rechargée après). Corps VERBATIM
// du store (preuve octet-pour-octet).
import type { StateCreator } from 'zustand'
import type { BoObjectif, BoAlertRule } from './bo-models'
import { mapObjectifFromApi, mapAlertRuleFromApi } from './api-mappers'
import type { BackofficeState, BoObjectifsState } from './bo-state'

export const createBoObjectifsSlice: StateCreator<
  BackofficeState,
  [['zustand/persist', unknown]],
  [],
  BoObjectifsState
> = (set, get) => ({
      // ============== OBJECTIFS & ALERTES ==============

      fetchObjectifs: async (month, year) => {
        set({ loading: true })
        get().setDomainError('objectifs', null)
        try {
          const now = new Date()
          const m = month ?? now.getMonth()
          const y = year ?? now.getFullYear()
          const res = await fetch(`/api/backoffice/objectifs?month=${m}&year=${y}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          set({
            objectifs: ((data.objectifs as Record<string, unknown>[]) || []).map(mapObjectifFromApi),
            objectifsPeriode: data.periode as { month: number; year: number },
            objectifsMigrationPending: Boolean(data.migration_en_attente),
          })
        } catch (err) {
          get().setDomainError('objectifs', err instanceof Error ? err.message : 'Erreur de chargement des objectifs')
        } finally {
          set({ loading: false })
        }
      },

      fetchAlertRules: async () => {
        set({ loading: true })
        get().setDomainError('alertRules', null)
        try {
          const res = await fetch('/api/backoffice/alertes/regles')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const units: Record<string, BoAlertRule['unit']> = {
            dossiers_en_attente: 'heures',
            identificateur_inactif: 'jours',
            chute_ventes: '%',
            objectif_en_retard: '%',
          }
          set({
            alertRules: ((data.regles as Record<string, unknown>[]) || []).map((r) => mapAlertRuleFromApi(r, units)),
          })
        } catch (err) {
          get().setDomainError('alertRules', err instanceof Error ? err.message : 'Erreur de chargement des seuils')
        } finally {
          set({ loading: false })
        }
      },

      upsertObjectif: async (payload) => {
        try {
          const res = await fetch('/api/backoffice/objectifs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = mapObjectifFromApi(await res.json())
          // Rafraîchit la période affichée (les compteurs current changent).
          const periode = get().objectifsPeriode
          await get().fetchObjectifs(periode?.month, periode?.year)
          return created
        } catch (err) {
          get().setDomainError('objectifs', err instanceof Error ? err.message : 'Erreur d’enregistrement de l’objectif')
          return null
        }
      },

      deleteObjectif: async (id) => {
        try {
          const res = await fetch(`/api/backoffice/objectifs?id=${id}`, { method: 'DELETE' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          set((s) => ({ objectifs: s.objectifs.filter((o) => o.id !== id) }))
          return true
        } catch (err) {
          get().setDomainError('objectifs', err instanceof Error ? err.message : 'Erreur de suppression de l’objectif')
          return false
        }
      },

      saveAlertRules: async (rules) => {
        try {
          const res = await fetch('/api/backoffice/alertes/regles', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regles: rules }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const data = await res.json()
          const units: Record<string, BoAlertRule['unit']> = {
            dossiers_en_attente: 'heures',
            identificateur_inactif: 'jours',
            chute_ventes: '%',
            objectif_en_retard: '%',
          }
          set({ alertRules: ((data.regles as Record<string, unknown>[]) || []).map((r) => mapAlertRuleFromApi(r, units)) })
          return true
        } catch (err) {
          get().setDomainError('alertRules', err instanceof Error ? err.message : 'Erreur d’enregistrement des seuils')
          return false
        }
      },

      evaluateAlerts: async () => {
        try {
          const res = await fetch('/api/backoffice/alertes/evaluer', { method: 'POST' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const data = await res.json() as { generated: number; skipped: string[] }
          // La cloche du header compte les alertes non lues — rechargement.
          await get().fetchAlerts()
          return data
        } catch (err) {
          get().setDomainError('alertRules', err instanceof Error ? err.message : 'Erreur d’évaluation des alertes')
          return null
        }
      },
})
