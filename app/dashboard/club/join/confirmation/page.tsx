// app/dashboard/club/join/confirmation/page.tsx — Jade Travel Club Release
// 2B: post-checkout confirmation. Never trusts the redirect query string as
// proof of anything — it only uses `purchase_id` from the URL to know WHICH
// purchase to poll, then asks the server (an ownership-scoped read) for the
// actual state. Stripe's redirect happens the instant checkout completes,
// often before the webhook has even been delivered — so this page must
// poll, not assume success.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ConfirmationPoller from './ConfirmationPoller'

export const dynamic = 'force-dynamic'

export default async function JoinConfirmationPage({ searchParams }: { searchParams: { purchase_id?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/club')

  const purchaseId = searchParams.purchase_id
  if (!purchaseId) redirect('/dashboard/club')

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24 flex items-center justify-center">
      <ConfirmationPoller purchaseId={purchaseId} />
    </div>
  )
}
