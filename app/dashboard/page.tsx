import { redirect } from 'next/navigation'

// Legacy /dashboard → canonical /portal/dashboard
export default function LegacyDashboard() {
  redirect('/portal/dashboard')
}
