import { randomBytes, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { generateLiaisonCode, hashLiaisonCode } from '@/lib/liaison-code'

export const DEVICE_SESSION_COOKIE = 'julaba_device'
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000

export type DeviceSubjectType = 'merchant' | 'producteur' | 'identificateur' | 'cooperateur'

export function subjectFor(type: DeviceSubjectType, id: string): string {
  return `${type}:${id}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type ClaimResult =
  | { ok: true; token: string; expiresAt: Date; isNew: boolean }
  | { ok: false; status: number; error: string }

export async function claimDeviceSession(
  subject: string,
  request: NextRequest,
  opts?: { requireExisting?: boolean; allowTakeover?: boolean }
): Promise<ClaimResult> {
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('subject', subject)
    .single()

  if (opts?.requireExisting && !existing) {
    return { ok: false, status: 403, error: 'Connectez-vous d\'abord avec votre code pour lier cet appareil.' }
  }

  const presentedToken = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  const presentedHash = presentedToken ? hashToken(presentedToken) : null

  // Session déjà liée à un autre appareil : ce n'est plus un blocage, c'est
  // une re-liaison — l'appareil qui vient de PRUVER sa présence (connexion
  // avec le bon code, vérifiée côté serveur) devient l'appareil référencé,
  // l'ancien devra simplement se reconnecter. Un appareil qui ne présente
  // aucune preuve (renewal via /api/session/claim sans allowTakeover) reste
  // lui refusé : connaître un id ne suffit pas à s'approprier un compte.
  if (existing && existing.token_hash !== presentedHash && !opts?.allowTakeover) {
    return { ok: false, status: 409, error: 'Ce compte est déjà utilisé sur un autre appareil.' }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  if (existing) {
    const { error } = await supabase
      .from('device_sessions')
      .update({
        token_hash: hashToken(token),
        expires_at: expiresAt.toISOString(),
        // MODE-949 (S-11) : le claim (preuve de secret exigée) repart d'une
        // session FRAÎCHE — une révocation antérieure (vol/perte, BO) est
        // effacée par la re-liaison elle-même.
        revoked_at: null,
      })
      .eq('subject', subject)

    if (error) {
      return { ok: false, status: 503, error: 'Impossible de mettre à jour la session appareil.' }
    }
  } else {
    const { error } = await supabase.from('device_sessions').insert({
      subject,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
    })

    if (error) {
      return { ok: false, status: 503, error: 'Impossible de créer la session appareil.' }
    }
  }

  return { ok: true, token, expiresAt, isNew: !existing }
}

/** Resolves the subject ("merchant:<id>" etc) bound to this request's device cookie, or null. */
export async function getDeviceSubject(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  if (!token) return null

  const supabase = createSupabaseAdminClient()
  const { data: session } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('token_hash', hashToken(token))
    .single()

  if (!session || new Date(session.expires_at) < new Date()) return null
  // MODE-949 (AUDIT-003 S-11) — révocation applicative : une session
  // marquée révoquée (vol/perte signalé au BO) est morte IMMÉDIATEMENT,
  // même si son TTL de 365 jours n'est pas écoulé — le cookie ne vaut
  // plus rien, la re-liaison par code reste le seul chemin de retour.
  if (session.revoked_at) return null
  return session.subject
}

export interface IssuedLiaisonCode {
  code: string
  expiresAt: Date
}

/**
 * MODE-937 (S-04) — émet un code de liaison one-shot pour un compte. Le
 * code en clair n'existe QUE dans la valeur de retour (le temps de la
 * réponse HTTP) : la base ne porte que son sha256, consommable une seule
 * fois via consume_liaison_code (migration 20260921140000).
 */
export async function issueLiaisonCode(
  subjectType: DeviceSubjectType,
  subjectId: string,
  ttlMs: number,
  createdBy: string
): Promise<IssuedLiaisonCode> {
  const code = generateLiaisonCode()
  const expiresAt = new Date(Date.now() + ttlMs)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('liaison_codes').insert({
    subject_type: subjectType,
    subject_id: subjectId,
    code_hash: hashLiaisonCode(code),
    expires_at: expiresAt.toISOString(),
    created_by: createdBy,
  })
  if (error) throw error
  return { code, expiresAt }
}

export function deviceSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
