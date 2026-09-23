/**
 * app/api/webhooks/twilio-whatsapp/route.ts
 *
 * Twilio inbound WhatsApp webhook.
 * Configure this URL in Twilio console → Messaging → Services → WhatsApp sender → Inbound URL
 * (or per phone number → Messaging Configuration → "A Message Comes In")
 *
 * Routing logic:
 *   1. If the sender's phone matches an ACTIVE visa application with an existing thread → route there.
 *   2. If phone is absent but BSUID matches a previously-stored application → route there.
 *   3. Otherwise → falls through to general inbound (no action here; Chatwoot handles via its own webhook).
 *
 * ⚠️  Known limitation: if a client with an active visa application texts about something
 *     unrelated (a flight, a general question), this logic routes it to the visa thread
 *     because it cannot distinguish intent from the phone number alone. Acceptable for v1
 *     given that visa clients' WhatsApp contact is dominated by visa correspondence during
 *     an active process. A 48-hour "active conversation window" would be the next refinement.
 *
 * ⚠️  BSUID gap: a brand-new applicant who adopted a Meta username BEFORE their very first
 *     contact with Walz Travels arrives with no prior BSUID on file. This first message
 *     cannot be auto-routed. However, when staff initiate a WhatsApp thread from the visa
 *     application page, the delivery receipt carries the client's BSUID — captured and stored
 *     so every subsequent message from that client routes correctly.
 *
 * Required env var:
 *   TWILIO_WEBHOOK_AUTH_TOKEN  — set to your Twilio Auth Token for signature validation
 *                                (can reuse TWILIO_AUTH_TOKEN)
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { normalisePhone, sendWhatsAppBody } from '@/lib/twilio-whatsapp'
import { ACTIVE_VISA_STATUSES } from '@/lib/visa-constants'
import { sendVisaWhatsAppNotification } from '@/lib/email-staff-notification'
import { verifyTwilioSignature, externalWebhookUrl } from '@/lib/webhooks/verify'
import { isOptOutKeyword } from '@/lib/whatsapp/opt-out-keywords'
import { WHATSAPP_UNSUBSCRIBE_CONFIRMATION } from '@/lib/whatsapp/preferences-disclosure'
import { normalizePhoneE164 } from '@/lib/identity/normalize'

export const dynamic = 'force-dynamic'

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export async function POST(req: NextRequest) {
  // ── Authentication (INBOX-0S.4) — X-Twilio-Signature over the exact
  // external URL + sorted POST params. FAIL CLOSED when no auth token is
  // configured. TWILIO_WEBHOOK_URL pins the console-configured URL; the
  // fallback reconstructs it from forwarded headers, never req.url's host.
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? process.env.TWILIO_WEBHOOK_AUTH_TOKEN ?? '').trim()
  if (!authToken) {
    console.error('[twilio-wa] BLOCKED: TWILIO_AUTH_TOKEN not configured — failing closed')
    return new Response('', { status: 403 })
  }

  // Twilio sends application/x-www-form-urlencoded
  let form: URLSearchParams
  try {
    const text = await req.text()
    form = new URLSearchParams(text)
  } catch {
    return new Response('', { status: 400 })   // permanent — malformed body
  }

  const url = externalWebhookUrl(process.env.TWILIO_WEBHOOK_URL, req.headers, '/api/webhooks/twilio-whatsapp')
  const params: Record<string, string> = {}
  form.forEach((v, k) => { params[k] = v })
  if (!url || !verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), authToken)) {
    console.warn('[twilio-wa] BLOCKED: invalid X-Twilio-Signature')
    return new Response('', { status: 403 })
  }

  // Extract fields from Twilio's payload
  const rawFrom  = form.get('From') ?? ''                    // e.g. "whatsapp:+447949448680"
  const rawTo    = form.get('To') ?? ''                       // the Walz WhatsApp number that received this
  const body     = form.get('Body') ?? ''
  const waSid    = form.get('MessageSid') ?? undefined
  // WaId carries the BSUID when Meta WhatsApp usernames are in use
  const bsuid    = form.get('WaId') ?? undefined

  const fromPhone = rawFrom.replace(/^whatsapp:/i, '').trim()
  const toPhone   = rawTo.replace(/^whatsapp:/i, '').trim()

  // ── Opt-out (WhatsApp Broadcast V1.2.1 / V1.2.1 STOP visibility fix) ───
  // Checked AFTER signature verification (never before — an unsigned STOP
  // must never change consent) and BEFORE the general visa-thread dedup
  // below (opt-out has ITS OWN dedup, scoped to the confirmation reply —
  // see handleWhatsAppOptOut()'s own doc comment), because the marketing
  // preference write applies to the CANONICAL NUMBER regardless of which
  // Walz WhatsApp context (marketing, visa, general) received it.
  //
  // IMPORTANT: this does NOT make the inbound message invisible. A STOP
  // that matches an existing visa thread is still persisted there via the
  // normal message-history mechanism — see handleWhatsAppOptOut() — so
  // staff can see the client sent it. It is never routed to Jade (this
  // route has no Jade integration at all — Jade's auto-reply lives only
  // in the separate legacy Meta webhook, app/api/webhooks/whatsapp/
  // route.ts) and it never changes the application's status.
  if (body && isOptOutKeyword(body)) {
    await handleWhatsAppOptOut({ fromPhone, toPhone, body, messageId: waSid, bsuid })
    return new Response(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  // Idempotency (0S.4): a Twilio retry with the same MessageSid must not
  // duplicate the visa-thread message or re-email staff.
  if (waSid) {
    const dup = await prisma.visaApplicationMessage
      .findFirst({ where: { twilioSid: waSid }, select: { id: true } })
      .catch(() => null)
    if (dup) {
      console.log('[twilio-wa] duplicate MessageSid skipped')
      return new Response(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } })
    }
  }

  try {
    await routeInboundWhatsApp({ fromPhone: fromPhone || undefined, bsuid, body, twilioSid: waSid })
  } catch (e) {
    // Transient failure: 500 → Twilio retries; the SID dedupe (plus the DB
    // unique index) makes that retry safe.
    console.error('[twilio-wa] processing error:', e instanceof Error ? e.message : e)
    return new Response('', { status: 500 })
  }

  // Twilio expects TwiML or an empty 200 response
  return new Response(TWIML_OK, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ── Opt-out (WhatsApp Broadcast V1.2.1) ─────────────────────────────────────────
/**
 * Record an inbound STOP/UNSUBSCRIBE as an immediate, canonical-number
 * WhatsApp opt-out, and send a fixed confirmation from the SAME Walz
 * number the person actually messaged. This is the SAME WhatsAppConsent
 * table decideEligibility() already reads for every broadcast source
 * (Lead, VisaApplication, manual) — writing OPTED_OUT here excludes the
 * number from ALL of them immediately, regardless of which source(s)
 * later try to select it (see lib/whatsapp/broadcast/consent.ts and
 * audience-multi.ts: the eligibility lookup is one consent row per
 * canonical number, never per source, so this override cannot be
 * bypassed by re-adding the number a different way — the pre-dispatch
 * recheck in lib/whatsapp/broadcast/processor.ts also re-reads this same
 * table immediately before every send).
 *
 * ── PROVIDER-LEVEL OPT-OUT, UNDERSTOOD AND NOT CONTRADICTED ─────────────
 * WhatsApp/Meta ALSO enforces opt-out at the platform level: once a user
 * blocks a business or the business's number is paused for policy
 * reasons, Twilio's own send attempt fails (see sender.ts's
 * PERMANENT_TWILIO_CODES, e.g. 21610 "recipient opted out"). Our local
 * WhatsAppConsent state is a STRICTER, EARLIER gate — it can only ever
 * ADD an exclusion Twilio/WhatsApp did not already know about (a person
 * who never blocked the number but did text STOP), never remove one
 * Twilio/WhatsApp enforces; a provider-level block still independently
 * prevents delivery even if our own row were somehow wrong. The two
 * layers can never contradict each other in the direction that matters
 * (over-sending) — only in the safe direction (both agree to exclude, or
 * only the provider knows to exclude and the send simply fails).
 *
 * Never throws to the caller — a failure here must not break the
 * webhook's 200/TwiML response to Twilio.
 *
 * ── V1.2.1 STOP VISIBILITY FIX ───────────────────────────────────────────
 * Marketing opt-out and operational (visa) conversation visibility are
 * kept STRICTLY SEPARATE, and are performed independently — including
 * under partial failure, not just on the happy path (step 2 below is
 * wrapped in its own try/catch specifically so it can never take step 3
 * down with it):
 *
 *  1. The WhatsAppConsent write above is UNCONDITIONAL — it happens
 *     regardless of whether this number has a visa thread, and before
 *     anything else, so it is always in place before any future Broadcast
 *     eligibility decision reads it.
 *  2. If (and only if) this sender matches an existing active visa
 *     application thread, the inbound STOP/UNSUBSCRIBE text is persisted
 *     via the SAME VisaApplicationMessage mechanism a normal inbound
 *     message uses (see findActiveVisaThread()/the twilioSid dedup
 *     pattern below, copied from routeInboundWhatsApp() rather than
 *     duplicated with different semantics) — so staff can see the client
 *     sent it. This is a plain message-history write: it does NOT call
 *     Jade (this route has no Jade integration to call), does NOT touch
 *     VisaApplication.status, and does NOT notify the assigned agent by
 *     email the way a normal inbound message does — a "the client
 *     unsubscribed from marketing" event is not, on its own, something
 *     that should page a human the way "the client has a question" is;
 *     it is still fully visible to anyone who opens the thread.
 *  3. The confirmation reply is sent AT MOST ONCE per inbound MessageSid,
 *     claimed via an atomic conditional update (see below — a plain
 *     read-then-decide check would be a TOCTOU race under genuinely
 *     concurrent Twilio redelivery, not just a later retry). When sent,
 *     it is ALSO persisted into the same visa thread as an outbound
 *     message (sentBy: null, i.e. system-sent — the same convention the
 *     inbound row already uses for "no staff member did this") — so the
 *     thread reads "Client: STOP" / "Walz Travels: You have been
 *     unsubscribed…" end to end, using the EXISTING VisaApplicationMessage
 *     model, not a second message store.
 *
 * None of this changes what a marketing opt-out actually DOES: it can
 * never cancel the application, never blocks a staff member from
 * continuing the transactional conversation, and never removes history.
 */
