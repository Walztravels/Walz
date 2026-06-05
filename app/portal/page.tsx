import { redirect } from 'next/navigation'

// /portal → /portal/dashboard
export default function PortalRootPage() {
  redirect('/portal/dashboard')
}
