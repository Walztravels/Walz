import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { ensureClientAccount } from '@/lib/create-client-account'

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
      const app = await prisma.visaApplication.update({
        where: { id: appId },
        data:  { serviceFeePaid: true, status: 'documents_pending' },
      })
      console.log('[Flutterwave] Payment confirmed for application:', appId)

      // Auto-create client portal account after payment
      if (app.email) {
        const fullName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Client'
        await ensureClientAccount({ email: app.email, name: fullName, phone: app.phone ?? null, applicationId: app.id })
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}
