import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

// Chatwoot returns at most 25 conversations per page. Fetching only page 1
// silently hid every conversation past the 25 most recently active — staff
// (including super admins) "not seeing all messages". Aggregate pages up to
// a sane cap so the admin inbox always has the full open list.
const PAGE_SIZE = 25
const MAX_PAGES = 8   // up to 200 conversations per status

interface CWListEnvelope {
  data?: { meta?: Record<string, unknown>; payload?: unknown[] }
  meta?: Record<string, unknown>
  payload?: unknown[]
}

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status')        || 'open'
  const assigneeType = searchParams.get('assignee_type') || ''

  // Explicit page request → single-page passthrough (legacy behavior)
  const explicitPage = searchParams.get('page')

  async function fetchPage(page: number): Promise<CWListEnvelope | null> {
    const params = new URLSearchParams({ status, page: String(page) })
    if (assigneeType) params.set('assignee_type', assigneeType)
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations?${params}`, {
      headers: { api_access_token: CW_TOKEN },
    })
    if (!res.ok) return null
    return res.json().catch(() => null)
  }

  if (explicitPage) {
    const data = await fetchPage(Number(explicitPage) || 1)
    if (!data) return NextResponse.json({ error: 'Chatwoot request failed' }, { status: 502 })
    return NextResponse.json(data?.data ?? data)
  }

  // Aggregate all pages so no conversation is hidden by pagination
  let meta: Record<string, unknown> = {}
  const payload: unknown[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchPage(page)
    if (!data) {
      if (page === 1) return NextResponse.json({ error: 'Chatwoot request failed' }, { status: 502 })
      break
    }
    const inner     = data.data ?? data
    const pageItems = Array.isArray(inner?.payload) ? inner.payload : []
    if (page === 1) meta = inner?.meta ?? {}
    payload.push(...pageItems)
    if (pageItems.length < PAGE_SIZE) break
  }

  return NextResponse.json({ meta, payload })
}
