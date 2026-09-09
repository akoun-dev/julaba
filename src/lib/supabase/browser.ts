'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabasePublicEnv } from './env'
import type { Database } from './database.types'

export function createSupabaseBrowserClient() {
  const { url, anonKey } = supabasePublicEnv()
  return createBrowserClient<Database>(url, anonKey)
}
