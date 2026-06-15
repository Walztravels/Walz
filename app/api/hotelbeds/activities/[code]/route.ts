import { NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const url      = new URL(req.url)
  const modality = url.searchParams.get('modality')
  const language = url.searchParams.get('language') ?? 'en'

  if (!code)     return NextResponse.json({ error: 'Activity code required' }, { status: 400 })
  if (!modality) return NextResponse.json({ error: 'modality query param required (e.g. ?modality=8)' }, { status: 400 })

  try {
    const data = await hotelbedsRequest(
      'activities-content',
      `/activities/${encodeURIComponent(language)}/${encodeURIComponent(code)}/${encodeURIComponent(modality)}`,
    )
    return NextResponse.json({ ok: true, activity: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Activity content request failed' }, { status: 500 })
  }
}
