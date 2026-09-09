function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`)
  return value
}

export function supabasePublicEnv() {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function supabaseServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY')
}
