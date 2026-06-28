import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'UK Visa for Ghanaians 2026: Requirements, Documents & How to Apply | Walz Travels',
  description: 'Complete guide to UK visitor visa requirements for Ghanaian passport holders in 2026. Documents checklist, bank statement guide, processing times, and how to avoid refusals. Apply with Walz Travels.',
  alternates: { canonical: 'https://www.walztravels.com/visa/uk-visa-ghana' },
  openGraph: {
    title: 'UK Visa for Ghanaians 2026 — Requirements & Documents',
    description: 'UK visitor visa requirements for Ghanaians 2026. Documents checklist, processing times, approval tips. Apply with Walz Travels in Accra or Kumasi.',
    url: 'https://www.walztravels.com/visa/uk-visa-ghana',
  },
}

const faqs = [
  {
    q: 'Do Ghanaians need a visa to visit the UK?',
    a: 'Yes. Ghanaian passport holders require a UK Standard Visitor Visa before travelling to the United Kingdom. Applications are submitted online and biometrics are taken at VFS Global in Accra.',
  },
  {
    q: 'How much bank balance do I need for a UK visa from Ghana?',
    a: 'There is no official minimum, but Walz Travels recommends the equivalent of £2,000–£4,000 for a solo 7–14 day trip, held consistently for at least 6 months. Amounts should reflect your accommodation and living costs.',
  },
  {
    q: 'How long does UK visa processing take from Ghana?',
    a: 'Standard processing takes approximately 3 weeks. Priority service takes 5 working days. Super Priority is decided the next working day after biometrics. Walz Travels manages all processing tiers from Accra.',
  },
  {
    q: 'What are the most common UK visa refusal reasons for Ghanaians?',
    a: 'The most common reasons are: insufficient financial evidence, weak ties to Ghana (no stable employment or property), incomplete documents, and no clear purpose of visit. All are avoidable with proper preparation.',
  },
  {
    q: 'Can I get a multiple-entry UK visa from Ghana?',
    a: 'Yes. UK visitor visas can be issued as multiple-entry visas valid for 2, 5, or 10 years. The type depends on your travel history and profile. Walz Travels advises on how to build the strongest application for long-term access.',
  },
  {
    q: 'Does Walz Travels process UK visas for Ghanaians in Accra?',
    a: 'Yes. Walz Travels processes UK visa applications for Ghanaian clients based in Accra and Kumasi. We also assist diaspora Ghanaians in the UK, Canada, and UAE who have family applying from Ghana.',
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
  headline: 'UK Visa for Ghanaians 2026: Requirements, Documents & How to Apply',
  description: 'Complete guide to UK visitor visa requirements for Ghanaian passport holders in 2026.',
  author: { '@type': 'Organization', name: 'Walz Travels' },
  publisher: {
    '@type': 'Organization',
    name: 'Walz Travels',
    url: 'https://www.walztravels.com',
  },
  url: 'https://www.walztravels.com/visa/uk-visa-ghana',
}

export default function UkVisaGhanaPage() {
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
              <span className="text-white/80">UK Visa for Ghanaians</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Visa Guide · Ghana → United Kingdom
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              UK Visa for Ghanaians 2026: Requirements, Documents &amp; How to Apply
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              Everything Ghanaian passport holders need to know about applying for a UK visitor visa in 2026. Walz Travels processes UK visa applications from Accra and Kumasi.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* Section 1 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Do Ghanaians Need a UK Visa?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Yes. Ghanaian passport holders must obtain a <strong>UK Standard Visitor Visa</strong> before travelling to the United Kingdom. Applications are submitted online through the UKVI portal and biometrics are taken at the VFS Global centre in Accra.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A UK visitor visa allows stays of up to 6 months per visit. Multiple-entry visas can be issued for 2, 5, or 10 years depending on your travel profile and the visa officer's assessment.
            </p>
          </div>

          {/* Section 2 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Requirements for Ghanaian Passport Holders</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              UKVI assesses UK visitor visa applications from Ghana based on these key factors:
            </p>
            <ul className="space-y-3">
              {[
                'Genuine intention to visit for the stated purpose and leave before the visa expires',
                'Sufficient funds to cover the trip without working illegally in the UK',
                'Strong ties to Ghana — employment, property, family, or business commitments',
                'Clear purpose of visit supported by invitation letters, hotel bookings, or event confirmation',
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
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Documents Checklist for Ghanaians</h2>
            <div className="space-y-3">
              {[
                { doc: 'Valid Ghanaian passport', note: 'Valid 6+ months beyond your trip end date. Include old passports to show travel history.' },
                { doc: 'Completed online application form', note: 'Applied at gov.uk/apply-uk-visa. Print the confirmation page.' },
                { doc: 'Biometric appointment confirmation', note: 'Book at VFS Global Accra. Biometrics are fingerprints and a photograph.' },
                { doc: 'Bank statements — last 6 months', note: 'Stamped by your bank branch. Should show consistent balance.' },
                { doc: 'Employment letter', note: 'On company letterhead. Includes salary, job title, leave approval, and return date.' },
                { doc: 'Payslips — last 3 months', note: 'To confirm regular income matching your bank statement.' },
                { doc: 'Return flight booking', note: 'Confirmed ticket or flight itinerary showing departure from the UK.' },
                { doc: 'Accommodation proof', note: 'Hotel bookings for full stay, or invitation letter from UK host with their immigration status and UK address.' },
                { doc: 'Covering letter', note: 'Walz Travels writes custom covering letters addressing your specific situation.' },
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
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How Much Bank Balance for UK Visa from Ghana?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              UKVI does not publish a minimum balance figure. Walz Travels recommends these amounts, held consistently for at least 6 months:
            </p>
            <div className="space-y-3">
              {[
                { trip: 'Solo trip (7–14 days)', amount: '£2,000–£4,000 equivalent in GHS' },
                { trip: 'Couple (2 weeks)', amount: '£4,000–£7,000 equivalent' },
                { trip: 'Family (4 people, 2 weeks)', amount: '£6,000–£10,000 equivalent' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{row.trip}</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{row.amount}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Avoid making large deposits immediately before applying — this is known as funds parking and leads to refusals.
            </p>
          </div>

          {/* Section 5 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">UK Visa Processing Time from Ghana</h2>
            <div className="space-y-3">
              {[
                { tier: 'Standard', time: 'Approximately 3 weeks', cost: 'Included in visa fee' },
                { tier: 'Priority', time: '5 working days', cost: '+£500' },
                { tier: 'Super Priority', time: 'Next working day (after biometrics)', cost: '+£800' },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{row.tier}</p>
                    <p className="text-xs text-gray-500">{row.time} · {row.cost}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 6 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How to Apply for UK Visa with Walz Travels from Ghana</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Walz Travels processes UK visa applications for clients in Accra and Kumasi. Our process:
            </p>
            <div className="space-y-4">
              {[
                { step: '1', title: 'WhatsApp consultation', desc: 'Contact us on +44 7398 753797. We assess your profile and identify any risk factors.' },
                { step: '2', title: 'Personalised document checklist', desc: 'Based on your employment status, finances, and travel history.' },
                { step: '3', title: 'Document review', desc: 'Our visa specialists review every document for accuracy, consistency, and completeness.' },
                { step: '4', title: 'Custom covering letter', desc: 'We write a tailored covering letter that addresses your specific situation and any potential concerns.' },
                { step: '5', title: 'Submission and biometrics guidance', desc: 'We submit the online application and guide you through the VFS Accra biometrics appointment.' },
                { step: '6', title: 'Approval notification', desc: 'We track your application and notify you the moment a decision is made.' },
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
              Serving Accra · Kumasi · And the Ghanaian Diaspora
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Apply for Your UK Visa with Walz Travels</h2>
            <p className="text-white/60 text-sm mb-6">
              Our visa team handles your full application — document review, covering letter, and submission. High approval rate for Ghanaian clients.
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
                { href: '/visa/uk-visa-nigeria', label: 'UK Visa for Nigerians' },
                { href: '/visa/schengen-visa-nigeria', label: 'Schengen Visa for Nigerians' },
                { href: '/visa/canada-visa-ghana', label: 'Canada Visa for Ghanaians' },
                { href: '/flights/acc-lhr', label: 'Accra to London Flights' },
                { href: '/flights/acc-cdg', label: 'Accra to Paris Flights' },
                { href: '/flights/acc-ams', label: 'Accra to Amsterdam Flights' },
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
