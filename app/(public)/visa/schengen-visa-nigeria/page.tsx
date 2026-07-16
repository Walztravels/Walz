import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Schengen Visa Nigeria: Which Country to Apply | Walz Travels',
  description: 'Complete guide to Schengen visa requirements for Nigerian passport holders in 2026. Which country to apply through, documents checklist, fees €90, and processing times. Apply with Walz Travels.',
  alternates: { canonical: 'https://www.walztravels.com/visa/schengen-visa-nigeria' },
  openGraph: {
    title: 'Schengen Visa for Nigerians 2026 — Which Country is Easiest?',
    description: 'Schengen visa requirements for Nigerians 2026. France, Germany, Spain — which country to apply through, documents, €90 fee, 10–15 day processing. Walz Travels handles end-to-end.',
    url: 'https://www.walztravels.com/visa/schengen-visa-nigeria',
  },
}

const faqs = [
  {
    q: 'Do Nigerians need a Schengen visa?',
    a: 'Yes. Nigerian passport holders require a Schengen visa to enter any of the 29 Schengen Area member states — including France, Germany, Spain, Italy, Netherlands, Portugal, and others. There is no visa on arrival for Nigerians.',
  },
  {
    q: 'Which Schengen country is easiest for Nigerians to apply through?',
    a: 'France and Portugal tend to have higher approval rates for Nigerian applicants. Spain is also relatively accessible. The best country to apply through is generally your main destination — you should only apply through a country you genuinely plan to visit.',
  },
  {
    q: 'How much does a Schengen visa cost for Nigerians?',
    a: 'The Schengen visa fee is €90 for adults, €45 for children aged 6–12, and free for children under 6. Fees are payable at the embassy or visa application centre and are non-refundable.',
  },
  {
    q: 'How long does Schengen visa processing take from Nigeria?',
    a: 'Most Schengen visa applications from Nigeria take 10–15 working days. Apply at least 4–6 weeks before your planned travel date. Walz Travels tracks your application and responds quickly to any embassy queries.',
  },
  {
    q: 'Is travel insurance mandatory for a Schengen visa?',
    a: 'Yes. All Schengen visa applicants must provide proof of travel insurance covering a minimum of €30,000 in medical expenses, valid for the entire Schengen area and your full period of stay. Without it, your application will be refused.',
  },
  {
    q: 'Can I visit all Schengen countries on one visa?',
    a: 'Yes. A Schengen visa issued by any member state allows you to travel freely throughout all 29 Schengen countries during its validity period. You must apply through the country of your main destination or first entry.',
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
  headline: 'Schengen Visa for Nigerians 2026: Requirements, Which Country & How to Apply',
  description: 'Complete guide to Schengen visa requirements for Nigerian passport holders in 2026.',
  author: { '@type': 'Organization', name: 'Walz Travels' },
  publisher: {
    '@type': 'Organization',
    name: 'Walz Travels',
    url: 'https://www.walztravels.com',
  },
  url: 'https://www.walztravels.com/visa/schengen-visa-nigeria',
}

const schengenCountries = [
  'Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Denmark',
  'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Iceland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland',
  'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
  'Switzerland', 'Iceland', 'Norway',
]

export default function SchengenVisaNigeriaPage() {
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
              <span className="text-white/80">Schengen Visa for Nigerians</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Visa Guide · Nigeria → Europe (Schengen Area)
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Schengen Visa for Nigerians 2026: Requirements, Which Country &amp; How to Apply
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              One Schengen visa opens 29 European countries. This guide covers every requirement Nigerian passport holders need to know — including which country to apply through for the best chance of approval.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* Key facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Visa fee (adult)', value: '€90' },
              { label: 'Countries covered', value: '29' },
              { label: 'Processing', value: '10–15 days' },
              { label: 'Max stay', value: '90 days' },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-lg font-bold text-[#0B1F3A]">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Section 1 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Do Nigerians Need a Schengen Visa?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Yes. Nigerian passport holders require a <strong>Schengen visa</strong> to enter any of the 29 Schengen Area member states. A single Schengen visa allows you to travel freely throughout all member states for up to 90 days within any 180-day period.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              You must apply through the embassy of your <strong>main destination</strong> — the country where you will spend the most nights. If you will spend equal time in multiple countries, apply through the country of first entry.
            </p>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-[#0B1F3A] mb-2">Schengen Area Countries</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                {schengenCountries.join(' · ')}
              </p>
            </div>
          </div>

          {/* Section 2 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Which Schengen Country is Easiest for Nigerians?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Approval rates vary between Schengen member states. Based on visa statistics and Walz Travels' experience processing Nigerian applications:
            </p>
            <div className="space-y-4">
              {[
                {
                  country: 'France',
                  rating: 'High approval',
                  color: 'green',
                  detail: 'France processes the highest volume of West African Schengen applications and has consistent approval rates. Air France operates direct Lagos–Paris CDG flights, making France a natural main destination choice.',
                },
                {
                  country: 'Spain',
                  rating: 'Good approval',
                  color: 'green',
                  detail: "Spain's approval rates for Nigerian applicants are generally reasonable. Spanish consulates are known for clear requirements.",
                },
                {
                  country: 'Portugal',
                  rating: 'High approval',
                  color: 'green',
                  detail: 'Portugal is often overlooked but has strong approval rates for Nigerian applicants — particularly those visiting Lisbon for tourism.',
                },
                {
                  country: 'Germany',
                  rating: 'Thorough but reliable',
                  color: 'amber',
                  detail: 'Germany has detailed financial requirements. If your finances are strong and documents are complete, Germany is very reliable.',
                },
                {
                  country: 'Netherlands',
                  rating: 'Good for genuine visits',
                  color: 'amber',
                  detail: 'Netherlands is a strong choice if Amsterdam is genuinely your main destination. KLM operates direct flights from Lagos.',
                },
              ].map((item, i) => (
                <div key={i} className={`p-4 rounded-xl border ${item.color === 'green' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[#0B1F3A]">{item.country}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.color === 'green' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.rating}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Schengen Visa Documents Checklist for Nigerians</h2>
            <div className="space-y-3">
              {[
                { doc: 'Valid Nigerian passport', note: 'Must be valid at least 3 months beyond your planned return date. Include all previous passports.' },
                { doc: 'Completed Schengen application form', note: 'Available from the embassy or official visa application centre.' },
                { doc: 'Passport photograph', note: 'Recent, white background, Schengen specification size.' },
                { doc: 'Travel insurance', note: 'MANDATORY. Minimum €30,000 medical cover. Valid for all Schengen countries for the full duration of your stay.' },
                { doc: 'Return flight booking', note: 'Confirmed ticket or itinerary showing entry and exit from the Schengen Area.' },
                { doc: 'Accommodation proof', note: 'Hotel bookings for every night of your stay, or invitation letter from host in Schengen country.' },
                { doc: 'Bank statements — last 3–6 months', note: 'Stamped by your bank. Should show sufficient balance for your trip.' },
                { doc: 'Proof of employment or income', note: 'Employment letter with salary, payslips, or business documents.' },
                { doc: 'Cover letter / itinerary', note: 'Detailed travel plan explaining where you will be each day. Walz Travels prepares these.' },
                { doc: 'Ties to Nigeria evidence', note: 'Employment confirmation showing return date, property documents, or business registration.' },
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

            {/* Insurance warning */}
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">Travel Insurance is Mandatory</p>
              <p className="text-xs text-red-700">
                Every Schengen visa application requires proof of travel insurance covering at least €30,000 in medical costs, valid for all Schengen countries. Missing this document means automatic refusal. Walz Travels includes Schengen-compliant insurance as part of our visa service.
              </p>
            </div>
          </div>

          {/* Section 4 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How Much Bank Balance for Schengen Visa from Nigeria?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Embassies look for a daily allowance — typically €50–€100 per day depending on the member state. Walz Travels recommends:
            </p>
            <div className="space-y-3">
              {[
                { trip: 'Solo trip (7 days)', amount: '€700–€1,000 equivalent' },
                { trip: 'Solo trip (14 days)', amount: '€1,400–€2,000 equivalent' },
                { trip: 'Family trip (4 people, 2 weeks)', amount: '€5,000–€8,000 equivalent' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{row.trip}</span>
                  <span className="text-sm font-semibold text-[#0B1F3A]">{row.amount}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Plus: return flight costs and accommodation should already be booked and evidenced. The balance should be consistent — not deposited the week before your application.
            </p>
          </div>

          {/* Section 5 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Schengen Visa Processing Time from Nigeria</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Most Schengen visa applications from Nigeria are processed in 10–15 working days. However, embassies can take longer during peak periods (June–September).
            </p>
            <div className="space-y-3">
              {[
                { item: 'Standard processing', time: '10–15 working days' },
                { item: 'Peak season (June–September)', time: 'Up to 4 weeks' },
                { item: 'Walz Travels recommended lead time', time: 'Apply at least 4–6 weeks before travel' },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{row.item}</p>
                    <p className="text-xs text-gray-500">{row.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 6 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">How to Apply for Schengen Visa with Walz Travels</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Walz Travels processes Schengen visas for Nigerian clients applying through France, Germany, Spain, Netherlands, Portugal, and other member states.
            </p>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Consultation', desc: 'We assess your travel plans and help you identify the best country to apply through based on your main destination and approval prospects.' },
                { step: '2', title: 'Document preparation', desc: 'Personalised checklist based on the specific embassy requirements for your chosen country.' },
                { step: '3', title: 'Travel insurance', desc: 'We arrange Schengen-compliant travel insurance meeting the €30,000 minimum requirement.' },
                { step: '4', title: 'Cover letter and itinerary', desc: 'We prepare a detailed day-by-day itinerary and cover letter demonstrating the genuine purpose of your visit.' },
                { step: '5', title: 'Application submission', desc: 'We manage submission through the relevant embassy or official visa application centre.' },
                { step: '6', title: 'Decision', desc: 'We notify you of the outcome and advise on next steps — whether collecting your visa or addressing a refusal.' },
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
              France · Germany · Spain · Netherlands · Portugal
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Apply for Your Schengen Visa with Walz Travels</h2>
            <p className="text-white/60 text-sm mb-6">
              We handle country selection, document preparation, travel insurance, and submission — end-to-end.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/visa/schengen"
                className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-400 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                Apply for Schengen Visa →
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
                { href: '/blog/schengen-visa-nigeria-easiest-country', label: 'Schengen Visa: Which Country is Easiest?' },
                { href: '/visa/uk-visa-nigeria', label: 'UK Visa for Nigerians' },
                { href: '/visa/canada-visa-nigeria', label: 'Canada Visa for Nigerians' },
                { href: '/flights/los-cdg', label: 'Lagos to Paris Flights' },
                { href: '/flights/los-fra', label: 'Lagos to Frankfurt Flights' },
                { href: '/flights/los-ams', label: 'Lagos to Amsterdam Flights' },
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
            Visa information is sourced from official Schengen embassy guidelines and updated regularly. Entry decisions are made solely by member state immigration authorities. Walz Travels is not liable for refused applications or denied entry.
          </p>
        </div>
      </main>
    </>
  )
}
