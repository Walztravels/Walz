/**
 * Webhook idempotency ledger (INBOX-0S.4).
 *
 * webhook_events (see prisma/migrations/inbox_0s4_idempotency.sql) holds
 * one row per (provider, provider event id) with a DB UNIQUE constraint.
 * `claimWebhookEvent` inserts with conflict-ignore: the FIRST delivery
 * claims the event and processes it; retries and concurrent duplicates
 * fail to claim and skip side effects. On a processing failure the claim
 * is released so a provider retry can safely reprocess.
 *
 * Degradation: if the table does not exist yet (migration not run) the
 * claim reports 'unavailable' and callers proceed exactly as before the
 * release — never blocking live traffic on the migration.
 */

interface SupabaseLike {
  from(table: string): {
    upsert(values: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }): {
      select(cols: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
    }
    delete(): {
      eq(col: string, v: string): {
        eq(col: string, v: string): PromiseLike<{ error: { message: string } | null }>
      }
    }
  }
}

export type ClaimResult = 'claimed' | 'duplicate' | 'unavailable'

export async function claimWebhookEvent(
  supabase: SupabaseLike,
  provider: string,
  eventId:  string,
): Promise<ClaimResult> {
  try {
    const { data, error } = await supabase
      .from('webhook_events')
      .upsert(
        { provider, event_id: eventId },
        { onConflict: 'provider,event_id', ignoreDuplicates: true },
      )
      .select('id')
    if (error) {
      console.warn(`[webhook-dedupe] ${provider}: ledger unavailable (${error.message.slice(0, 80)}) — proceeding without dedupe`)
      return 'unavailable'
    }
    return (data?.length ?? 0) > 0 ? 'claimed' : 'duplicate'
  } catch (e) {
    console.warn(`[webhook-dedupe] ${provider}: ledger error — proceeding without dedupe`, e instanceof Error ? e.message.slice(0, 80) : '')
    return 'unavailable'
  }
}

/** Release a claim after a processing failure so the provider's retry can reprocess. */
export async function releaseWebhookEvent(
  supabase: SupabaseLike,
  provider: string,
  eventId:  string,
): Promise<void> {
  try {
    await supabase.from('webhook_events').delete().eq('provider', provider).eq('event_id', eventId)
  } catch { /* the row expires from relevance; a stuck claim only suppresses one retry */ }
}
