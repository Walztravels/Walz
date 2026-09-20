/**
 * Walz Team Hub V1 — TwiML webhook for INTERNAL staff-to-staff calling.
 *
 * Configure this URL as the Voice Request URL on the NEW, isolated
 * TWILIO_TEAMHUB_TWIML_APP_SID TwiML Application (see
 * app/api/team/twilio/token/route.ts's header for the full env-var story).
 * This is a completely separate configuration from app/api/twilio/voice —
 * do not merge, share, or cross-call any client-calling logic here.
 *
 * Two dial shapes, branched on the conversation's own `type`:
 *   - DM: direct 1:1 <Dial><Client> to a specific callee — unchanged from
 *     the original V1 design.
 *   - GROUP/CHANNEL: <Dial><Conference> into a server-generated,
 *     never-client-visible conference name resolved from the matching
 *     TeamCallRecord row — ANY current member may join (there is no fixed
 *     "callee"; whoever started the call is just the audit-trail
 *     originator, not an ongoing gatekeeper).
 *
 * Every request, regardless of shape:
 *   (a) verifies the request actually came from Twilio via X-Twilio-Signature
 *       (lib/webhooks/verify.ts — the same mechanism already proven at
 *       app/api/webhooks/twilio-whatsapp/route.ts). Fails closed if
 *       TWILIO_AUTH_TOKEN is unset or the signature doesn't verify.
 *   (b) trusts caller identity ONLY from Twilio's own signed `From` param
 *       (never any other client-suppliable field) — expected shape
 *       "client:staff-<callerId>";
 *   (c) has its own rate limit, independent of the REST /calls route's own.
 *   (d) REQUIRES ConversationId + CallRecordId — a call arriving without
 *       either is never legitimate (every real call is placed through
 *       useTeamCallDevice.ts's placeCall/startGroupCall, which always has
 *       both in hand from the REST route's response first).
 *   (e) verifies the caller is currently active Staff AND a current,
 *       active member of that TeamConversation — membership can have
 *       changed since the call was initiated a moment earlier, and this
 *       is the exact re-check-at-join moment the product spec requires:
 *       a staff member removed from the conversation AFTER a call started
 *       cannot use a stale callId/conferenceId to newly join, because this
 *       check runs fresh, every single time, right before <Dial>.
 *   (f) REQUIRES CallRecordId to reference a REAL, non-terminal
 *       TeamCallRecord for THIS conversation — the ONLY way such a row can
 *       exist is via the properly-gated, rate-limited REST route
 *       (lib/team/calls.ts's createCallRecord/startOrJoinGroupCall are
 *       called from nowhere else), so this transitively re-enforces
 *       everything that route already checks (DM-only-vs-group shape,
 *       rate limit, concurrency) without duplicating that logic here.
 *   (g) for GROUP/CHANNEL: the conference name is read from THIS row,
 *       server-side, and NEVER accepted as a client-supplied parameter —
 *       "knowing a room/conference identifier" is never itself sufficient
 *       to join; only passing checks (e) and (f) above is.
 *
 * Fails CLOSED on any check failure: returns a generic "could not be
 * connected" TwiML (Twilio itself receives this, not the caller directly,
 * but we still never leak *why*). The real reason is only ever logged
 * server-side via console.warn. A malformed (non-form-encoded) body also
 * fails closed via this same path rather than throwing an uncaught 500.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTwilioSignature, externalWebhookUrl } from '@/lib/webhooks/verify'

export const dynamic = 'force-dynamic'

const STAFF_CLIENT_PREFIX = 'client:staff-'
const DM_ACTIVE_CALL_STATUSES = ['INITIATING', 'RINGING']
const GROUP_ACTIVE_CALL_STATUSES = ['STARTED', 'ACTIVE']

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

/** Generic, information-free failure response — used for EVERY check failure, never customized per-reason. */
function failClosed() {
  return twiml('<Say voice="Polly.Amy-Neural">This call could not be connected.</Say><Hangup/>')
}

