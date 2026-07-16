import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rateCommentsId = searchParams.get('id')

  if (!rateCommentsId) return NextResponse.json({ comments: [] })

  try {
    const today = new Date().toISOString().split('T')[0]
    const data = await hotelbedsRequest(
      'content',
      `/ratecomments?language=ENG&date=${today}&rateCommentsId=${encodeURIComponent(rateCommentsId)}`,
    )
    // HBX content API returns nested: rateComments[group].rateComments[date].rateComments[i].comment
    // Also handle flat structure: rateComments[i].description (alternate test-env format)
    const top: any[] = data.rateComments ?? []
    const flat = top.map((c: any) => c.description ?? c.comment ?? '').filter(Boolean)
    const nested = top.flatMap((g: any) =>
      (g.rateComments ?? []).flatMap((d: any) =>
        (d.rateComments ?? []).map((r: any) => r.comment ?? r.description ?? '').filter(Boolean)
      )
    )
    return NextResponse.json({ comments: flat.length ? flat : nested })
  } catch {
    return NextResponse.json({ comments: [] })
  }
}
