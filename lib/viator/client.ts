// Re-exports from the canonical location (lib/activities/providers/viator/client.ts)
// Keeping this shim so existing imports (e.g. app/api/admin/viator-test/route.ts) continue to resolve.
export { viatorHeaders, viatorPost, viatorGet, viatorTestConnection } from '@/lib/activities/providers/viator/client'
