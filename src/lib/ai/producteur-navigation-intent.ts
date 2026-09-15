import { z } from 'zod'
import type { ScreenRoute } from '@/lib/stores/app-store'

export const PRODUCTEUR_NAVIGATION_ROUTES = [
  'prod-home', 'prod-recoltes', 'prod-commandes', 'prod-stock', 'prod-cycles', 'prod-profil',
] as const satisfies readonly ScreenRoute[]

export type ProducteurNavigationRoute = (typeof PRODUCTEUR_NAVIGATION_ROUTES)[number]

const producteurRouteSchema = z.enum(PRODUCTEUR_NAVIGATION_ROUTES)
export const producteurNavigationIntentSchema = z.object({
  intent: z.enum(['navigation', 'unknown']),
  targetRoute: producteurRouteSchema.nullable(),
  confidence: z.number().min(0).max(1),
}).strict()

export type ProducteurNavigationIntent = z.infer<typeof producteurNavigationIntentSchema>

export function parseProducteurNavigationOutput(text: string): ProducteurNavigationIntent {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = producteurNavigationIntentSchema.safeParse(JSON.parse(cleaned))
    if (!parsed.success || parsed.data.intent !== 'navigation' || !parsed.data.targetRoute) {
      return { intent: 'unknown', targetRoute: null, confidence: parsed.success ? parsed.data.confidence : 0 }
    }
    return parsed.data
  } catch {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
}

export function isProducteurNavigationCandidate(transcript: string): boolean {
  const lower = transcript.toLocaleLowerCase('fr-FR')
  // Harvest declarations are mutations and must remain in prodIntent.ts.
  if (/(?:j['’]?ai récolté|j['’]?ai recolte|récolte.*(?:\d|kilo|kg)|recolte.*(?:\d|kilo|kg)|quantité|quantite|kilos?|\bkg\b|qualité|qualite)/i.test(lower)) return false
  return /(?:accueil|page|récoltes?|recoltes?|commandes?|stock|cycles?|carnet|calendrier|profil|moi|où|ou est|montre|ouvre|voir|consulter|écran|ecran|endroit|aller|va dans)/i.test(lower)
}