export async function POST(req: NextRequest) {
  // Parse defensively first — a malformed body must fail closed, never throw.
  let form: URLSearchParams
  try {
    const text = await req.text()
    form = new URLSearchParams(text)
  } catch (e) {
    console.warn('[team/twilio/voice] rejected: could not parse request body', e)
    return failClosed()
  }

  // (a) Verify this request genuinely came from Twilio before trusting ANY
  // of its fields — fails closed if unconfigured, exactly like the
  // established twilio-whatsapp webhook pattern.
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
  if (!authToken) {
    console.warn('[team/twilio/voice] rejected: TWILIO_AUTH_TOKEN not configured — failing closed')
    return failClosed()
  }
  const url = externalWebhookUrl(process.env.TWILIO_TEAMHUB_WEBHOOK_URL, req.headers, '/api/team/twilio/voice')
  const params: Record<string, string> = {}
  form.forEach((v, k) => { params[k] = v })
  if (!url || !verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.warn('[team/twilio/voice] rejected: invalid or missing X-Twilio-Signature')
    return failClosed()
  }

  // Identity comes ONLY from Twilio's own (now signature-verified) `From`
  // param — never any other client-suppliable field.
  const from           = form.get('From') ?? ''
  const calleeStaffId  = form.get('CalleeStaffId') ?? '' // DM only
  const conversationId = form.get('ConversationId') ?? ''
  const callRecordId   = form.get('CallRecordId') ?? ''

  // (c) Defense-in-depth rate limit, independent of the REST /calls route's
  // own limit.
  const rl = rateLimit({ key: `team-call-voice-webhook:${from}`, limit: 30, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    console.warn('[team/twilio/voice] rejected: rate limit exceeded', { from })
    return failClosed()
  }

  if (!from.startsWith(STAFF_CLIENT_PREFIX)) {
    console.warn('[team/twilio/voice] rejected: From is not a Team Hub staff client identity', { from })
    return failClosed()
  }
  const callerId = from.slice(STAFF_CLIENT_PREFIX.length)

  if (!conversationId) {
    console.warn('[team/twilio/voice] rejected: missing ConversationId param', { callerId })
    return failClosed()
  }

  if (!callRecordId) {
    console.warn('[team/twilio/voice] rejected: missing CallRecordId param', { callerId })
    return failClosed()
  }

  try {
    const conversation = await prisma.teamConversation.findUnique({ where: { id: conversationId }, select: { type: true } })
    if (!conversation) {
      console.warn('[team/twilio/voice] rejected: conversation not found', { conversationId })
      return failClosed()
    }

    const caller = await prisma.staff.findUnique({ where: { id: callerId }, select: { id: true, isActive: true } })
    if (!caller?.isActive) {
      console.warn('[team/twilio/voice] rejected: caller is missing/inactive', { callerId })
      return failClosed()
    }

    // (e) Caller must be a CURRENT, active member — re-checked fresh, every
    // time, regardless of call shape.
    const callerMember = await prisma.teamConversationMember.findFirst({ where: { conversationId, staffId: callerId, leftAt: null } })
    if (!callerMember) {
      console.warn('[team/twilio/voice] rejected: caller is not an active member of the conversation', { conversationId, callerId })
      return failClosed()
    }

    if (conversation.type === 'GROUP' || conversation.type === 'CHANNEL') {
      // (f)+(g): CallRecordId must reference a real, non-terminal call for
      // THIS conversation — no callerId/participant restriction beyond
      // "is a current member" (checked above), since any member may join a
      // group call, not only whoever started it.
      const callRecord = await prisma.teamCallRecord.findFirst({
        where: { id: callRecordId, conversationId, status: { in: GROUP_ACTIVE_CALL_STATUSES } },
        select: { conferenceName: true },
      })
      if (!callRecord?.conferenceName) {
        console.warn('[team/twilio/voice] rejected: no matching, active group TeamCallRecord', { callRecordId, conversationId, callerId })
        return failClosed()
      }

      const forwardedParams =
        `<Parameter name="CallRecordId" value="${xmlEscape(callRecordId)}"/>` +
        `<Parameter name="ConversationId" value="${xmlEscape(conversationId)}"/>`

      // record="do-not-record" is Twilio's default for <Conference>, set
      // explicitly here as defense-in-depth against that default ever
      // changing — Team Hub V1 has NO call-recording feature, full stop.
      return twiml(
        `<Dial><Conference record="do-not-record" endConferenceOnExit="false">${xmlEscape(callRecord.conferenceName)}${forwardedParams}</Conference></Dial>`,
      )
    }

    // DM path — unchanged from the original 1:1 design.
    if (!calleeStaffId) {
      console.warn('[team/twilio/voice] rejected: missing CalleeStaffId param for a DM call', { callerId })
      return failClosed()
    }
    if (callerId === calleeStaffId) {
      console.warn('[team/twilio/voice] rejected: caller attempted to call themselves', { callerId })
      return failClosed()
    }

    const callee = await prisma.staff.findUnique({ where: { id: calleeStaffId }, select: { id: true, isActive: true } })
    if (!callee?.isActive) {
      console.warn('[team/twilio/voice] rejected: callee is missing/inactive', { callerId, calleeStaffId })
      return failClosed()
    }
    const calleeMember = await prisma.teamConversationMember.findFirst({ where: { conversationId, staffId: calleeStaffId, leftAt: null } })
    if (!calleeMember) {
      console.warn('[team/twilio/voice] rejected: callee is not an active member of the conversation', { conversationId, callerId, calleeStaffId })
      return failClosed()
    }

    const callRecord = await prisma.teamCallRecord.findFirst({
      where: { id: callRecordId, conversationId, callerId, status: { in: DM_ACTIVE_CALL_STATUSES } },
      select: { participantIds: true },
    })
    const recordedParticipants = Array.isArray(callRecord?.participantIds)
      ? (callRecord!.participantIds as unknown as string[])
      : []
    if (!callRecord || !recordedParticipants.includes(calleeStaffId)) {
      console.warn('[team/twilio/voice] rejected: no matching, still-initiating TeamCallRecord for this caller/conversation/callee', {
        callRecordId, conversationId, callerId, calleeStaffId,
      })
      return failClosed()
    }

    const forwardedParams =
      `<Parameter name="CallRecordId" value="${xmlEscape(callRecordId)}"/>` +
      `<Parameter name="ConversationId" value="${xmlEscape(conversationId)}"/>`

    return twiml(
      `<Dial><Client><Identity>staff-${xmlEscape(calleeStaffId)}</Identity>${forwardedParams}</Client></Dial>`,
    )
  } catch (e) {
    console.warn('[team/twilio/voice] rejected: error during authorization checks', e)
    return failClosed()
  }
}
