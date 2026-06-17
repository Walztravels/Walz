/**
 * Creates the Supabase storage buckets required by upload routes.
 * Run once: node scripts/create-buckets.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = resolve(__dirname, '../.env.local')

// Parse .env.local manually (no dotenv dependency needed)
const env = {}
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=')
    if (k && !k.startsWith('#')) env[k.trim()] = rest.join('=').trim()
  })
} catch {
  console.error('Could not read .env.local — make sure you run this from the project root.')
  process.exit(1)
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

const BUCKETS = [
  { id: 'visa-documents',   public: false, description: 'Bank statements & visa docs uploaded by clients/admin' },
  { id: 'portal-documents', public: false, description: 'General documents uploaded via client portal' },
  { id: 'walz-documents',   public: false, description: 'Documents uploaded via admin portal applications flow' },
  { id: 'walz-images',      public: true,  description: 'Public images (hero slides, package photos, etc.)' },
]

for (const bucket of BUCKETS) {
  const { data, error } = await supabase.storage.createBucket(bucket.id, {
    public: bucket.public,
  })

  if (error) {
    if (error.message?.toLowerCase().includes('already exists') ||
        error.message?.toLowerCase().includes('duplicate')) {
      console.log(`✓ ${bucket.id} — already exists`)
    } else {
      console.error(`✗ ${bucket.id} — ${error.message}`)
    }
  } else {
    console.log(`✓ ${bucket.id} — created (public: ${bucket.public})`)
  }
}

console.log('\nDone.')
