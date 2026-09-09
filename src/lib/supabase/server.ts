import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabasePublicEnv } from './env'
import type { Database } from './database.types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = supabasePublicEnv()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(values) {
        try {
          for (const { name, value, options } of values) cookieStore.set(name, value, options)
        } catch {
          // Server Components cannot always mutate cookies. Middleware refreshes
          // the session; this fallback keeps reads safe in those components.
        }
      },
    },
  })
}
