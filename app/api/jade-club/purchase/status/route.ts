// app/api/jade-club/purchase/status/route.ts — Jade Travel Club Release 2B:
// authenticated, ownership-scoped purchase status read.
//
// IDOR-safe by construction: getOwnPurchaseStatus's `where` clause includes
// BOTH id AND userId — a caller can never read another user's purchase by
// guessing/enumerating a purchaseId, because the query itself excludes rows
// that don't belong to the caller (returns null, indistinguishable from
// "not found", never a 403 that would leak existence).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOwnPurchaseStatus } from '@/lib/jade-club/purchase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const purchaseId = req.nextUrl.searchParams.get('purchaseId')
  if (!purchaseId) {
    return NextResponse.json({ error: 'purchaseId is required' }, { status: 400 })
  }

  const status = await getOwnPurchaseStatus(session.user.id, purchaseId)
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ purchase: status })
}
