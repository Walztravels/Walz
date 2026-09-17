import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import {
  mapChatwootFailure, safeJson,
  parsePrivateFlag, validateReplyContent, validateAttachmentMeta,
} from '@/lib/inbox/provider'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_reply')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  // ── Parse + validate the payload (INBOX-0S.3) ─────────────────────────────
  // The private flag is parsed strictly: a malformed flag is rejected, never
  // defaulted — a private note must not become client-visible because of
  // request serialization.
  const ct = req.headers.get('content-type') ?? ''

  let content   = ''
  let isPrivate = false
  let file: File | null = null

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
    const flag = parsePrivateFlag({ kind: 'form', value: form.get('private') })
    if (!flag.ok) return NextResponse.json({ error: flag.error }, { status: 400 })
    isPrivate = flag.isPrivate
    const rawContent = form.get('content')
    content = typeof rawContent === 'string' ? rawContent.trim() : ''
    const rawFile = form.get('file')
    file = rawFile instanceof File ? rawFile : null
  } else {
    const body = await req.json().catch(() => null) as { content?: unknown; private?: unknown } | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    const flag = parsePrivateFlag({ kind: 'json', value: body.private })
    if (!flag.ok) return NextResponse.json({ error: flag.error }, { status: 400 })
    isPrivate = flag.isPrivate
    content = typeof body.content === 'string' ? body.content.trim() : ''
  }

  const cv = validateReplyContent(content, file !== null)
  if (!cv.ok) return NextResponse.json({ error: cv.error }, { status: 400 })

  // Size/type checked BEFORE the body is read into lambda memory.
  if (file) {
    const av = validateAttachmentMeta(file)
    if (!av.ok) return NextResponse.json({ error: av.error }, { status: av.status })
  }

  // ── Forward to Chatwoot ───────────────────────────────────────────────────
  // Both paths send message_type 'outgoing' and the SAME parsed private flag.
  const cwUrl = `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/messages`
  const cwHeaders: Record<string, string> = { api_access_token: CW_TOKEN }

  let cwBody: BodyInit
  if (file) {
    // Read file into memory so Vercel's Node runtime can forward it correctly
    const bytes  = await file.arrayBuffer()
    const blob   = new Blob([bytes], { type: file.type || 'application/octet-stream' })
    const cwForm = new FormData()
    if (content) cwForm.append('content', content)
    cwForm.append('message_type', 'outgoing')
    cwForm.append('private', String(isPrivate))
    cwForm.append('attachments[]', blob, file.name)
    cwBody = cwForm
  } else {
    cwHeaders['Content-Type'] = 'application/json'
    cwBody = JSON.stringify({ content, message_type: 'outgoing', private: isPrivate })
  }

  const res = await fetch(cwUrl, { method: 'POST', headers: cwHeaders, body: cwBody })
    .catch(() => null)
  if (!res) {
    return NextResponse.json({ error: 'Send failed — messaging service unreachable. Please try again.' }, { status: 502 })
  }
  const data = await safeJson(res) as Record<string, unknown> | null

  if (!res.ok || data === null) {
    // Detail stays in the server log; the browser gets a controlled message.
    console.error('[reply] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 500))
    const mapped = mapChatwootFailure(res.ok ? 502 : res.status, 'Send')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  if (data?.message_type === 0) {
    console.error(
      '[reply] ⚠️  Message stored as INCOMING (type 0) — CHATWOOT_ADMIN_TOKEN is likely wrong. ' +
      'Fix: use a user API Access Token from Chatwoot → Profile Settings → Access Token.'
    )
  }

  return NextResponse.json(data)
}
