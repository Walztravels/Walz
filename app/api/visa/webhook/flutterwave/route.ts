import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  const hash       = req.headers.get('verif-hash')
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH
  if (secretHash && hash !== secretHash) {
    return NextResponse.json({ error: 'Invalid hash' }, { status: 401 })
  }

  const payload = await req.json()

  if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
    const appId = payload.data?.meta?.applicationId ?? payload.meta?.applicationId
    if (appId) {
      await prisma.visaApplication.update({
        where: { id: appId },
        data:  { serviceFeePaid: true, status: 'documents_pending' },
      })
      console.log('[Flutterwave] Payment confirmed for application:', appId)
    }
  }

  return NextResponse.json({ status: 'ok' })
}
