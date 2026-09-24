import type { Metadata } from 'next'
import Link from 'next/link'
import prisma from '@/lib/db'
import { PRIVACY_SECTIONS, type LegalSection } from '@/lib/content/legal-content'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Walz Travels Privacy Policy — how we collect, use and protect your personal data.',
  alternates: { canonical: 'https://www.walztravels.com/privacy' },
}

// ISR: super_admin edits made via /admin/content appear within a minute —
// no redeploy needed — and visitors still get a cached page. Matches the
// pattern used by /careers (app/careers/page.tsx).
export const revalidate = 60

// SiteContent-backed: each section's heading/body is one editable pair of
// rows (group 'privacy', keys `${key}_title` / `${key}_body`) — see
// app/api/admin/content/site/route.ts and /admin/content ("Privacy Policy"
// tab, super_admin only). PRIVACY_SECTIONS is the verbatim fallback, so a
// database error or a not-yet-seeded row never leaves this page empty or
// exposes a DB error to visitors.
async function getSections(): Promise<LegalSection[]> {
  try {
    const rows = await prisma.siteContent.findMany({ where: { group: 'privacy' } })
    if (rows.length === 0) return PRIVACY_SECTIONS
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return PRIVACY_SECTIONS.map((s) => ({
      ...s,
      title: map[`${s.key}_title`] ?? s.title,
      body:  map[`${s.key}_body`]  ?? s.body,
    }))
  } catch (err) {
    console.error('[privacy] DB read failed, using fallback content:', err)
    return PRIVACY_SECTIONS
  }
}

export default async function PrivacyPage() {
  const lastUpdated = 'September 2026'
  const sections = await getSections()

  const privacySchema = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: 'Privacy Policy — Walz Travels',
    url: 'https://www.walztravels.com/privacy',
    description: 'How Walz Travels collects, uses and protects your personal information.',
    publisher: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(privacySchema) }} />

      {/* Header */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5 text-center">
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Legal</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Privacy Policy</h1>
        <p className="text-white/40 text-sm">Last updated: {lastUpdated}</p>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Summary:</strong> We collect only the data needed to provide your travel services. We never sell your data. You have full rights to access, correct or delete your information. Questions? Email <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">contact@walztravels.com</a>.
          </p>
        </div>

        <div className="space-y-10">
          {sections.map(({ key, title, body, anchorId }) => (
            <section key={key} {...(anchorId ? { id: anchorId } : {})}>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h2>
              <div className="text-[#0B1F3A]/65 text-sm leading-relaxed whitespace-pre-line">{body}</div>
            </section>
          ))}
        </div>

        {/* Footer links */}
        <div className="mt-14 pt-8 border-t border-[#E2D9CC] flex flex-wrap gap-4 text-sm">
          <Link href="/terms" className="text-[#C9A84C] hover:underline font-medium">Terms of Service</Link>
          <Link href="/help" className="text-[#C9A84C] hover:underline font-medium">Help Centre</Link>
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline font-medium">Contact Us</a>
        </div>

      </div>
    </div>
  )
}
