import { getSupabaseAdmin } from '@/lib/supabase'

export type JadeIntent = 'booking' | 'group_trip' | 'support' | null

export interface JadeSessionState {
  intent: JadeIntent
  lastMessage: string
  conversationHistory: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
  agentActive?: boolean   // true = human agent has taken over; Jade must stay silent
  agentMessages?: Array<{  // buffered agent replies waiting for the website visitor to poll
    content:   string
    agentName: string
    timestamp: string
  }>
  bookingContext: {
    searchParams: {
      origin:        string
      destination:   string
      departureDate: string
      returnDate:    string | null
      passengers:    number
      cabinClass:    string
    } | null
    offersReturned:  boolean
    selectedOfferId: string | null
    awaitingConfirm: boolean
    confirmedOrderId: string | null
    topOfferSummary:  string | null
  } | null
  groupContext: {
    sessionId:   string | null
    sessionName: string | null
    role:        'creator' | 'member' | null
    currentStep: 'creating' | 'collecting' | 'synthesising' | 'voting' | 'complete' | null
    memberCount: number | null
    inviteLinks: string[] | null
  } | null
}

export async function saveJadeSession(
  chatwootConversationId: string,
  state: JadeSessionState,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('JadeSession')
      .upsert(
        {
          chatwootConversationId,
          intent:    state.intent,
          state,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: 'chatwootConversationId' },
      )
  } catch (err) {
    console.error('[jade-session] save error:', err)
  }
}

export async function loadJadeSession(
  chatwootConversationId: string,
): Promise<JadeSessionState | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('JadeSession')
      .select('state')
      .eq('chatwootConversationId', chatwootConversationId)
      .maybeSingle()
    return data ? (data.state as JadeSessionState) : null
  } catch {
    return null
  }
}

export async function markHandover(chatwootConversationId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('JadeSession')
      .update({ handoverAt: new Date().toISOString() })
      .eq('chatwootConversationId', chatwootConversationId)
  } catch {}
}

export async function markResumed(chatwootConversationId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('JadeSession')
      .update({ resumedAt: new Date().toISOString() })
      .eq('chatwootConversationId', chatwootConversationId)
  } catch {}
}
