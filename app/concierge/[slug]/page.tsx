import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCategoryBySlug, getActiveCategories } from '@/lib/concierge/catalogue'
import { ArrowLeft, CheckCircle } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const cats = await getActiveCategories().catch(() => [])
  return cats.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)
  if (!cat) return { title: 'Walz Concierge' }
  const title       = `${cat.name} — Walz Concierge`
  const description = cat.description ?? `Bespoke ${cat.name} service arranged by Walz Travels.`
  const url         = `https://www.walztravels.com/concierge/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'Walz Travels' },
    twitter:   { card: 'summary_large_image', title, description },
  }
}

const CATEGORY_ICONS: Record<string, string> = {
  'airport-services':      '✈',
  'executive-transport':   '🚗',
  'private-aviation':      '🛩',
  'yacht-marine':          '⛵',
  'lifestyle-concierge':   '✨',
  'tickets-entertainment': '🎭',
  'vip-experiences':       '👑',
}

export default async function ConciergeSlugPage({ params }: Props) {
  const { slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)
  if (!cat) notFound()

  const icon        = CATEGORY_ICONS[cat.slug] ?? '✦'
  const reqFields   = cat.requiredFields.filter(f => f.required)
  const optFields   = cat.requiredFields.filter(f => !f.required)
  const slaLabel    = cat.fulfilmentModes.includes('instant')
    ? 'Same-day response'
    : cat.fulfilmentModes.includes('request_to_book')
      ? 'Response within 4 hours'
      : 'Response within 24 hours'

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* Back */}
      <div className="px-6 pt-8">
        <Link
          href="/concierge"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs font-medium transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Concierge Services
        </Link>
      </div>

      {/* Hero */}
      <section className="relative px-6 pt-12 pb-16 text-center overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 70%)',
          }}
        />
        <span className="text-5xl mb-5 block">{icon}</span>
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">
          Walz Concierge
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-5">
          {cat.name}
        </h1>
        {cat.description && (
          <p className="text-white/60 text-base max-w-xl mx-auto leading-relaxed mb-8">
            {cat.description}
          </p>
        )}

        {/* SLA badge */}
        <span className="inline-flex items-center gap-2 bg-white/5 border border-[#C9A84C]/30 text-[#C9A84C] text-xs font-semibold px-4 py-2 rounded-full">
          <CheckCircle className="w-3.5 h-3.5" />
          {slaLabel}
        </span>
      </section>

      {/* What we'll need */}
      {reqFields.length > 0 && (
        <section className="px-6 pb-10 max-w-3xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] mb-5">
              What we&apos;ll need from you
            </p>
            <ul className="space-y-2.5">
              {reqFields.map(f => (
                <li key={f.key} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] mt-1.5 flex-shrink-0" />
                  <p className="text-white text-sm font-medium">{f.label}</p>
                </li>
              ))}
            </ul>

            {optFields.length > 0 && (
              <>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mt-5 mb-3">
                  Nice to know (optional)
                </p>
                <ul className="space-y-2">
                  {optFields.map(f => (
                    <li key={f.key} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1.5 flex-shrink-0" />
                      <p className="text-white/50 text-sm">{f.label}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="px-6 pb-20 max-w-3xl mx-auto text-center">
        <p className="text-white/50 text-sm mb-6 leading-relaxed">
          Jade will walk you through the details step by step.<br />
          Takes less than two minutes.
        </p>
        <button
          id="concierge-slug-cta"
          className="bg-[#C9A84C] text-[#0B1F3A] font-bold px-10 py-4 rounded-full
            hover:bg-[#d4b86e] transition-colors text-sm tracking-wide"
        >
          Request {cat.name} →
        </button>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById('concierge-slug-cta')?.addEventListener('click', function() {
                window.dispatchEvent(new CustomEvent('jade:open', {
                  detail: { prefill: "I'd like to request ${cat.name.replace(/'/g, "\\'")} through Walz Concierge" }
                }));
              });
            `,
          }}
        />

        <p className="text-white/30 text-xs mt-6">
          Or WhatsApp us directly on{' '}
          <a
            href="https://wa.me/12317902336"
            className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors">
            +1 231 790 2336
          </a>
        </p>
      </section>
    </main>
  )
}
