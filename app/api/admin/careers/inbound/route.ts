import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { extractApplicationReference } from '@/lib/recruitment/applications'

export const dynamic = 'force-dynamic'

/**
 * Careers inbound — Resend posts emails sent to careers@walztravels.com here.
 *
 * Deliberately SEPARATE from the vendor inbound flow: applicants are
 * first-contact senders, so there is no In-Reply-To matching and no vendor
 * record matching of any kind. Every valid email creates a NEW Email Hub
 * thread (category "careers") with its first inbound message, atomically,
 * then notifies contact@walztravels.com.
 *
 * Ordering is strict: validate → commit Email Hub record → notify → respond.
 * The notification is never sent before the database commit succeeds.
 */

const NOTIFY_TO   = 'contact@walztravels.com'
const NOTIFY_FROM = 'Walz Travels <hello@walztravels.com>'   // verified Resend sender
const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.walztravels.com'

const MAX_BODY_CHARS      = 50_000
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'image/png', 'image/jpeg', 'image/webp',
]

// ── Payload shapes (mirrors the proven supplier-route normalisation) ─────────

interface InboundAttachment {
  filename?:     string
  content_type?: string
  contentType?:  string
  content?:      string   // base64 — older payloads only; current Resend
                          // inbound webhooks send METADATA + download_url
  size?:         number
  // Resend receiving: a time-limited (1 hour) URL to fetch the file from.
  download_url?: string
  downloadUrl?:  string
  url?:          string
  id?:           string
}

interface ResendInboundEmail {
  from?:        string
  to?:          string | string[]
  subject?:     string
  text?:        string
  html?:        string
  message_id?:  string
  email_id?:    string
  id?:          string
  attachments?: InboundAttachment[]
  headers?:     Array<{ name: string; value: string }> | Record<string, string>
}

interface ResendWebhookPayload extends ResendInboundEmail {
  type?: string
  data?: ResendInboundEmail
}

function extractHeader(
  headers: ResendInboundEmail['headers'],
  name: string,
): string | null {
  if (!headers) return null
  const lower = name.toLowerCase()
  if (Array.isArray(headers)) {
    return headers.find(h => h.name.toLowerCase() === lower)?.value ?? null
  }
  return headers[lower] ?? headers[name] ?? null
}

