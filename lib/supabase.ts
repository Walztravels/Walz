import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = 'walz-images'

/**
 * Returns a Supabase admin client.
 * Called lazily inside route handlers so missing env vars only fail
 * at request time — not at build/module-load time.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, key)
}

/** Browser-safe anon client (returns null when not configured) */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}
