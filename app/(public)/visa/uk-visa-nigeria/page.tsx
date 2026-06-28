import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'UK Visa for Nigerians 2026: Requirements, Documents & How to Apply | Walz Travels',
  description: 'Complete guide to UK visitor visa requirements for Nigerians in 2026. Documents checklist, bank statement requirements, processing times, and how to avoid refusals. 90%+ approval rate with Walz Travels.',
  alternates: { canonical: 'https://www.walztravels.com/visa/uk-visa-nigeria' },
  openGraph: {
    title: 'UK Visa for Nigerians 2026 — Requirements & Documents',
    description: 'UK visitor visa requirements for Nigerians 2026. Documents checklist, bank statement guide, processing times. Walz Travels achieves 90%+ approval rate.',
    url: 'https://www.walztravels.com/visa/uk-visa-nigeria',
  },
}

const faqs = [
  {
    q: 'Do Nigerians need a visa to visit the UK?',
    a: 'Yes. Nigerian passport holders require a UK Standard Visitor Visa (also called a UK visitor visa) to enter the United Kingdom. There is no visa on arrival option for Nigerians.',
  },
  {
    q: 'How much bank balance do I need for a UK visa from Nigeria?',
    a: 'There is no official minimum, but Walz Travels recommends £2,000–£4,000 for a solo 7–14 day trip, consistently held over at least 6 months. The balance should reflect the cost of your accommodation, living expenses, and return ticket.',
  },
  {
    q: 'How long does UK visa processing take from Nigeria?',
    a: 'Standard processing takes approximately 3 weeks. Priority service (£500 extra) takes 5 working days. Super Priority (£800 extra) is decided the next working day after biometrics. Walz Travels handles all tiers.',
  },
  {
    q: 'What is the UK visa refusal rate for Nigerians?',
    a: 'Approximately 35–45% of Nigerian UK visitor visa applications are refused when submitted without professional help. Walz Travels reduces this rate to under 10% for our clients through rigorous document review.',
  },
  {
    q: 'How many months of bank statement do I need for a UK visa?',
    a: 'UKVI requires a minimum of 3 months. Walz Travels always recommends 6 months for Nigerian applicants to demonstrate consistent financial history and reduce suspicion of funds parking.',
  },
  {
    q: 'Can I reapply after a UK visa refusal?',
    a: 'Yes. There is no mandatory waiting period. However, you must address the reason for refusal before reapplying. Walz Travels reviews refusal letters and builds stronger reapplications.',
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
  headline: 'UK Visa for Nigerians 2026: Requirements, Documents & How to Apply',
  description: 'Complete guide to UK visitor visa requirements for Nigerian passport holders in 2026.',
  author: { '@type': 'Organization', name: 'Walz Travels' },
  publisher: {
    '@type': 'Organization',
    name: 'Walz Travels',
    url: 'https://www.walztravels.com',
  },
  url: 'https://www.walztravels.com/visa/uk-visa-nigeria',
}

export default function UkVisaNigeriaPage() {
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
              <span className="text-white/80">UK Visa for Nigerians</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Visa Guide · Nigeria → United Kingdom
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              UK Visa for Nigerians 2026: Requirements, Documents &amp; How to Apply
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              Everything Nigerian passport holders need to know about applying for a UK visitor visa in 2026.
              Walz Travels achieves a 90%+ approval rate.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* Approval rate banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-[#0B1F3A] font-bold text-lg flex-shrink-0">
              90%
            </div>
            <div>
              <p className="font-bold text-[#0B1F3A]">Walz Travels UK Visa Approval Rate</p>
              <p className="text-sm text-gray-600">
                When the national average refusal rate is 35–45%, our rigorous document review and custom covering letters make the difference.
              </p>
            </div>
          </div>

          {/* Section 1 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Do Nigerians Need a UK Visa?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Yes. Nigerian passport holders must obtain a <strong>UK Standard Visitor Visa</strong> before travelling to the United Kingdom. There is no visa on arrival, and no e-visa option as of 2026. Applications are submitted online through the UKVI portal, and biometrics are taken at a VFS Global centre in Lagos or Abuja.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A UK visitor visa allows you to stay for up to 6 months per visit and can be issued as a multiple-entry visa valid for 2, 5, or 10 years. The type you receive depends on your profile and the discretion of the visa officer.
            </p>
          </div>

          {/* Section 2 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Requirements for Nigerian Passport Holders</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              UK Visas and Immigration (UKVI) assesses UK visitor visa applications based on whether they believe you will:
            </p>
            <ul className="space-y-3">
              {[
                'Genuinely intend to visit for the stated purpose',
                'Leave the UK before your visa expires',
                'Be able to fund your trip without working illegally',
                'Not claim public funds during your stay',
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
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Documents Checklist for Nigerians</h2>
            <div className="space-y-3">
              {[
                { doc: 'Valid Nigerian passport', note: 'Must be valid 6+ months beyond your trip. Include old passports.' },
                { doc: 'Completed online application form', note: 'Submitted at gov.uk/apply-uk-visa. Print the confirmation.' },
                { doc: 'Biometric appointment confirmation', note: 'Booked at VFS Global — Lagos or Abuja.' },
                { doc: 'Bank statements — last 6 months', note: 'Stamped by your bank. Must show consistent balance.' },
                { doc: 'Employment letter', note: 'On company letterhead. States salary, job title, approved leave dates.' },
                { doc: 'Proof of income (payslips)', note: 'Last 3 months minimum.' },
                { doc: 'Return flight booking', note: 'Confirmed ticket or flight itinerary.' },
                { doc: 'Accommodation proof', note: 'Hotel bookings or invitation letter from UK host with their proof of address and immigration status.' },
                { doc: 'Covering letter', note: 'Not mandatory but highly recommended. Walz Travels writes custom covering letters.' },
                { doc: 'Travel insurance', note: 'Not mandatory but strengthens the application.' },
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
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How Much Bank Balance for UK Visa from Nigeria?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              There is no official minimum stated by UKVI. However, based on approval patterns, Walz Travels recommends these consistent balances:
            </p>
            <div className="space-y-3">
              {[
                { trip: 'Solo trip (7–14 days)', amount: '£2,000–£4,000 equivalent' },
                { trip: 'Family trip (4 people, 2 weeks)', amount: '£6,000–£10,000 equivalent' },
                { trip: 'Long visit (up to 6 months)', amount: '£8,000–£15,000 equivalent' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{row.trip}</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{row.amount}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              These amounts must be present consistently — not deposited just before your application. Sudden large deposits (funds parking) lead to refusals.
            </p>
          </div>

          {/* Section 5 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Processing Time from Nigeria</h2>
            <div className="space-y-3">
              {[
                { tier: 'Standard', time: 'Approximately 3 weeks', cost: 'Included in visa fee' },
                { tier: 'Priority', time: '5 working days', cost: '+£500' },
                { tier: 'Super Priority', time: 'Next working day (after biometrics)', cost: '+£800' },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0B1F3A]">{row.tier}</p>
                    <p className="text-xs text-gray-500">{row.time} · {row.cost}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Apply at least 3 months before your travel date for standard processing. Walz Travels manages all processing tiers and tracks your application.
            </p>
          </div>

          {/* Section 6 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How to Apply for UK Visa with Walz Travels</h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Contact us on WhatsApp', desc: 'Send a message to +44 7398 753797. We respond within 2 hours during business hours.' },
                { step: '2', title: 'Initial consultation', desc: 'We review your profile — employment, finances, travel history, purpose of visit — and identify any risk areas.' },
                { step: '3', title: 'Document checklist', desc: 'You receive a personalised checklist based on your specific situation.' },
                { step: '4', title: 'Document review', desc: 'Our visa team reviews every document before submission. We flag problems before UKVI sees them.' },
                { step: '5', title: 'Application submission', desc: 'We complete the online form, write your covering letter, and guide you through biometrics.' },
                { step: '6', title: 'Decision notification', desc: 'We notify you the moment your visa is approved and advise on collection or passport return.' },
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
              90%+ Approval Rate · End-to-End Service
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Apply for Your UK Visa with Walz Travels</h2>
            <p className="text-white/60 text-sm mb-6">
              Our visa team handles every document, writes your covering letter, and manages your application from start to approval.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/visa/uk"
                className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-400 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                Apply for UK Visa →
              </Link>
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-8 py-3 border-2 border-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                WhatsApp +44 7398 753797
              </a>
            </div>
          </div>

          {/* Internal links */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4">Related Guides</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: '/blog/uk-visa-bank-statement-requirements-nigerians-2026', label: 'UK Visa Bank Statement Requirements for Nigerians' },
                { href: '/blog/uk-visa-refusal-reasons-nigerians', label: 'UK Visa Refusal Reasons for Nigerians' },
                { href: '/blog/uk-visitor-visa-documents-checklist-nigerians-2026', label: 'UK Visa Documents Checklist 2026' },
                { href: '/visa/uk-visa-ghana', label: 'UK Visa for Ghanaians' },
                { href: '/flights/los-lhr', label: 'Lagos to London Flights' },
                { href: '/blog/cheap-flights-lagos-london-2026', label: 'Cheapest Flights Lagos to London' },
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
            Visa information is sourced from UKVI and updated regularly. Entry decisions are made solely by UK immigration authorities. Walz Travels is not liable for refused applications or denied entry.
          </p>
        </div>
      </main>
    </>
  )
}
