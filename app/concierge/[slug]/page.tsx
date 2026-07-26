import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getCategoryBySlug, getActiveCategories } from '@/lib/concierge/catalogue'
import { getImagery } from '@/lib/concierge/imagery'
import { parseFormFields } from '@/lib/concierge/form-schema'
import { ConciergeRequestForm } from '@/components/concierge/ConciergeRequestForm'
import { ArrowLeft, CheckCircle } from 'lucide-react'

// Hard constraint: do NOT remove this export.
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

// airport-services has its own dedicated booking flow at /concierge/airport-services.
// All other slugs (including private-aviation) render the schema-driven form.
const DEDICATED_FLOW_SLUGS = new Set(['airport-services'])

// ── Static params ─────────────────────────────────────────────────────────────

export async function generateStaticParams() {
  const cats = await getActiveCategories().catch(() => [])
  return cats.map(c => ({ slug: c.slug }))
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)

  if (!cat) return { title: 'Walz Concierge' }

  const imagery     = getImagery(slug)
  const title       = `${cat.name} — Walz Concierge`
  const description = cat.description ?? `Bespoke ${cat.name} service arranged by Walz Travels.`
  const url         = `https://www.walztravels.com/concierge/${slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type:     'website',
      siteName: 'Walz Travels',
      images: imagery
        ? [{ url: imagery.hero, width: 1920, height: 1080, alt: imagery.alt }]
        : [],
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ConciergeSlugPage({ params }: Props) {
  const { slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)
  if (!cat) notFound()

  const imagery  = getImagery(slug)
  const allFields  = cat.requiredFields
  const reqFields  = allFields.filter(f => f.required)
  const optFields  = allFields.filter(f => !f.required)

  const slaLabel = cat.fulfilmentModes.includes('instant')
    ? 'Same-day response'
    : cat.fulfilmentModes.includes('request_to_book')
      ? 'Response within 4 hours'
      : 'Response within 24 hours'

  const hasDedicatedFlow = DEDICATED_FLOW_SLUGS.has(slug)

  // For airport-services, the flow lives at /concierge/airport-services (its own page)
  // For private-aviation, link to the aviation-specific Aviapages route
  const dedicatedFlowHref = slug === 'airport-services'
    ? '/concierge/airport-services'
    : '/concierge/private-aviation'

  // Parse form fields for the 5 form-driven slugs
  const formFields = hasDedicatedFlow ? [] : parseFormFields(allFields)

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-8">
        <Link
          href="/concierge"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C]
            text-xs font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Concierge Services
        </Link>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[50vh] flex flex-col items-center justify-end pb-12">
        {/* Hero background */}
        {imagery ? (
          <>
            <div className="absolute inset-0">
              <Image
                src={imagery.hero}
                alt={imagery.alt}
                fill
                priority
                sizes="100vw"
                className="object-cover"
                style={{ objectPosition: imagery.position }}
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/60 via-[#0B1F3A]/50 to-[#0B1F3A]/95"
            />
          </>
        ) : (
          /* Fallback: radial gold glow on navy */
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 70%)',
            }}
          />
        )}

        {/* Hero content */}
        <div className="relative z-10 text-center px-6 pt-24">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">
            Walz Concierge
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5">
            {cat.name}
          </h1>
          {cat.description && (
            <p className="text-white/60 text-base max-w-xl mx-auto leading-relaxed mb-8">
              {cat.description}
            </p>
          )}

          {/* SLA badge */}
          <span className="inline-flex items-center gap-2 bg-white/5 border border-[#C9A84C]/30
            text-[#C9A84C] text-xs font-semibold px-4 py-2 rounded-full">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
            {slaLabel}
          </span>
        </div>
      </section>

      {/* ── What we arrange ────────────────────────────────────────────────── */}
      {(reqFields.length > 0 || optFields.length > 0) && (
        <section className="px-6 py-10 max-w-3xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] mb-5">
              What we arrange for you
            </p>

            {reqFields.length > 0 && (
              <ul className="space-y-2.5 mb-4">
                {reqFields.map(f => (
                  <li key={f.key} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] mt-1.5 flex-shrink-0"
                    />
                    <p className="text-white text-sm font-medium">{f.label}</p>
                  </li>
                ))}
              </ul>
            )}

            {optFields.length > 0 && (
              <>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mt-5 mb-3">
                  Nice to know (optional)
                </p>
                <ul className="space-y-2">
                  {optFields.map(f => (
                    <li key={f.key} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1.5 flex-shrink-0"
                      />
                      <p className="text-white/50 text-sm">{f.label}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Form or dedicated flow CTA ─────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        {hasDedicatedFlow ? (
          /* airport-services and private-aviation: link to their dedicated flow */
          <div className="text-center">
            <p className="text-white/50 text-sm mb-6 leading-relaxed">
              Our concierge team handles every detail.
              {slug === 'airport-services'
                ? ' Select the service you need and we\'ll book it instantly.'
                : ' Tell us your requirements and we\'ll come back with tailored options.'}
            </p>
            <Link
              href={dedicatedFlowHref}
              className="inline-block bg-[#C9A84C] text-[#0B1F3A] font-bold px-10 py-4
                rounded-full hover:bg-[#d4b86e] transition-colors text-sm tracking-wide"
            >
              {slug === 'airport-services'
                ? 'Book Airport Services →'
                : 'Request Private Aviation →'}
            </Link>
            <p className="text-white/30 text-xs mt-6">
              Or WhatsApp us on{' '}
              <a
                href="https://wa.me/12317902336"
                className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors"
              >
                +1 231 790 2336
              </a>
            </p>
          </div>
        ) : (
          /* All other slugs: multi-step web form */
          <>
            <div className="mb-8 text-center">
              <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] mb-2">
                Make a request
              </p>
              <p className="text-white/50 text-sm">
                Takes about two minutes. We&apos;ll come back with options within hours.
              </p>
            </div>
            <ConciergeRequestForm
              categorySlug={cat.slug}
              categoryName={cat.name}
              fields={formFields}
            />
            <p className="text-white/30 text-xs mt-8 text-center">
              Or WhatsApp us on{' '}
              <a
                href="https://wa.me/12317902336"
                className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors"
              >
                +1 231 790 2336
              </a>
            </p>
          </>
        )}
      </section>
    </main>
  )
}
