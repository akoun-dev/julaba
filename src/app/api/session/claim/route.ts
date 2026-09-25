import { NextRequest, NextResponse } from 'next/server'
import { withApiMetrics } from '@/lib/api-metrics'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  claimDeviceSession,
  deviceSessionCookieOptions,
  subjectFor,
  DEVICE_SESSION_COOKIE,
  type DeviceSubjectType,
} from '@/lib/device-session'
import { normalizeLiaisonCode } from '@/lib/liaison-code'
import { ipScope, normalizeIp } from '@/lib/auth-pin'
import { createNotification } from '@/lib/notifications/server'
import { formatZodError } from '@/lib/validation/marchand'

const VALID_TYPES: DeviceSubjectType[] = ['merchant', 'producteur', 'identificateur', 'cooperateur']

const WELCOME_MESSAGE: Record<DeviceSubjectType, string> = {
  merchant: "Bienvenue sur Jùlaba ! Enregistrez vos ventes, suivez votre stock et vos dépenses au quotidien.",
  producteur: "Bienvenue sur Jùlaba ! Déclarez vos récoltes et suivez vos commandes directement depuis l'application.",
  identificateur: "Bienvenue sur Jùlaba ! Vos dossiers soumis seront suivis ici, avec une notification dès qu'un dossier est validé ou rejeté.",
  cooperateur: "Bienvenue sur Jùlaba ! Gérez votre coopérative : membres, trésorerie, stock commun et achats groupés.",
}

// MODE-1007 — les deux chemins de claim sont entièrement validés par le
// handler avec SES messages spécifiques (« Code de liaison requis », format
// ABCD-EFGH via normalizeLiaisonCode, « subjectType et id requis ») → les
// champs restent z.unknown().optional() : le schéma n'apporte que la garantie
// « corps = objet JSON » (payloads légaux : { code } ou { subjectType, id },
// tous strings — claim-device-session.ts, rejeu 'device-claim'/'device-claim-code').
const sessionClaimSchema = z.object({
  code: z.unknown().optional(),
  subjectType: z.unknown().optional(),
  id: z.unknown().optional(),
})

// Bind this device to an account. MODE-937 (AUDIT-003 S-04) reprend tout le
// contrat :
//
//  1. { code } — CHEMIN PRINCIPAL : le code de liaison one-shot « ABCD-EFGH »
//     (émis 10 min par les logins, 30 j par le back-office identificateur)
//     est consommé ATOMIQUEMENT côté SQL (consume_liaison_code) et prouve
//     la possession du compte : le claim peut donc (re)lier l'appareil.
//     Un code invalide/expiré/consommé incrémente le compteur d'échecs IP
//     (verrou 20/5 min partagé avec le login — pas de bruteforce possible).
//
//  2. { subjectType, id } — COMPAT RENOUVELLEMENT PUR : uniquement pour un
//     appareil DÉJÀ lié au compte (le cookie prouve la possession) ; fin du
//     premier claim par id nu et du takeover — connaître un id (devinable,
//     cf. DET-COOP-001) ne lie plus jamais un compte.
// MODE-1012 — instrumentation SLO (compteurs agrégés /api/metrics) : la
// réponse reste INTACTE (statut/headers/body).
async function claimHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const parsedClaim = sessionClaimSchema.safeParse(body ?? {})
    if (!parsedClaim.success) {
      return NextResponse.json({ erreur: formatZodError(parsedClaim.error) }, { status: 400 })
    }
    const { code, subjectType, id } = body

    const ip = ipScope(normalizeIp(request.headers.get('x-forwarded-for')))

    // ── 1. Claim par code de liaison one-shot ───────────────────────────
    if (code !== undefined || id === undefined) {
      if (typeof code !== 'string' || !code) {
        return NextResponse.json({ erreur: 'Code de liaison requis' }, { status: 400 })
      }
      const normalized = normalizeLiaisonCode(code)
      if (!normalized) {
        return NextResponse.json({ erreur: 'Code de liaison invalide — 8 lettres attendues (format ABCD-EFGH)' }, { status: 400 })
      }

      const supabase = createSupabaseAdminClient()

      // Garde anti-bruteforce : même verrou réseau que les routes de login.
      const { data: lock } = await supabase.rpc('get_auth_lock', { p_scope: ip })
      if (typeof lock === 'string' && new Date(lock) > new Date()) {
        return NextResponse.json(
          { erreur: 'Trop de tentatives. Réessayez plus tard.' },
          { status: 429 },
        )
      }

      const { data: consumed } = await supabase.rpc('consume_liaison_code', { p_code: normalized })
      if (!consumed || typeof consumed !== 'object') {
        await supabase.rpc('record_auth_failure', {
          p_scope: ip, p_max_attempts: 20, p_window_minutes: 5, p_lock_minutes: 15,
        })
        return NextResponse.json({ erreur: 'Code de liaison invalide, déjà utilisé ou expiré.' }, { status: 401 })
      }

      const codeType = (consumed as { subject_type?: string }).subject_type
      const codeId = String((consumed as { subject_id?: string }).subject_id ?? '')
      if (!VALID_TYPES.includes(codeType as DeviceSubjectType) || !codeId) {
        return NextResponse.json({ erreur: 'Code de liaison invalide.' }, { status: 401 })
      }

      const result = await claimDeviceSession(subjectFor(codeType as DeviceSubjectType, codeId), request, {
        allowTakeover: true,
      })
      if (!result.ok) {
        return NextResponse.json({ erreur: result.error }, { status: result.status })
      }

      await supabase.rpc('reset_auth_failures', { p_scope: ip })
      if (result.isNew) {
        await createNotification({
          subjectType: codeType as DeviceSubjectType, subjectId: codeId, type: 'bienvenue',
          title: 'Bienvenue sur Jùlaba', body: WELCOME_MESSAGE[codeType as DeviceSubjectType],
        })
      }

      const response = NextResponse.json({ ok: true, subjectType: codeType })
      response.cookies.set(DEVICE_SESSION_COOKIE, result.token, deviceSessionCookieOptions(result.expiresAt))
      return response
    }

    // ── 2. Compat : renouvellement pur (appareil déjà lié) ─────────────
    if (!VALID_TYPES.includes(subjectType) || typeof id !== 'string' || !id) {
      return NextResponse.json({ erreur: 'subjectType et id requis' }, { status: 400 })
    }

    const result = await claimDeviceSession(subjectFor(subjectType, id), request, {
      requireExisting: true,
    })
    if (!result.ok) {
      return NextResponse.json({ erreur: result.error }, { status: result.status })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(DEVICE_SESSION_COOKIE, result.token, deviceSessionCookieOptions(result.expiresAt))
    return response
  } catch (error) {
    console.error('[API session/claim]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export const POST = withApiMetrics('session_claim', claimHandler)
