import Link from 'next/link'
import Script from 'next/script'
import type { Metadata } from 'next'
import prisma from '@/lib/db'

const SORO_EMBED = 'https://app.trysoro.com/api/embed/e527122f-370b-455e-8cb1-6eb259425df9'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Travel Blog | Visa Guides & Destination Tips | Walz Travels',
  description: 'Expert travel guides, visa tips and destination inspiration from the Walz Travels team.',
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

const CATEGORY_COLOURS: Record<string, string> = {
  'Visa Guides':       'bg-blue-100 text-blue-700',
  'Visa Guide':        'bg-blue-100 text-blue-700',
  'Destinations':      'bg-emerald-100 text-emerald-700',
  'Destination Guide': 'bg-emerald-100 text-emerald-700',
  'Travel Tips':       'bg-purple-100 text-purple-700',
  'Tour Guide':        'bg-purple-100 text-purple-700',
  'News':              'bg-orange-100 text-orange-700',
  'Travel Tech':       'bg-orange-100 text-orange-700',
}

export default async function BlogPage() {
  const posts = await prisma.blogPost.findMany({
    where:   { published: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id:               true,
      title:            true,
      slug:             true,
      excerpt:          true,
      category:         true,
      featuredImageUrl: true,
      readTime:         true,
      publishedAt:      true,
      createdAt:        true,
    },
    take: 24,
  }).catch(() => [] as never[])

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
        {posts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(post => {
              const date = post.publishedAt ?? post.createdAt
              return (
                <article
                  key={post.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                >
                  {/* Image */}
                  <div className="relative h-48 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.featuredImageUrl ?? 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=80'}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${CATEGORY_COLOURS[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {post.category}
                      </span>
                      {post.readTime && (
                        <span className="text-xs text-gray-400">{post.readTime} min read</span>
                      )}
                    </div>

                    <h2 className="font-display text-base font-bold text-[#0B1F3A] mb-2 leading-snug line-clamp-2">
                      {post.title}
                    </h2>

                    {post.excerpt && (
                      <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 mb-4 flex-1">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400">
                        {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-xs font-semibold text-[#C9A84C] hover:underline"
                      >
                        Read More →
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Soro automated articles */}
        <div className="mt-16 pt-12 border-t border-gray-200">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-2">More Travel Guides</h2>
            <p className="text-gray-500 text-sm">Daily visa guides and travel tips</p>
          </div>
          <div id="soro-blog" />
        </div>

        <Script src={SORO_EMBED} strategy="afterInteractive" />

        {/* Fallback: replace broken Soro images with quality Unsplash travel photos */}
        <Script
          id="soro-image-fix"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              var TRAVEL_IMAGES = [
                'photo-1436491865332-7a61a109cc05',
                'photo-1488646953014-85cb44e25828',
                'photo-1503220317375-aaad61436b1b',
                'photo-1476514525535-07fb3b4ae5f1',
                'photo-1527631746610-bca00a040d60',
                'photo-1568605117036-5fe5e7bab0b7',
                'photo-1512453979798-5ea266f8880c',
                'photo-1513635269975-59663e0ac1ad',
                'photo-1517090504586-fde19ea6066f',
                'photo-1501854140801-50d01698950b',
              ];
              function fixSoroImages() {
                var el = document.getElementById('soro-blog');
                if (!el) return;
                var imgs = el.querySelectorAll('img');
                imgs.forEach(function(img, i) {
                  img.style.width = '100%';
                  img.style.aspectRatio = '16/9';
                  img.style.objectFit = 'cover';
                  img.addEventListener('error', function() {
                    img.src = 'https://images.unsplash.com/' + TRAVEL_IMAGES[i % TRAVEL_IMAGES.length] + '?w=800&q=80&auto=format&fit=crop';
                  }, { once: true });
                });
              }
              setTimeout(fixSoroImages, 2000);
              setTimeout(fixSoroImages, 5000);
            `,
          }}
        />

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
