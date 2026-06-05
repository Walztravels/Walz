import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Logged-in users see the full Visa Intelligence hub at /visa
// Logged-out users are redirected to login first
export default async function PortalVisaGuidePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/visa')
  redirect('/visa')
}
