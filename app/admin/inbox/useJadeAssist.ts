'use client'

// useJadeAssist — V1.4 Jade Staff Communication Intelligence.
//
// Headless client for the two new structured Jade endpoints
// (jade-assist, jade-suggest-actions). No JSX lives here — panel/menu
// chrome is built on top of this hook.
//
// RACE/STALE-RESPONSE SAFETY (owner decision 12, release-blocking): a
// result generated for one conversation must NEVER surface for a
// different one. Uses the exact same generation-counter pattern already
// proven in this codebase for this exact class of problem — V1.3's Quote
// Builder `liveOpSeqRef` and the existing Staff Jade copilot's
// `useStaffJadeChat` `epochRef`. The epoch bumps whenever `conversationId`
// changes; any in-flight request captured against a stale epoch discards
// its result on resolution (checked both after the fetch AND after
// `res.json()`, since either await can cross a conversation switch) and
// never touches component state for a conversation that is no longer
// current.
//
// SESSION EXPIRY: follows the exact convention already used everywhere
// else in the Inbox (app/admin/inbox/page.tsx) — a 401 redirects to
// /admin/login rather than showing a generic "Jade unavailable" error.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type JadeTextOperation =
  | 'fix_writing' | 'professionalize' | 'friendly' | 'formal' | 'shorten' | 'clarify'
  | 'translate' | 'professional_translate'
export type JadeContextOperation = 'draft_reply' | 'summarize'

export interface JadeAssistSuccess {
  ok: true
  suggestion: string
  operation: string
  warnings: string[]
  protectedFactsPreserved?: boolean
  grounding?: {
    usedConversation: boolean
    usedClientContext: boolean
    usedQuoteState: boolean
    usedPaymentState: boolean
    usedVisaState: boolean
    usedItineraryState: boolean
  }
}
export interface JadeAssistFailure {
  ok: false
  code: string
  error: string
}
export type JadeAssistResult = JadeAssistSuccess | JadeAssistFailure

export type JadeActionType = 'CREATE_QUOTE' | 'REQUEST_PAYMENT' | 'VISA_FORM' | 'ITINERARY_REQUEST'
export interface JadeSuggestedAction {
  type: JadeActionType
  fields: Record<string, unknown>
  requiresConfirmation: true
}
export interface JadeSuggestActionsSuccess {
  ok: true
  identityResolution: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  actions: JadeSuggestedAction[]
}
export type JadeSuggestActionsResult = JadeSuggestActionsSuccess | JadeAssistFailure

export interface ConversationTurnInput { role: 'client' | 'agent'; text: string }

interface RunTextOperationInput {
  operation: JadeTextOperation
  text: string
  targetLanguage?: string
}
interface RunContextOperationInput {
  operation: JadeContextOperation
  recentMessages: ConversationTurnInput[]
  channel?: string
  contactName?: string
  staffNote?: string
}

export interface UseJadeAssistOptions {
  conversationId: number | null
}

export interface UseJadeAssistResult {
  busy: boolean
  error: string | null
  clearError: () => void
  runTextOperation: (input: RunTextOperationInput) => Promise<JadeAssistResult | null>
  runContextOperation: (input: RunContextOperationInput) => Promise<JadeAssistResult | null>
  runSuggestActions: (input: { recentMessages: ConversationTurnInput[]; channel?: string; contactName?: string }) => Promise<JadeSuggestActionsResult | null>
}

export function useJadeAssist({ conversationId }: UseJadeAssistOptions): UseJadeAssistResult {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const epochRef = useRef(0)
  const prevConversationIdRef = useRef<number | null>(conversationId)

  // Bump the epoch whenever the conversation changes — any request already
  // in flight for the PREVIOUS conversation is now stale and must discard
  // its result rather than surface in the new one. Also reset `busy` here:
  // a stale request's own `finally` block intentionally skips clearing
  // `busy` once its epoch no longer matches (so it can't clobber a NEWER
  // request's loading state) — but that means switching conversations
  // mid-request would otherwise leave `busy` stuck true forever, since no
  // other code path resets it. This is the one place that's safe to do so:
  // a conversation switch means whatever was loading is no longer relevant
  // to what's on screen.
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      epochRef.current += 1
      prevConversationIdRef.current = conversationId
      setError(null)
      setBusy(false)
    }
  }, [conversationId])

  const clearError = useCallback(() => setError(null), [])

  const post = useCallback(async (path: string, body: Record<string, unknown>): Promise<{ epoch: number; data: Record<string, unknown> } | null> => {
    if (conversationId == null) return null
    const epoch = epochRef.current
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (epochRef.current !== epoch) return null // conversation changed while the request was in flight

      if (res.status === 401) {
        router.push('/admin/login')
        return null
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (epochRef.current !== epoch) return null // conversation changed while parsing the response

      if (!res.ok || data.ok === false) {
        const message = typeof data.error === 'string' ? data.error : "Jade couldn't complete this request. Your original message has not been changed."
        setError(message)
        return { epoch, data: { ok: false, code: data.code ?? 'UNKNOWN', error: message } }
      }
      return { epoch, data }
    } catch {
      if (epochRef.current === epoch) {
        setError("Jade is unavailable right now. Your original message has not been changed.")
      }
      return null
    } finally {
      if (epochRef.current === epoch) setBusy(false)
    }
  }, [conversationId, router])

  const runTextOperation = useCallback(async (input: RunTextOperationInput): Promise<JadeAssistResult | null> => {
    const result = await post('jade-assist', { ...input })
    if (!result) return null
    return result.data as unknown as JadeAssistResult
  }, [post])

  const runContextOperation = useCallback(async (input: RunContextOperationInput): Promise<JadeAssistResult | null> => {
    const result = await post('jade-assist', { ...input })
    if (!result) return null
    return result.data as unknown as JadeAssistResult
  }, [post])

  const runSuggestActions = useCallback(async (input: { recentMessages: ConversationTurnInput[]; channel?: string; contactName?: string }): Promise<JadeSuggestActionsResult | null> => {
    const result = await post('jade-suggest-actions', { ...input })
    if (!result) return null
    return result.data as unknown as JadeSuggestActionsResult
  }, [post])

  return { busy, error, clearError, runTextOperation, runContextOperation, runSuggestActions }
}
