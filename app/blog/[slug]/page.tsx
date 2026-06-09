import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, Tag, ArrowLeft, ArrowRight, Share2 } from 'lucide-react'

interface Post {
  id: string
  title: string
  slug: string
  content: string
  excerpt: string | null
  category: string
  featuredImageUrl: string | null
  metaDescription: string | null
  createdAt: string
  updatedAt: string
}

interface RelatedPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  category: string
  featuredImageUrl: string | null
  createdAt: string
}

const CATEGORY_COLORS: Record<string, string> = {
  'Visa Guides':  'bg-blue-100 text-blue-700',
  'Destinations': 'bg-green-100 text-green-700',
  'Travel Tips':  'bg-purple-100 text-purple-700',
  'News':         'bg-orange-100 text-orange-700',
}

async function getPost(slug: string): Promise<{ post: Post; related: RelatedPost[] } | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://walztravels.com'
    const res = await fetch(`${baseUrl}/api/blog/${slug}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const data = await getPost(params.slug)
  if (!data) return { title: 'Post Not Found | Walz Travels Blog' }

  const { post } = data
  const description = post.metaDescription || post.excerpt || `Read "${post.title}" on the Walz Travels blog.`

  return {
    title: `${post.title} | Walz Travels Blog`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      publishedTime: post.createdAt,
      modifiedTime: post.updatedAt,
      images: post.featuredImageUrl ? [{ url: post.featuredImageUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: post.featuredImageUrl ? [post.featuredImageUrl] : [],
    },
  }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const data = await getPost(params.slug)
  if (!data) notFound()

  const { post, related } = data
  const postUrl = `https://walztravels.com/blog/${post.slug}`

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(postUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${post.title} — ${postUrl}`)}`,
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* Hero */}
      <div className="relative">
        {post.featuredImageUrl ? (
          <div className="relative h-72 sm:h-96 lg:h-[480px] overflow-hidden">
            <Image
              src={post.featuredImageUrl}
              alt={post.title}
              fill
              className="object-cover"
              priority
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/50 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 max-w-4xl mx-auto">
              <HeroContent post={post} />
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#0B1F3A] to-[#1a3a5c] py-16 px-4">
            <div className="max-w-4xl mx-auto">
              <HeroContent post={post} />
            </div>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
          <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-[#C9A84C] transition-colors">Blog</Link>
          <span>/</span>
          <span className="text-gray-600 truncate max-w-xs">{post.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">

          {/* Article */}
          <article>
            <div
              className="prose prose-lg max-w-none
                prose-headings:text-[#0B1F3A] prose-headings:font-bold
                prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
                prose-a:text-[#C9A84C] prose-a:no-underline hover:prose-a:underline
                prose-strong:text-[#0B1F3A]
                prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-1
                prose-ol:list-decimal prose-ol:pl-6 prose-ol:space-y-1
                prose-li:text-gray-700
                prose-blockquote:border-l-4 prose-blockquote:border-[#C9A84C] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
                prose-img:rounded-xl prose-img:shadow-md"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Share */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Share this article
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={shareLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1DA1F2] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  𝕏 Twitter
                </a>
                <a
                  href={shareLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1877F2] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Facebook
                </a>
                <a
                  href={shareLinks.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  WhatsApp
                </a>
              </div>
            </div>

            {/* Back */}
            <div className="mt-8">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to all articles
              </Link>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">

            {/* WhatsApp CTA */}
            <div className="bg-[#0B1F3A] rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">✈️</div>
              <h3 className="font-bold text-white text-base mb-2">Ready to travel?</h3>
              <p className="text-[#8B9BAE] text-xs mb-4 leading-relaxed">
                Get expert travel advice, visa help, and flight bookings — all in one place.
              </p>
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20c45e] transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.855L0 24l6.335-1.52C8.05 23.447 9.99 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm.029 21.818c-1.834 0-3.584-.497-5.09-1.362l-.365-.218-3.764.903.968-3.668-.24-.379A9.782 9.782 0 012.18 12c0-5.42 4.41-9.83 9.849-9.83 5.44 0 9.85 4.41 9.85 9.83 0 5.421-4.41 9.818-9.85 9.818z"/>
                </svg>
                Chat on WhatsApp
              </a>
              <a
                href="mailto:contact@walztravels.com"
                className="flex items-center justify-center gap-2 w-full py-2.5 mt-2 border border-white/20 text-white/70 text-sm font-medium rounded-xl hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
              >
                contact@walztravels.com
              </a>
            </div>

            {/* Category */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Category</p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${CATEGORY_COLORS[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
                <Tag className="w-3.5 h-3.5" />
                {post.category}
              </span>
            </div>

          </aside>
        </div>

        {/* Related Posts */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-bold text-[#0B1F3A] text-2xl mb-6">Related Articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((rp) => (
                <Link
                  key={rp.id}
                  href={`/blog/${rp.slug}`}
                  className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all bg-white"
                >
                  <div className="relative h-44 bg-gradient-to-br from-[#0B1F3A] to-[#1a3a5c] overflow-hidden">
                    {rp.featuredImageUrl ? (
                      <Image
                        src={rp.featuredImageUrl}
                        alt={rp.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[#C9A84C] text-4xl font-bold opacity-20">W</span>
                      </div>
                    )}
                    <span className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[rp.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {rp.category}
                    </span>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(rp.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <h3 className="font-bold text-[#0B1F3A] text-sm leading-snug mb-2 group-hover:text-[#C9A84C] transition-colors line-clamp-2">
                      {rp.title}
                    </h3>
                    {rp.excerpt && (
                      <p className="text-xs text-gray-500 line-clamp-2 flex-1">{rp.excerpt}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-3 text-[#C9A84C] text-xs font-semibold">
                      Read more <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

function HeroContent({ post }: { post: Post }) {
  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4 ${CATEGORY_COLORS[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
        <Tag className="w-3 h-3" />
        {post.category}
      </span>
      <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight mb-4">
        {post.title}
      </h1>
      {post.excerpt && (
        <p className="text-white/70 text-sm sm:text-base max-w-2xl line-clamp-2">{post.excerpt}</p>
      )}
      <div className="flex items-center gap-1.5 text-white/50 text-xs mt-4">
        <Calendar className="w-3.5 h-3.5" />
        {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}
