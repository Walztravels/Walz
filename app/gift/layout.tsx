import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gift Vouchers',
  description:
    'Give the gift of travel. Walz Travels gift vouchers can be used for flights, hotels, private tours and visa services. The perfect present for any traveller.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.us/gift',
    title: 'Gift Vouchers | Walz Travels',
    description:
      'Give the gift of travel. Walz Travels gift vouchers can be used for flights, hotels, private tours and visa services.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels Gift Vouchers',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gift Vouchers | Walz Travels',
    description:
      'Give the gift of travel — vouchers redeemable for flights, hotels, tours and visa services.',
  },
}

export default function GiftLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
