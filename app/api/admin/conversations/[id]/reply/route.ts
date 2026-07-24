import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ct = req.headers.get('content-type') ?? ''

  let content   = ''
  let isPrivate = false
  let file: File | null = null

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    content   = (form.get('content') as string | null) ?? ''
    isPrivate = (form.get('private') as string | null) === 'true'
    file      = (form.get('file') as File | null)
  } else {
    const body = await req.json() as { content: string; private?: boolean }
    content   = body.content
    isPrivate = body.private ?? false
  }

  const cwUrl = `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/messages`
  const cwHeaders: Record<string, string> = { api_access_token: CW_TOKEN }

  let cwBody: BodyInit
  if (file) {
    const cwForm = new FormData()
    if (content) cwForm.append('content', content)
    cwForm.append('message_type', '1')
    cwForm.append('private', String(isPrivate))
    cwForm.append('attachments[]', file, file.name)
    cwBody = cwForm
  } else {
    cwHeaders['Content-Type'] = 'application/json'
    cwBody = JSON.stringify({ content, message_type: 1, private: isPrivate })
  }

  const res = await fetch(cwUrl, { method: 'POST', headers: cwHeaders, body: cwBody })
  const data = await res.json()

  if (!res.ok) {
    console.error('[reply] Chatwoot error:', res.status, JSON.stringify(data))
    return NextResponse.json({ error: data?.message ?? data?.error ?? 'Chatwoot send failed', chatwoot: data }, { status: res.status })
  }

  if (data?.message_type === 0) {
    console.error(
      '[reply] ⚠️  Message stored as INCOMING (type 0) — CHATWOOT_ADMIN_TOKEN is likely wrong. ' +
      'Fix: use a user API Access Token from Chatwoot → Profile Settings → Access Token.'
    )
  }

  return NextResponse.json(data)
}
