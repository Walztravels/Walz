import { NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { language?: string; codes: Array<{ activityCode: string; modalityCodes?: string[] }> }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  if (!body.codes?.length) {
    return NextResponse.json({ error: 'codes array is required' }, { status: 400 })
  }

  try {
    const data = await hotelbedsRequest(
      'activities-content',
      '/activities',
      { method: 'POST', body: { codes: body.codes, language: body.language ?? 'en' } },
    )
    return NextResponse.json({ ok: true, ...(data as object) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Multi content request failed' }, { status: 500 })
  }
}
