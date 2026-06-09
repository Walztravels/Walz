import Script from 'next/script'

export const metadata = {
  title: 'Travel Blog',
  description: 'Visa guides, destination inspiration, travel tips and news — everything you need for your next adventure.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.com/blog',
    title: 'Travel Blog | Walz Travels',
    description: 'Visa guides, destination inspiration, travel tips and news — everything you need for your next adventure.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'Walz Travels Travel Blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Travel Blog | Walz Travels',
    description: 'Visa guides, destination tips and travel news from the Walz Travels team.',
  },
}

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 px-4 text-center">
        <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase mb-3">Walz Travels</p>
        <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">Travel Blog</h1>
        <p className="text-[#8B9BAE] text-base max-w-xl mx-auto">
          Visa guides, destination inspiration, travel tips and news — everything you need for your next adventure.
        </p>
      </div>

      {/* Soro Blog Widget */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div id="soro-blog" />
        <Script
          src="https://app.trysoro.com/api/embed/2780678f-725a-44f8-9eda-6b44bd24b5e1"
          strategy="lazyOnload"
        />
      </div>

    </div>
  )
}
