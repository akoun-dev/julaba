import { describe, expect, it } from 'vitest'
import { isDemoAccountsAllowed } from '../environment'

describe('interrupteurs sensibles du back-office', () => {
  it('n’expose jamais les comptes de démonstration en production', () => {
    expect(isDemoAccountsAllowed({ NODE_ENV: 'production', BACKOFFICE_DEMO_ACCOUNTS: 'true' })).toBe(false)
    expect(isDemoAccountsAllowed({ NODE_ENV: 'development', BACKOFFICE_DEMO_ACCOUNTS: 'true' })).toBe(true)
    expect(isDemoAccountsAllowed({ NODE_ENV: 'development', BACKOFFICE_DEMO_ACCOUNTS: 'false' })).toBe(false)
  })
})
