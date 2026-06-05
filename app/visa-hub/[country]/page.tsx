import { redirect } from 'next/navigation'

// /visa-hub/[country] has moved to /visa/[country]
export default function VisaHubCountryRedirect({ params }: { params: { country: string } }) {
  redirect(`/visa/${params.country}`)
}
