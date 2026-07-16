import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Canada Visa Nigeria: TRV Requirements 2026 | Walz Travels',
  description: 'Complete guide to Canadian Temporary Resident Visa (TRV) requirements for Nigerians 2026. Documents checklist, biometrics, processing times, fees, and how to avoid refusals. Apply with Walz Travels.',
  alternates: { canonical: 'https://www.walztravels.com/visa/canada-visa-nigeria' },
  openGraph: {
    title: 'Canada Visa for Nigerians 2026 — Requirements & Documents',
    description: 'Canada TRV requirements for Nigerian passport holders 2026. Documents, biometrics, fees CAD $185, processing 8–12 weeks. Walz Travels handles end-to-end.',
    url: 'https://www.walztravels.com/visa/canada-visa-nigeria',
  },
}

const faqs = [
  {
    q: 'Do Nigerians need a visa for Canada?',
    a: 'Yes. Nigerian passport holders require a Canadian Temporary Resident Visa (TRV), commonly called a visitor visa, to enter Canada. You also need to provide biometrics (fingerprints and a photo) at a Visa Application Centre (VAC) in Lagos or Abuja.',
  },
  {
    q: 'How long does Canada visa processing take from Nigeria?',
    a: 'IRCC currently takes approximately 8–12 weeks to process Canadian visitor visa applications from Nigerian applicants. If additional documents are requested, add 2–4 weeks. Apply at least 3 months before your travel date.',
  },
  {
    q: 'How much does the Canada visa cost for Nigerians?',
    a: 'The Canada visitor visa application fee is CAD $100. Biometrics cost an additional CAD $85. Total: CAD $185 (approximately £110 / USD $135). Fees are non-refundable regardless of the decision.',
  },
  {
    q: 'How much bank balance do I need for Canada visa from Nigeria?',
    a: 'There is no official minimum. IRCC looks at whether your balance covers your trip cost. Walz Travels recommends the equivalent of CAD $3,000–$7,000 depending on trip length, held consistently over 6 months.',
  },
  {
    q: 'Does having a UK or US visa help my Canada application?',
    a: 'Yes, significantly. Valid stamps from the UK, USA, Schengen, or Australia demonstrate you have previously satisfied immigration authorities and returned home. Walz Travels highlights strong travel history in your application.',
  },
  {
    q: 'Can I get a multiple-entry Canada visa as a Nigerian?',
    a: 'Yes. If approved, most Canadian visitor visas issued to Nigerians are multiple-entry, valid for up to 10 years or until your passport expires (whichever comes first). This allows multiple visits within the validity period.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Canada Visa for Nigerians 2026: Requirements, Documents & How to Apply',
  description: 'Complete guide to Canadian Temporary Resident Visa requirements for Nigerian passport holders in 2026.',
  author: { '@type': 'Organization', name: 'Walz Travels' },
  publisher: {
    '@type': 'Organization',
    name: 'Walz Travels',
    url: 'https://www.walztravels.com',
  },
  url: 'https://www.walztravels.com/visa/canada-visa-nigeria',
}

export default function CanadaVisaNigeriaPage() {
  return (
    <>
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <main className="min-h-screen bg-[#F4F6F9]">
        {/* Hero */}
        <div className="bg-[#0B1F3A] text-white px-4 pt-8 pb-12">
          <div className="max-w-3xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-white/50 mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link href="/visa" className="hover:text-white transition-colors">Visa</Link>
              <span>/</span>
              <span className="text-white/80">Canada Visa for Nigerians</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Visa Guide · Nigeria → Canada
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Canada Visa for Nigerians 2026: Requirements, Documents &amp; How to Apply
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              Complete guide to the Canadian Temporary Resident Visa (TRV) for Nigerian passport holders in 2026. Walz Travels manages Canada visa applications from Lagos, Abuja, and across the diaspora.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* Key facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Application fee', value: 'CAD $100' },
              { label: 'Biometrics', value: 'CAD $85' },
              { label: 'Processing', value: '8–12 weeks' },
              { label: 'Max stay', value: '6 months' },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-lg font-bold text-[#0B1F3A]">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Section 1 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Do Nigerians Need a Visa for Canada?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Yes. Nigerian passport holders require a <strong>Temporary Resident Visa (TRV)</strong> — commonly called a Canadian visitor visa — to enter Canada. You must also provide biometrics at a Visa Application Centre (VAC) in Lagos or Abuja if it is your first time applying.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              The application is submitted online through the IRCC (Immigration, Refugees and Citizenship Canada) portal. Once approved, visitor visas are typically issued as multiple-entry visas valid for up to 10 years, allowing multiple visits of up to 6 months per entry.
            </p>
          </div>

          {/* Section 2 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Canada Visa Requirements for Nigerian Passport Holders</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              IRCC assesses Canadian visitor visa applications on whether you intend to visit temporarily and return to Nigeria. Key factors:
            </p>
            <ul className="space-y-3">
              {[
                'Strong ties to Nigeria: employment, business, property, or family dependants',
                'Sufficient funds to cover your stay and return travel',
                'Clear purpose of visit: tourism, family visit, business, or event',
                'Travel history: previous visa stamps from UK, USA, Schengen or Australia help significantly',
                'A detailed cover letter explaining your trip and your intention to return',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-[#0B1F3A] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Section 3 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Canada Visa Documents Checklist for Nigerians</h2>
            <div className="space-y-3">
              {[
                { doc: 'Valid Nigerian passport', note: 'Valid 6+ months beyond your planned return date. Include all old passports.' },
                { doc: 'IMM 5257 — Application for Visitor Visa', note: 'Completed online through the IRCC portal.' },
                { doc: 'IMM 5645 — Family Information form', note: 'Required for all Canadian visa applications.' },
                { doc: 'Digital passport photograph', note: 'Must meet IRCC specifications — white background, no glasses.' },
                { doc: 'Biometrics', note: 'Fingerprints and photo taken at VAC Lagos or Abuja. Fee: CAD $85.' },
                { doc: 'Bank statements — last 6 months', note: 'Stamped by bank. Should show consistent balance and regular income.' },
                { doc: 'Proof of employment or business', note: 'Employment letter with salary and approved leave, OR business registration and bank statements.' },
                { doc: 'Purpose of visit letter', note: 'Walz Travels writes detailed cover letters explaining your trip and demonstrating ties to Nigeria.' },
                { doc: 'Proof of accommodation in Canada', note: 'Hotel bookings, or invitation letter from Canadian host with their status in Canada.' },
                { doc: 'Travel history evidence', note: 'Copies of previous visa stamps — UK, USA, Schengen, or other strong visa-issuing countries.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl">
                  <span className="text-green-500 font-bold text-sm flex-shrink-0 mt-0.5">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{item.doc}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How Much Bank Balance for Canada Visa from Nigeria?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              IRCC does not publish a minimum. Walz Travels recommends these amounts, consistently held for 6 months:
            </p>
            <div className="space-y-3">
              {[
                { trip: 'Solo trip (2 weeks)', amount: 'CAD $3,000–$5,000 equivalent' },
                { trip: 'Family trip (4 people, 2 weeks)', amount: 'CAD $8,000–$12,000 equivalent' },
                { trip: 'Extended visit (1–3 months)', amount: 'CAD $10,000–$20,000 equivalent' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{row.trip}</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{row.amount}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Balances should be consistent over time. Sudden large deposits (funds parking) are a major red flag for Canadian visa officers.
            </p>
          </div>

          {/* Section 5 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Canada Visa Processing Time from Nigeria</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              IRCC processing times for Nigerian applicants as of 2026:
            </p>
            <div className="space-y-3">
              {[
                { stage: 'Online application submission', time: 'Immediate — you receive an acknowledgement of receipt' },
                { stage: 'Biometrics required', time: 'IRCC requests biometrics — attend VAC within 30 days of request' },
                { stage: 'Processing', time: '8–12 weeks after biometrics received' },
                { stage: 'Additional documents requested', time: 'Adds 2–4 weeks' },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{row.stage}</p>
                    <p className="text-xs text-gray-500">{row.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Apply at least 3 months before your travel date. Walz Travels tracks your application and responds to IRCC document requests within 24 hours.
            </p>
          </div>

          {/* Section 6 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How to Apply for Canada Visa with Walz Travels</h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Consultation', desc: 'We review your profile — employment, finances, travel history, and purpose of visit. We identify any risk areas.' },
                { step: '2', title: 'Document preparation', desc: 'We prepare your personalised checklist and guide you through gathering all required documents.' },
                { step: '3', title: 'Application forms', desc: 'We complete IMM 5257 and IMM 5645 on your behalf and review every entry.' },
                { step: '4', title: 'Cover letter', desc: 'We write a detailed, tailored cover letter demonstrating your purpose of visit and ties to Nigeria.' },
                { step: '5', title: 'Biometrics', desc: 'We book your VAC appointment in Lagos or Abuja and prepare you for what to expect.' },
                { step: '6', title: 'Decision', desc: 'We notify you of the outcome and advise on next steps — whether collecting your passport or addressing a refusal.' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{item.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-5">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-sm font-semibold text-[#0B1F3A] mb-1">{faq.q}</p>
                  <p className="text-sm text-gray-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Lagos · Abuja · Toronto · End-to-End Service
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Apply for Canada Visa with Walz Travels</h2>
            <p className="text-white/60 text-sm mb-6">
              We manage your full Canadian visitor visa application — forms, documents, biometrics, cover letter, and tracking.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/visa/canada"
                className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-400 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                Apply for Canada Visa →
              </Link>
              <a
                href="https://wa.me/12317902336"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-8 py-3 border-2 border-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                WhatsApp +12317902336
              </a>
            </div>
          </div>

          {/* Internal links */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4">Related Guides</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: '/blog/canada-visa-requirements-nigerians-2026', label: 'Canada Visa Requirements for Nigerians — Full Guide' },
                { href: '/visa/uk-visa-nigeria', label: 'UK Visa for Nigerians' },
                { href: '/visa/canada-visa-ghana', label: 'Canada Visa for Ghanaians' },
                { href: '/flights/los-yyz', label: 'Lagos to Toronto Flights' },
                { href: '/visa/schengen-visa-nigeria', label: 'Schengen Visa for Nigerians' },
                { href: '/blog/walz-travels-90-percent-visa-approval-rate', label: 'How Walz Travels Gets 90% Approvals' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-sm text-[#0B1F3A] font-medium"
                >
                  <span className="text-amber-500">→</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed pb-6">
            Visa information is sourced from IRCC and updated regularly. Entry decisions are made solely by Canadian immigration authorities. Walz Travels is not liable for refused applications or denied entry.
          </p>
        </div>
      </main>
    </>
  )
}
