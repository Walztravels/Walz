import { redirect } from 'next/navigation'

// /visa-hub has moved permanently to /visa
export default function VisaHubRedirect() {
  redirect('/visa')
}
