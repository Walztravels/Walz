/**
 * WhatsApp Broadcast V1 — the Meta Cloud API template sender.
 *
 * The ONLY place this feature talks to Meta. Same endpoint, same API
 * version and same auth header as the existing 1:1 Inbox reply path
 * (app/api/admin/messages/send/route.ts) — but a `type:'template'` body,
 * which that path has never supported.
 *
 * ON NOT EXTRACTING A SHARED SEND HELPER. The 1:1 path's send is a
 * `type:'text'` call embedded in a Supabase-backed request handler; this
 * one is a `type:'template'` call with error classification and retry
 * semantics for a Prisma-backed queue. The only genuinely common part is
 * the URL template and the Bearer header — ~3 lines. Extracting a shared
 * sender would mean editing the protected, working 1:1 reply path for no
 * behavioural gain, so it was NOT done. (Signature verification, which IS
 * substantial, was ALREADY shared before this change: both webhook paths
 * call verifyMetaSignature() from lib/webhooks/verify.ts, and the
 * broadcast status-callback handling reuses it unchanged.)
 */

import { getMetaSendCredentials } from '@/lib/whatsapp/config'
import { buildTemplatePayload } from './template'

const GRAPH_VERSION = 'v20.0'

export type SendOutcome =
  | { ok: true; metaMessageId: string }
  /** Retrying may succeed — network blip, 429, 5xx, Meta rate limit. */
  | { ok: false; kind: 'TRANSIENT'; code: string; reason: string }
  /** Retrying can never succeed — bad number, unapproved template, 401. */
  | { ok: false; kind: 'PERMANENT'; code: string; reason: string }

/**
 * Meta error codes that are permanent for THIS recipient/template.
 * Everything not listed is treated as transient and retried, because
 * losing a message to an unrecognised transient error is worse than one
 * extra attempt — and attempts are hard-capped anyway.
 *
 *   131026 message undeliverable (not a WhatsApp user)
 *   131051 unsupported message type
 *   132000 template param count mismatch
 *   132001 template does not exist / not approved in this language
 *   132005 template text too long
 *   132007 template format character policy violation
 *   132012 template parameter format mismatch
 *   132015 template is paused
 *   132016 template is disabled
 *   133010 phone number not registered
 *   100    invalid parameter
 *   190    access token expired/invalid  (permanent until an operator acts)
 *   10     permission denied
 */
const PERMANENT_META_CODES = new Set([
  '100', '10', '190',
  '131026', '131051',
  '132000', '132001', '132005', '132007', '132012', '132015', '132016',
  '133010',
])

/** Meta codes that explicitly mean "slow down". Always transient. */
const RATE_LIMIT_CODES = new Set(['4', '80007', '130429', '131048', '131056'])

export function classifyMetaError(input: {
  httpStatus: number
  code?: string | number | null
  message?: string | null
}): { kind: 'TRANSIENT' | 'PERMANENT'; code: string; reason: string } {
  const code = input.code === undefined || input.code === null ? '' : String(input.code)
  const reason = (input.message ?? '').slice(0, 300) || `HTTP ${input.httpStatus}`

  if (RATE_LIMIT_CODES.has(code)) return { kind: 'TRANSIENT', code, reason }
  if (PERMANENT_META_CODES.has(code)) return { kind: 'PERMANENT', code, reason }

  // 429 and 5xx are always worth another attempt; 401/403 are not.
  if (input.httpStatus === 429 || input.httpStatus >= 500) return { kind: 'TRANSIENT', code, reason }
  if (input.httpStatus === 401 || input.httpStatus === 403) return { kind: 'PERMANENT', code, reason }

  // Unknown 4xx with an unknown code: bias to transient, bounded by
  // MAX_SEND_ATTEMPTS rather than by guessing Meta's taxonomy.
  return { kind: 'TRANSIENT', code, reason }
}

/**
 * Dispatch ONE approved template message.
 *
 * There is no `text` branch and no fallback: if the template is rejected,
 * this returns a failure and the recipient is recorded as failed. Nothing
 * is ever sent as free-form text.
 */
export async function sendBroadcastTemplate(input: {
  waId: string
  templateName: string
  templateLanguage: string
  paramValues: string[]
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}): Promise<SendOutcome> {
  const creds = getMetaSendCredentials()
  if (!creds) {
    return {
      ok: false,
      kind: 'PERMANENT',
      code: 'NOT_CONFIGURED',
      reason: 'WhatsApp send credentials are not configured on the server.',
    }
  }

  const payload = buildTemplatePayload({
    to: input.waId,
    templateName: input.templateName,
    templateLanguage: input.templateLanguage,
    paramValues: input.paramValues,
  })

  const doFetch = input.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    // Network-level failure — never permanent.
    return { ok: false, kind: 'TRANSIENT', code: 'NETWORK', reason: (e as Error)?.message?.slice(0, 300) ?? 'fetch failed' }
  }

  let data: { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string; error_subcode?: number } } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* Meta returned a non-JSON body; fall through to the status check. */
  }

  if (!res.ok || data.error) {
    return {
      ok: false,
      ...classifyMetaError({
        httpStatus: res.status,
        code: data.error?.code,
        message: data.error?.message,
      }),
    }
  }

  const metaMessageId = data.messages?.[0]?.id
  if (!metaMessageId) {
    // A 200 with no message id is not a send we can track or deduplicate.
    return { ok: false, kind: 'TRANSIENT', code: 'NO_MESSAGE_ID', reason: 'Meta returned no message id.' }
  }

  return { ok: true, metaMessageId }
}
