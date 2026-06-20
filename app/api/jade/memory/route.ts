import { NextRequest, NextResponse } from 'next/server'
import { fetchClientMemory } from '@/lib/jade-memory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const convId = searchParams.get('conversationId')
  if (!convId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const result = await fetchClientMemory(Number(convId))
  return NextResponse.json(result)
}
