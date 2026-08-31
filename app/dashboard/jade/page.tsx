// app/dashboard/jade/page.tsx — Release 6.5: Portal Jade RSC
// Loads customer context server-side and renders the authenticated concierge UI.

import { getServerSession }     from 'next-auth'
import { authOptions }          from '@/lib/auth'
import { redirect }             from 'next/navigation'
import { buildPortalJadeContext, type PortalContextHint } from '@/lib/portal/portal-jade-context'
import PortalJadeChat           from './_components/PortalJadeChat'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { trip?: string; booking?: string; proposal?: string }
}

export default async function PortalJadePage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/jade')

  const hint: PortalContextHint = {
    tripId:     searchParams.trip     || undefined,
    bookingId:  searchParams.booking  || undefined,
    proposalId: searchParams.proposal || undefined,
  }

  const ctx = await buildPortalJadeContext(session.user.id, hint)

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-screen bg-[#060e1c]">
      <PortalJadeChat
        displayName={ctx.customer.firstName}
        focusEntity={ctx.focusEntity}
        hasBookings={ctx.recentBookings.length > 0}
        hasProposals={ctx.openProposals.length > 0}
        hasActionsRequired={ctx.actionsRequired.length > 0}
        initialContextHint={hint}
      />
    </div>
  )
}
