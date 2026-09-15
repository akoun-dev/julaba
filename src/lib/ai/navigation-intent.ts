import { z } from 'zod'
import type { ScreenRoute } from '@/lib/stores/app-store'

export const NAVIGATION_ROUTES = [
  'home', 'caisse', 'stock', 'depenses', 'ventes', 'marche', 'keiwa',
  'tontines', 'profil', 'academy', 'commandes', 'protection-sociale', 'fidelite',
] as const satisfies readonly ScreenRoute[]

export type NavigationRoute = (typeof NAVIGATION_ROUTES)[number]
export const NAVIGATION_CONFIDENCE_THRESHOLD = 0.75

const routeSchema = z.enum(NAVIGATION_ROUTES)
export const navigationIntentSchema = z.object({
  intent: z.enum(['navigation', 'unknown']),
  targetRoute: routeSchema.nullable(),
  confidence: z.number().min(0).max(1),
}).strict()

export type NavigationIntent = z.infer<typeof navigationIntentSchema>

export function normalizeNavigationIntent(value: unknown): NavigationIntent {
  const parsed = navigationIntentSchema.safeParse(value)
  if (!parsed.success) return { intent: 'unknown', targetRoute: null, confidence: 0 }
  if (parsed.data.intent !== 'navigation' || !parsed.data.targetRoute) {
    return { intent: 'unknown', targetRoute: null, confidence: parsed.data.confidence }
  }
  return parsed.data
}

export function stripJsonCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

export function parseNavigationOutput(text: string): NavigationIntent {
  try {
    return normalizeNavigationIntent(JSON.parse(stripJsonCodeFence(text)))
  } catch {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
}

export function isNavigationCandidate(transcript: string): boolean {
  const lower = transcript.toLocaleLowerCase('fr-FR')
  // Route nouns such as "ventes", "dépenses" and "stock" are valid
  // navigation vocabulary. Only reject explicit mutation instructions or
  // transaction details before calling the model.
  if (/(?:vends?|enregistre une vente|note une dépense|note dépense|ajoute(?:r)? (?:du )?stock|réapprovisionne|réapprovisionnement|reapprovisionne|reapprovisionnement|reçu|montant|francs?|fcfa|\b\d+\b)/i.test(lower)) return false
  return /(?:où|ou est|montre|ouvre|aller|va dans|voir|consulter|consulte|accéder|acceder|écran|ecran|endroit|cahier|reste|se trouve)/i.test(lower)
}
