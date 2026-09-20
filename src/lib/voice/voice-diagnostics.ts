export type VoiceDiagnosticKind = 'stt' | 'tts' | 'audio'

export type VoiceDiagnostic = {
  kind: VoiceDiagnosticKind
  engine?: string
  code?: string
  durationMs?: number
  message: string
}

const MAX_MESSAGE_LENGTH = 240

/** Structured, local-only diagnostics. Never logs transcript or audio content. */
export function logVoiceDiagnostic(diagnostic: VoiceDiagnostic): void {
  const payload = {
    ...diagnostic,
    message: diagnostic.message.slice(0, MAX_MESSAGE_LENGTH),
    at: new Date().toISOString(),
  }
  if (typeof console === 'undefined') return
  if (diagnostic.code?.includes('error') || diagnostic.code?.includes('failed')) {
    console.error('[voice]', payload)
  } else {
    console.info('[voice]', payload)
  }
}
