import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jade Connect eSIM',
  description:
    'Stay connected in 150+ countries with Jade Connect eSIM from Walz Travels. Instant activation, no roaming fees, data plans from $9.99.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/esim',
    title: 'Jade Connect eSIM | Walz Travels',
    description:
      'Stay connected in 150+ countries with Jade Connect eSIM. Instant activation, no roaming fees.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Jade Connect eSIM — Walz Travels',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jade Connect eSIM | Walz Travels',
    description: 'Stay connected in 150+ countries — instant eSIM activation from $9.99.',
  },
  alternates: {
    canonical: 'https://www.walztravels.com/esim',
  },
}

export default function EsimLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
