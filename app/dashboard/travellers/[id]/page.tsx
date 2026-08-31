// app/dashboard/travellers/[id]/page.tsx — Release 6.4: Traveller detail + edit (IDOR-protected)
// "new" is treated as a special id to render the create form.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { toTravellerDTO } from '@/lib/portal/traveller-dto'
import { getTravellerProfileCompleteness } from '@/lib/portal/traveller-completeness'
import TravellerEditForm from './_components/TravellerEditForm'

export const dynamic = 'force-dynamic'

export default async function TravellerDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/dashboard/travellers/${params.id}`)
  }

  if (params.id === 'new') {
    return <TravellerEditForm mode="create" traveller={null} />
  }

  const raw = await prisma.travellerProfile.findFirst({
    where: { id: params.id, userId: session.user.id, isDeleted: false },
  })

  // IDOR: non-existent or wrong owner → redirect to list
  if (!raw) {
    redirect('/dashboard/travellers')
  }

  const traveller = toTravellerDTO(raw)
  const completeness = getTravellerProfileCompleteness({
    firstName: raw.firstName,
    lastName: raw.lastName,
    dateOfBirth: raw.dateOfBirth,
    nationality: raw.nationality,
    gender: raw.gender,
    phone: raw.phone,
    email: raw.email,
    passportMeta: raw.passportMeta && typeof raw.passportMeta === 'object'
      ? {
          maskedNumber: (raw.passportMeta as Record<string, unknown>).maskedNumber as string ?? null,
          expiryDate: (raw.passportMeta as Record<string, unknown>).expiryDate as string ?? null,
        }
      : null,
  })

  return <TravellerEditForm mode="edit" traveller={traveller} completeness={completeness} />
}
