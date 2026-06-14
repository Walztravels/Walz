import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rateCommentsId = searchParams.get('id')

  if (!rateCommentsId) return NextResponse.json({ comments: [] })

  try {
    const today = new Date().toISOString().split('T')[0]
    const data = await hotelbedsRequest(
      'hotel',
      `/ratecomments?language=ENG&date=${today}&rateCommentsId=${encodeURIComponent(rateCommentsId)}`,
    )
    return NextResponse.json({ comments: data.rateComments ?? [] })
  } catch {
    return NextResponse.json({ comments: [] })
  }
}
