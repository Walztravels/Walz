import type { Metadata } from 'next'
import Link from 'next/link'
import prisma from '@/lib/db'
import { TERMS_SECTIONS, type LegalSection } from '@/lib/content/legal-content'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Walz Travels Terms of Service — the rules and conditions that govern use of our travel booking platform.',
  alternates: { canonical: 'https://www.walztravels.com/terms' },
}

// ISR: super_admin edits made via /admin/content appear within a minute —
// no redeploy needed — and visitors still get a cached page. Matches the
// pattern used by /careers (app/careers/page.tsx).
export const revalidate = 60

// SiteContent-backed: each section's heading/body is one editable pair of
// rows (group 'terms', keys `${key}_title` / `${key}_body`) — see
// app/api/admin/content/site/route.ts and /admin/content ("Terms of
// Service" tab, super_admin only). TERMS_SECTIONS is the verbatim fallback,
// so a database error or a not-yet-seeded row never leaves this page empty
// or exposes a DB error to visitors.
async function getSections(): Promise<LegalSection[]> {
  try {
    const rows = await prisma.siteContent.findMany({ where: { group: 'terms' } })
    if (rows.length === 0) return TERMS_SECTIONS
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return TERMS_SECTIONS.map((s) => ({
      ...s,
      title: map[`${s.key}_title`] ?? s.title,
      body:  map[`${s.key}_body`]  ?? s.body,
    }))
  } catch (err) {
    console.error('[terms] DB read failed, using fallback content:', err)
    return TERMS_SECTIONS
  }
}

export default async function TermsPage() {
  const lastUpdated = 'September 2026'
  const sections = await getSections()

  const termsSchema = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: 'Terms of Service — Walz Travels',
    url: 'https://www.walztravels.com/terms',
    description: 'Terms and conditions for using Walz Travels booking and travel services.',
    publisher: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(termsSchema) }} />

      {/* Header */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5 text-center">
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Legal</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Terms of Service</h1>
        <p className="text-white/40 text-sm">Last updated: {lastUpdated}</p>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Key points:</strong> Walz Travels acts as your travel agent, not the airline or hotel. Visa approvals are not guaranteed. Cancellation terms vary by service type. Questions? <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">Contact us</a>.
          </p>
        </div>

        <div className="space-y-10">
          {sections.map(({ key, title, body }) => (
            <section key={key}>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h2>
              <div className="text-[#0B1F3A]/65 text-sm leading-relaxed whitespace-pre-line">{body}</div>
            </section>
          ))}
        </div>

        {/* Footer links */}
        <div className="mt-14 pt-8 border-t border-[#E2D9CC] flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-[#C9A84C] hover:underline font-medium">Privacy Policy</Link>
          <Link href="/help/cancellations" className="text-[#C9A84C] hover:underline font-medium">Cancellation Policy</Link>
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline font-medium">Contact Us</a>
        </div>

      </div>
    </div>
  )
}