async function handleWhatsAppOptOut(input: { fromPhone: string; toPhone: string; body: string; messageId?: string; bsuid?: string }) {
  try {
    const normalizedNumber = normalizePhoneE164(input.fromPhone)
    if (!normalizedNumber) return

    // ── 1. Marketing preference — unconditional, immediate. ──────────────
    // Always runs first, regardless of anything below, so it is always in
    // place before any future Broadcast eligibility decision reads it.
    await prisma.whatsAppConsent.upsert({
      where: { normalizedNumber },
      create: {
        normalizedNumber,
        status: 'OPTED_OUT',
        source: 'whatsapp_stop_reply',
        optedOutAt: new Date(),
      },
      update: {
        status: 'OPTED_OUT',
        source: 'whatsapp_stop_reply',
        optedOutAt: new Date(),
      },
    })

    // ── 2. Operational conversation visibility — independent of #1 and #3.
    // Wrapped in its OWN try/catch so a failure here (persisting the STOP
    // into the visa thread) can never prevent the confirmation in #3 from
    // being attempted — the three behaviors are independent in FACT, not
    // just in the happy path.
    let activeApp: ActiveVisaApp | null = null
    try {
      activeApp = await findActiveVisaThread({ fromPhone: input.fromPhone, bsuid: input.bsuid })
      if (activeApp) {
        // Same twilioSid-uniqueness dedup pattern as routeInboundWhatsApp()'s
        // regular inbound path: a redelivered STOP must not create a SECOND
        // "Client: STOP" row in the thread. Backed by the real DB partial
        // unique index (uq_visa_message_twilio_sid) via the P2002 catch —
        // not merely the pre-check — so it is race-safe under genuinely
        // concurrent redelivery, not just safe against a later retry.
        if (input.messageId) {
          const dup = await prisma.visaApplicationMessage
            .findFirst({ where: { twilioSid: input.messageId }, select: { id: true } })
            .catch(() => null)
          if (dup) {
            console.log('[twilio-wa] STOP: duplicate MessageSid, visa message already recorded')
          } else {
            await prisma.visaApplicationMessage.create({
              data: {
                visaApplicationId: activeApp.id,
                direction: 'inbound',
                body: input.body,
                sentBy: null,
                fromBsuid: input.bsuid ?? null,
                status: 'delivered',
                twilioSid: input.messageId,
              },
            }).catch((e: unknown) => {
              if ((e as { code?: string })?.code !== 'P2002') throw e
              console.log('[twilio-wa] STOP: concurrent duplicate MessageSid — skipped')
            })
          }
        } else {
          // No MessageSid to dedupe on (should not happen with real Twilio
          // traffic) — still record it; there is nothing to dedupe against.
          await prisma.visaApplicationMessage.create({
            data: {
              visaApplicationId: activeApp.id,
              direction: 'inbound',
              body: input.body,
              sentBy: null,
              fromBsuid: input.bsuid ?? null,
              status: 'delivered',
              twilioSid: null,
            },
          }).catch(() => {})
        }

        if (input.bsuid && !activeApp.whatsappBsuid) {
          await prisma.visaApplication.update({
            where: { id: activeApp.id },
            data: { whatsappBsuid: input.bsuid },
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.error('[twilio-wa] STOP: visa-thread visibility failed (confirmation still proceeds):', (e as Error)?.message)
    }

    // ── 3. Confirmation — one send, deduped on replay via an ATOMIC claim.
    // A plain read-then-decide check (read `evidence`, then decide whether
    // to send) is a TOCTOU race: two genuinely concurrent Twilio
    // redeliveries of the SAME MessageSid would both read "not yet
    // confirmed" and both send. Instead, claim the right to send via a
    // single conditional UPDATE keyed on the messageId itself — Postgres
    // serializes concurrent UPDATEs to the same row, so of two overlapping
    // deliveries exactly one sees count===1 and proceeds; the other sees
    // count===0 and skips. Same "conditional updateMany as the atomic
    // claim" pattern already used for the broadcast recipient claim
    // (lib/whatsapp/broadcast/processor.ts) and the OTP single-use
    // consumption guard (lib/whatsapp/consent-otp.ts) — not a new idea.
    //
    // Without a messageId there is nothing stable to claim on (should not
    // happen with real Twilio traffic) — falls back to always sending,
    // the same fail-open-toward-sending behavior this function has always
    // had for that edge case.
    let shouldSendConfirmation = true
    if (input.messageId) {
      const claim = await prisma.whatsAppConsent.updateMany({
        where: { normalizedNumber, OR: [{ evidence: null }, { evidence: { not: input.messageId } }] },
        data: { evidence: input.messageId },
      })
      shouldSendConfirmation = claim.count > 0
    }

    if (input.toPhone && shouldSendConfirmation) {
      const result = await sendWhatsAppBody(input.fromPhone, WHATSAPP_UNSUBSCRIBE_CONFIRMATION, undefined, input.toPhone).catch(
        () => ({ ok: false as const, error: 'send threw', usedTemplate: false }),
      )
      // Persisted into the SAME visa thread as an outbound/system message
      // (sentBy: null — no staff member sent this) so the interaction
      // reads as a whole: "Client: STOP" then "Walz Travels: …unsubscribed…".
      // Reuses the existing VisaApplicationMessage model exactly as the
      // staff-send route does (app/api/admin/visa-applications/[id]/
      // whatsapp/route.ts) — no second message-storage system.
      if (activeApp) {
        await prisma.visaApplicationMessage.create({
          data: {
            visaApplicationId: activeApp.id,
            direction: 'outbound',
            body: WHATSAPP_UNSUBSCRIBE_CONFIRMATION,
            sentBy: null,
            status: result.ok ? 'sent' : 'failed',
            twilioSid: result.ok ? (result.sid ?? null) : null,
          },
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('[twilio-wa] opt-out handling error:', (err as Error)?.message)
  }
}

// ── Routing logic ─────────────────────────────────────────────────────────────

type ActiveVisaApp = {
  id: string
  whatsappBsuid: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  assignedTo: string | null
}

const ACTIVE_VISA_APP_SELECT = { id: true, whatsappBsuid: true, firstName: true, lastName: true, phone: true, assignedTo: true } as const

/**
 * The SAME visa-thread match used for ordinary inbound routing (Step 1:
 * phone, Step 2: BSUID fallback) — shared so the STOP-visibility path
 * (handleWhatsAppOptOut) and normal message routing can never diverge on
 * what counts as "this sender has an existing operational conversation".
 */
async function findActiveVisaThread(payload: { fromPhone?: string; bsuid?: string }): Promise<ActiveVisaApp | null> {
  // Step 1 — match by normalised phone number
  if (payload.fromPhone) {
    const normalised = normalisePhone(payload.fromPhone)
    const byPhone = await prisma.visaApplication.findFirst({
      where: {
        phone:     normalised,
        status:    { in: ACTIVE_VISA_STATUSES },
        messages:  { some: {} }, // thread must already exist (initiated by staff)
      },
      orderBy: { updatedAt: 'desc' },
      select: ACTIVE_VISA_APP_SELECT,
    })
    if (byPhone) return byPhone
  }

  // Step 2 — fallback: match by BSUID (phone absent or no phone match)
  if (payload.bsuid) {
    return prisma.visaApplication.findFirst({
      where: {
        whatsappBsuid: payload.bsuid,
        status:        { in: ACTIVE_VISA_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      select: ACTIVE_VISA_APP_SELECT,
    })
  }

  return null
}

async function routeInboundWhatsApp(payload: {
  fromPhone?: string
  bsuid?:     string
  body:       string
  twilioSid?: string
}) {
  const activeApp = await findActiveVisaThread(payload)

  if (!activeApp) {
    // No active visa application match — falls through to general inbound handling.
    // Chatwoot's Twilio integration on the relevant inbox handles this message.
    return
  }

  // Save the inbound message to the visa application thread. The partial
  // UNIQUE index on twilioSid is the concurrency backstop: the loser of a
  // duplicate race gets P2002 and stops (no message, no duplicate emails).
  try {
    await prisma.visaApplicationMessage.create({
      data: {
        visaApplicationId: activeApp.id,
        direction:         'inbound',
        body:              payload.body,
        sentBy:            null,
        fromBsuid:         payload.bsuid ?? null,
        status:            'delivered',
        twilioSid:         payload.twilioSid ?? null,
      },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      console.log('[twilio-wa] concurrent duplicate MessageSid — skipped')
      return
    }
    throw e
  }

  // Persist BSUID on the application if newly seen (enables future routing without phone)
  if (payload.bsuid && !activeApp.whatsappBsuid) {
    await prisma.visaApplication.update({
      where: { id: activeApp.id },
      data:  { whatsappBsuid: payload.bsuid },
    }).catch(() => {})
  }

  // Notify assigned agent + all super_admin / general_manager staff
  const clientName   = [activeApp!.firstName, activeApp!.lastName].filter(Boolean).join(' ') || 'Visa client'
  const clientPhone  = activeApp!.phone ?? payload.fromPhone ?? 'unknown'
  const appId        = activeApp!.id

  prisma.staff.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ['super_admin', 'general_manager'] } },
        ...(activeApp.assignedTo ? [{ id: activeApp.assignedTo }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
  }).then(recipients => {
    // dedupe by email in case assigned agent is also super_admin / GM
    const seen  = new Set<string>()
    const unique = recipients.filter(r => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
    return Promise.all(unique.map(r =>
      sendVisaWhatsAppNotification({
        agentName:      r.name,
        agentEmail:     r.email,
        clientName,
        clientPhone,
        applicationId:  appId,
        messagePreview: payload.body,
      })
    ))
  }).catch(() => {})
}
