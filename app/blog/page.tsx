import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Travel Blog | Walz Travels',
  description: 'Visa guides, destination inspiration, travel tips and news — everything you need for your next adventure.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.com/blog',
    title: 'Travel Blog | Walz Travels',
    description: 'Visa guides, destination inspiration, travel tips and news — everything you need for your next adventure.',
    images: [{
      url: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80',
      width: 1200, height: 630, alt: 'Walz Travels Travel Blog',
    }],
  },
  alternates: { canonical: 'https://www.walztravels.com/blog' },
}

const ARTICLES = [
  {
    slug:     'uk-visa-guide-2026',
    category: 'Visa Guide',
    title:    'UK Visa Guide 2026 — Everything You Need to Know',
    excerpt:  'Applying for a UK visa in 2026? We break down every visa type, the documents you\'ll need, and how to avoid the most common rejection reasons. From tourist visas to family visits, Walz Travels has processed thousands of successful UK applications.',
    image:    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    date:     'June 2026',
    readTime: '8 min read',
    href:     '/visa/uk',
  },
  {
    slug:     'canada-visa-guide-2026',
    category: 'Visa Guide',
    title:    'Canada Visitor Visa & eTA Guide 2026',
    excerpt:  'Travelling to Canada this year? Find out whether you need a full visitor visa or just an eTA — and what documents Immigration, Refugees and Citizenship Canada (IRCC) requires in 2026. We cover the full application process step by step.',
    image:    'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800&q=80',
    date:     'June 2026',
    readTime: '7 min read',
    href:     '/visa/canada',
  },
  {
    slug:     'dubai-5-days',
    category: 'Destination Guide',
    title:    'Dubai in 5 Days — The Ultimate Itinerary',
    excerpt:  'From the Burj Khalifa at sunrise to a desert safari under the stars, here\'s how to see the very best of Dubai in just five days. We include the best times to visit, money-saving tips, and how to avoid the tourist traps.',
    image:    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80',
    date:     'June 2026',
    readTime: '10 min read',
    href:     '/packages/dubai',
  },
  {
    slug:     'niagara-falls-tour-guide',
    category: 'Tour Guide',
    title:    'Niagara Falls VIP Private Tour — What to Expect',
    excerpt:  'Our Niagara Falls VIP private tour from Toronto gives you access to viewpoints the public never reaches. Here\'s a full breakdown of what\'s included, the best time of year to visit, and why a private guide makes all the difference.',
    image:    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
    date:     'June 2026',
    readTime: '6 min read',
    href:     '/tours',
  },
  {
    slug:     'jade-connect-esim-guide',
    category: 'Travel Tech',
    title:    'Jade Connect eSIM — Stay Connected Anywhere in the World',
    excerpt:  'Roaming charges are a thing of the past. Jade Connect eSIM gives you data in 100+ countries from just $9.99 — activated before you board. Here\'s everything you need to know about how it works, which plans to choose, and how to set it up.',
    image:    'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&q=80',
    date:     'June 2026',
    readTime: '5 min read',
    href:     '/esim',
  },
  {
    slug:     'schengen-visa-26-countries',
    category: 'Visa Guide',
    title:    'Schengen Visa 2026 — 27 Countries with One Application',
    excerpt:  'A single Schengen visa unlocks 27 European countries from Spain to Finland. But the application process is notoriously tricky — wrong documentation is the leading cause of refusals. Here\'s our 2026 guide to getting it right first time.',
    image:    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
    date:     'June 2026',
    readTime: '9 min read',
    href:     '/visa',
  },
]

const CATEGORY_COLOURS: Record<string, string> = {
  'Visa Guide':        'bg-blue-100 text-blue-700',
  'Destination Guide': 'bg-emerald-100 text-emerald-700',
  'Tour Guide':        'bg-purple-100 text-purple-700',
  'Travel Tech':       'bg-orange-100 text-orange-700',
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

      {/* Articles grid */}
      <div className="max-w-6xl mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ARTICLES.map(article => (
            <article
              key={article.slug}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.image}
                  alt={article.title}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                {/* Category + meta */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${CATEGORY_COLOURS[article.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {article.category}
                  </span>
                  <span className="text-xs text-gray-400">{article.readTime}</span>
                </div>

                <h2 className="font-display text-base font-bold text-[#0B1F3A] mb-2 leading-snug line-clamp-2">
                  {article.title}
                </h2>

                <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 mb-4 flex-1">
                  {article.excerpt}
                </p>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{article.date}</span>
                  <Link
                    href={article.href}
                    className="text-xs font-semibold text-[#C9A84C] hover:underline"
                  >
                    Read More →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Newsletter CTA */}
        <div className="mt-16 rounded-2xl p-8 lg:p-10 text-center" style={{ backgroundColor: '#0B1F3A' }}>
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[4px] mb-3">Stay Updated</p>
          <h2 className="font-display text-2xl font-bold text-white mb-3">Get Travel Tips in Your Inbox</h2>
          <p className="text-white/60 text-sm max-w-md mx-auto mb-6">
            Visa changes, travel deals, destination guides and more — delivered straight to you.
          </p>
          <a
            href="https://wa.me/447398753797?text=Hi, I'd like to receive Walz Travels travel tips and updates."
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
          >
            Subscribe via WhatsApp
          </a>
        </div>
      </div>

    </div>
  )
}
