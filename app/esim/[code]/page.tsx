import type { Metadata } from 'next'
import { notFound }        from 'next/navigation'
import { Suspense }        from 'react'
import { fetchCountryPackages } from '@/lib/esim/api'
import { countryName, countryFlag } from '@/lib/esim/utils'
import { EsimCountryPage }  from '@/components/esim/EsimCountryPage'

export const revalidate = 21600

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const iso2 = code.toUpperCase()
  const name = countryName(iso2)
  const flag = countryFlag(iso2)
  return {
    title:       `${flag} ${name} eSIM Plans — Jade Connect | Walz Travels`,
    description: `Buy a ${name} eSIM from Jade Connect. Instant QR delivery, 4G/5G data, from $9.99. No roaming charges.`,
    openGraph: {
      title:       `${name} eSIM Plans — Jade Connect`,
      description: `Instant ${name} eSIM — 4G/5G data from $9.99. Delivered to your email, no physical SIM needed.`,
      url:         `https://www.walztravels.com/esim/${code.toLowerCase()}`,
    },
    alternates: { canonical: `https://www.walztravels.com/esim/${code.toLowerCase()}` },
  }
}

export default async function EsimCountryRoute({ params }: Props) {
  const { code }   = await params
  const iso2       = code.toUpperCase()
  const packages   = await fetchCountryPackages(iso2)

  if (!packages.length) notFound()

  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#F5F4F0' }} />}>
      <EsimCountryPage
        code={iso2}
        name={countryName(iso2)}
        flag={countryFlag(iso2)}
        packages={packages}
      />
    </Suspense>
  )
}
