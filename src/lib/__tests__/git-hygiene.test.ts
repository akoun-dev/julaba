import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Garde-fou hygiène git — Task 111 (audit auth backoffice).
 *
 * Incident : `.env` (clés Supabase service_role / anon) était suivi par git
 * sur un dépôt PUBLIC — les règles .gitignore ne s'appliquent pas aux
 * fichiers déjà suivis (`git rm --cached` requis). Ce test garantit qu'aucun
 * fichier de secrets ne retourne JAMAIS dans l'index.
 */
function trackedFiles(): string[] {
  try {
    const out = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() })
    return out.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    // Hors dépôt git (sandbox sans .git) : rien à vérifier.
    return []
  }
}

describe('hygiène git — secrets jamais suivis', () => {
  it('.env n\'est pas suivi (seules les variantes d\'exemple le sont)', () => {
    const tracked = trackedFiles()
    if (tracked.length === 0) return // pas un dépôt git : skip implicite
    expect(tracked).not.toContain('.env')
    expect(tracked).not.toContain('.env.local')
  })

  it('aucun fichier suivi ne ressemble à un magasin de secrets', () => {
    const tracked = trackedFiles()
    if (tracked.length === 0) return
    const suspects = tracked.filter((f) =>
      /^\.env$|^\.env\.\d+$|credentials|\.pem$|\.p12$|\.keystore$/i.test(f),
    )
    expect(suspects).toEqual([])
  })

  it('.env.example reste le modèle documenté (suivi, sans valeur réelle)', () => {
    const tracked = trackedFiles()
    if (tracked.length === 0) return
    expect(tracked).toContain('.env.example')
  })
})
