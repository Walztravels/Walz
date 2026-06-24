import type { Metadata } from 'next'
import { Suspense }         from 'react'
import { fetchAllEsimPackages } from '@/lib/esim/api'
import { EsimHero }         from '@/components/esim/EsimHero'
import { EsimSearch }       from '@/components/esim/EsimSearch'
import { EsimTicker, EsimHowItWorks, EsimCompatibility, EsimFAQ, EsimCTA } from '@/components/esim/EsimSections'

// ISR — refresh every 6 hours
export const revalidate = 21600

export const metadata: Metadata = {
  title:       { absolute: 'Jade Connect eSIM | Stay Connected in 150+ Countries | Walz Travels' },
  description: 'Instant eSIM for 150+ countries from USD 9.99. No roaming charges, no physical SIM. Activate before you land.',
  keywords: [
    'eSIM', 'travel eSIM', 'international eSIM', 'no roaming', 'Jade Connect',
    'eSIM UK', 'eSIM Nigeria', 'eSIM Dubai', 'eSIM Europe', 'cheap eSIM',
    'instant eSIM activation', 'Walz Travels eSIM',
  ],
  openGraph: {
    title:       'Jade Connect eSIM | Walz Travels',
    description: 'Stay connected in 150+ countries. Instant eSIM — no roaming, no physical SIM, from $9.99.',
    url:         'https://www.walztravels.com/esim',
    images: [{
      url:    'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1200&q=80',
      width:  1200,
      height: 630,
      alt:    'Jade Connect eSIM — Walz Travels',
    }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Jade Connect eSIM | Walz Travels',
    description: 'Stay connected in 150+ countries — instant eSIM from $9.99.',
  },
  alternates: { canonical: 'https://www.walztravels.com/esim' },
}

export default async function EsimPage() {
  // Fetch all available packages at ISR time — passed to client as serialized props
  const packages = await fetchAllEsimPackages()

  return (
    <>
      <EsimHero />
      <EsimTicker />

      <Suspense fallback={
        <div className="py-20 flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0B1F3A 0%,#081528 100%)' }}>
          <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
        </div>
      }>
        <EsimSearch packages={packages} />
      </Suspense>

      <EsimHowItWorks />
      <EsimCompatibility />
      <EsimFAQ />
      <EsimCTA />
    </>
  )
}