function stripAngleBrackets(s: string | null): string | null {
  if (!s) return null
  return s.replace(/^<|>$/g, '').trim() || null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function safeFilename(name: string): string {
  return (name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Fail closed: without the configured secret this endpoint accepts nothing.
  const secret = process.env.RESEND_INBOUND_SECRET
  if (!secret) {
    console.error('[careers inbound] RESEND_INBOUND_SECRET not configured — rejecting')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const provided = req.headers.get('x-resend-inbound-secret') ?? req.nextUrl?.searchParams.get('secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: ResendWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Normalise: Resend wraps in { type, data } but some versions send flat
  const email: ResendInboundEmail = payload.data ?? payload

  const fromRaw = email.from ?? ''
  const subject = (email.subject ?? '').trim() || '(no subject)'
  const bodyText = (email.text ?? '').slice(0, MAX_BODY_CHARS)
  const bodyHtml = (email.html ?? '').slice(0, MAX_BODY_CHARS)

  const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw.trim()).toLowerCase()
  const fromName  = fromRaw.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? null
  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    // Malformed sender — acknowledge so Resend doesn't retry, but store nothing.
    return NextResponse.json({ ok: false, reason: 'invalid sender' })
  }

  const toRaw = Array.isArray(email.to) ? email.to[0] : email.to
  const recipient = (toRaw ?? 'careers@walztravels.com').toString()

  // Scope guard: if the Resend webhook fires for the whole inbound domain,
  // only process mail actually addressed to a careers address — anything else
  // is acknowledged untouched so other inbound flows keep owning it.
  const allTo = (Array.isArray(email.to) ? email.to : [email.to ?? '']).join(',').toLowerCase()
  if (allTo && !allTo.includes('careers@')) {
    return NextResponse.json({ ok: false, reason: 'not a careers address' })
  }

  // ── Idempotency: stable provider identifier ────────────────────────────────
  const messageId =
    stripAngleBrackets(extractHeader(email.headers, 'Message-ID')) ??
    email.message_id ?? email.email_id ?? null
  const providerId = messageId
    ? `careers:${messageId}`
    : `careers:${createHash('sha256').update(`${fromEmail}|${subject}|${bodyText}`).digest('hex').slice(0, 40)}`

  const existing = await prisma.emailMessage.findFirst({
    where:  { resendId: providerId, direction: 'inbound' },
    select: { id: true, threadId: true },
  })
  if (existing) {
    // Duplicate webhook delivery: success response so Resend stops retrying;
    // no second thread, no second notification.
    return NextResponse.json({ ok: true, duplicate: true, threadId: existing.threadId })
  }

  // ── Attachments: metadata always; content upload best-effort ───────────────
  // Production evidence: the email.received webhook carries attachment
  // METADATA ONLY (content_disposition, content_id, content_type, filename,
  // id) — no bytes and no download_url. The file itself must be fetched via
  // GET https://api.resend.com/emails/receiving/{email_id}/attachments,
  // whose response carries a 1-hour download_url per attachment. One list
  // call per email, keyed back to the webhook attachments by id.
  const attachmentUrlById  = new Map<string, string>()
  let   attachmentListNote: string | null = null
  const resendEmailId = email.email_id ?? email.id ?? null
  const needsApiLookup = (email.attachments ?? []).some(
    a => !a.content && !(a.download_url ?? a.downloadUrl ?? a.url),
  )
  if (needsApiLookup) {
    if (!resendEmailId) {
      attachmentListNote = 'no email id in webhook'
      console.error('[careers inbound] cannot list attachments — no email_id in payload; keys:', Object.keys(email).join(', '))
    } else if (!process.env.RESEND_API_KEY) {
      attachmentListNote = 'RESEND_API_KEY not configured'
      console.error('[careers inbound] cannot list attachments — RESEND_API_KEY not set')
    } else {
      try {
        const listRes = await fetch(
          `https://api.resend.com/emails/receiving/${encodeURIComponent(resendEmailId)}/attachments`,
          {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            signal:  AbortSignal.timeout(10_000),
          },
        )
        if (listRes.ok) {
          const listData = await listRes.json() as { data?: Array<{ id?: string; filename?: string; download_url?: string }> }
          for (const a of listData.data ?? []) {
            if (a.id && a.download_url) attachmentUrlById.set(a.id, a.download_url)
          }
          if (attachmentUrlById.size === 0) {
            attachmentListNote = 'provider returned no download links'
            console.error('[careers inbound] attachment list returned no download_urls for', resendEmailId)
          }
        } else {
          attachmentListNote = `provider list HTTP ${listRes.status}`
          console.error(`[careers inbound] attachment list HTTP ${listRes.status} for ${resendEmailId}`)
        }
      } catch (e) {
        attachmentListNote = 'provider list request failed'
        console.error('[careers inbound] attachment list failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  const attachmentMeta: Array<{ filename: string; contentType: string; size: number; url?: string; stored: boolean; error?: string }> = []
  for (const att of (email.attachments ?? []).slice(0, 10)) {
    const contentType = (att.content_type ?? att.contentType ?? 'application/octet-stream').toLowerCase()
    const filename    = safeFilename(att.filename ?? 'attachment')
    const allowed     = ALLOWED_ATTACHMENT_TYPES.some(t => contentType.startsWith(t))
    const meta = { filename, contentType, size: att.size ?? 0, stored: false as boolean, url: undefined as string | undefined, error: undefined as string | undefined }
    // Resolve the file bytes: inline base64 (legacy payloads) or, per
    // current Resend inbound behaviour, fetch the 1-hour download_url NOW —
    // webhook processing happens within seconds of delivery.
    const downloadUrl =
      att.download_url ?? att.downloadUrl ?? att.url ??
      (att.id ? attachmentUrlById.get(att.id) : undefined)
    let contentBuf: Buffer | null = null
    if (allowed) {
      if (att.content) {
        try { contentBuf = Buffer.from(att.content, 'base64') } catch { contentBuf = null }
      } else if (downloadUrl && /^https:\/\//.test(downloadUrl)) {
        try {
          const dlRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) })
          if (dlRes.ok) contentBuf = Buffer.from(await dlRes.arrayBuffer())
          else console.error(`[careers inbound] attachment download HTTP ${dlRes.status} (${filename})`)
        } catch (e) {
          console.error(`[careers inbound] attachment download failed (${filename}):`, e instanceof Error ? e.message : e)
        }
      }
    }

    if (allowed && contentBuf) {
      try {
        const buf = contentBuf
        meta.size = buf.length
        if (buf.length > 0 && buf.length <= MAX_ATTACHMENT_BYTES) {
          const supabase = getSupabaseAdmin()
          const path = `careers/${Date.now()}_${filename}`
          let { error } = await supabase.storage.from('email-attachments').upload(path, buf, { contentType, upsert: false })
          // First-run resilience: create the bucket on demand and retry once
          if (error && /not.?found|bucket/i.test(error.message)) {
            await supabase.storage.createBucket('email-attachments', { public: true }).catch(() => {})
            ;({ error } = await supabase.storage.from('email-attachments').upload(path, buf, { contentType, upsert: false }))
          }
          if (error) throw new Error(error.message)
          const { data } = supabase.storage.from('email-attachments').getPublicUrl(path)
          meta.url = data.publicUrl
          meta.stored = true
        } else {
          meta.error = 'size limit'
        }
      } catch (e) {
        // One failed attachment never discards the email — visible in the record.
        meta.error = 'storage failed'
        console.error(`[careers inbound] attachment store failed (${filename}):`, e instanceof Error ? e.message : e)
      }
    } else if (!allowed) {
      meta.error = 'type not allowed'
    } else {
      // Neither inline content nor a fetchable download URL yielded bytes.
      // Log the payload's field names (never content) so the real shape is
      // visible in production logs if Resend changes it again.
      console.error(`[careers inbound] attachment not retrievable (${filename}) — payload keys: ${Object.keys(att).join(', ')}; list note: ${attachmentListNote ?? 'n/a'}`)
      meta.error = downloadUrl
        ? 'download from provider failed'
        : (attachmentListNote ?? 'file content not included by provider')
    }
    attachmentMeta.push(meta)
  }

  // ── Recruitment matching (best-effort — a failure here NEVER blocks intake) ─
  // Priority: application reference quoted in subject/body → the sender's
  // candidate record by email → unmatched (plain careers thread).
  let refType = 'careers'
  let refId: string | null = null
  let matchedLabel: string | null = null
  try {
    const reference = extractApplicationReference(`${subject}\n${bodyText.slice(0, 2000)}`)
    if (reference) {
      const application = await prisma.jobApplication.findUnique({
        where:  { reference },
        select: { id: true, reference: true, candidate: { select: { firstName: true, lastName: true } } },
      })
      if (application) {
        refType = 'application'
        refId = application.id
        matchedLabel = `${application.candidate.firstName} ${application.candidate.lastName} (${application.reference})`
      }
    }
    if (!refId) {
      const candidate = await prisma.candidate.findUnique({
        where:  { email: fromEmail },
        select: { id: true, firstName: true, lastName: true },
      })
      if (candidate) {
        refType = 'candidate'
        refId = candidate.id
        matchedLabel = `${candidate.firstName} ${candidate.lastName}`
      }
    }
  } catch (err) {
    console.error('[careers inbound] recruitment match failed (continuing unmatched):', err instanceof Error ? err.message : err)
  }

  // ── 1+2. Create thread + first inbound message ATOMICALLY ─────────────────
  let threadId: string
  try {
    const now = new Date()
    const thread = await prisma.emailThread.create({
      data: {
        subject,
        category:     'careers',
        status:       'open',
        lastEmailAt:  now,
        participants: JSON.parse(JSON.stringify([{ email: fromEmail, name: fromName }])),
        refType,
        refId,
        messages: {
          create: {
            direction:  'inbound',
            from:       fromEmail,
            fromName,
            to:         [recipient],
            subject,
            bodyHtml,
            bodyText,
            status:     'received',
            receivedAt: now,
            sentAt:     now,
            resendId:   providerId,
            attachments: JSON.parse(JSON.stringify(attachmentMeta)),
          },
        },
      },
      select: { id: true },
    })
    threadId = thread.id
  } catch (err) {
    // DB failure: NO notification, retryable server error (Resend will retry;
    // idempotency key prevents duplicates when it does).
    console.error('[careers inbound] Email Hub create failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
  }

  // ── 3. Notify contact@ — ONLY after the commit above succeeded ────────────
  let notified = false
  try {
    const threadUrl = `${BASE_URL}/admin/email?thread=${threadId}&category=careers`
    const preview   = escapeHtml(bodyText.slice(0, 300))
    const resend    = getResend()
    await resend.emails.send({
      from:    NOTIFY_FROM,
      to:      NOTIFY_TO,
      subject: `New job application: ${subject}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#0B1F3A;font-size:18px;margin:0 0 16px">New careers email received</h2>
        <table style="width:100%;border-collapse:collapse;background:#f8f8f5;border-radius:8px;font-size:13px">
          <tr><td style="padding:8px 14px;color:#999;width:110px">From</td><td style="padding:8px 14px;color:#0B1F3A;font-weight:600">${escapeHtml(fromName ?? '')} &lt;${escapeHtml(fromEmail)}&gt;</td></tr>
          <tr><td style="padding:8px 14px;color:#999">Subject</td><td style="padding:8px 14px;color:#0B1F3A">${escapeHtml(subject)}</td></tr>
          <tr><td style="padding:8px 14px;color:#999">Attachments</td><td style="padding:8px 14px;color:#0B1F3A">${attachmentMeta.length}</td></tr>
          ${matchedLabel ? `<tr><td style="padding:8px 14px;color:#999">Candidate</td><td style="padding:8px 14px;color:#0B1F3A">${escapeHtml(matchedLabel)}</td></tr>` : ''}
        </table>
        ${preview ? `<p style="color:#555;font-size:13px;background:#fafafa;border-left:3px solid #C9A84C;padding:10px 14px;margin:16px 0;white-space:pre-wrap">${preview}</p>` : ''}
        <a href="${threadUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">View in Email Hub →</a>
      </div>`,
    })
    notified = true
  } catch (err) {
    // Never roll back the stored application; the thread is safely in Email
    // Hub. Log sanitized failure; the duplicate guard above ensures a Resend
    // retry cannot double-store or double-notify.
    console.error('[careers inbound] notification send failed for thread', threadId, err instanceof Error ? err.message : 'send error')
  }

  return NextResponse.json({ ok: true, threadId, notified })
}
