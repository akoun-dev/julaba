import { describe, expect, it } from 'vitest'
import { isDemoAccountsAllowed, isMfaBypassAllowed } from '../environment'

describe('interrupteurs sensibles du back-office', () => {
  it('n’expose jamais les comptes de démonstration en production', () => {
    expect(isDemoAccountsAllowed({ NODE_ENV: 'production', BACKOFFICE_DEMO_ACCOUNTS: 'true' })).toBe(false)
    expect(isDemoAccountsAllowed({ NODE_ENV: 'development', BACKOFFICE_DEMO_ACCOUNTS: 'true' })).toBe(true)
    expect(isDemoAccountsAllowed({ NODE_ENV: 'development', BACKOFFICE_DEMO_ACCOUNTS: 'false' })).toBe(false)
  })

  it('n’autorise jamais le contournement MFA en production', () => {
    expect(isMfaBypassAllowed({ NODE_ENV: 'production', BACKOFFICE_MFA_DISABLED: 'true' })).toBe(false)
    expect(isMfaBypassAllowed({ NODE_ENV: 'development', BACKOFFICE_MFA_DISABLED: 'true' })).toBe(true)
    expect(isMfaBypassAllowed({ NODE_ENV: 'test', BACKOFFICE_MFA_DISABLED: 'false' })).toBe(false)
  })
})
