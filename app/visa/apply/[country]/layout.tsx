import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: { country: string } }
): Promise<Metadata> {
  return {
    alternates: { canonical: `https://www.walztravels.com/visa/apply/${params.country}` },
  }
}

export default function VisaApplyCountryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
