import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Cheap Flights from Lagos 2026 | Best Fares | Walz Travels',
  description: 'Cheap flights from Lagos (LOS) to London, Dubai, Toronto, New York and more. Best fares from £280. IATA-certified travel agency.',
  alternates: { canonical: 'https://www.walztravels.com/flights/cheap-flights-from-lagos' },
  openGraph: {
    title: 'Cheap Flights from Lagos 2026 — Best Fares',
    description: 'Best cheap flight deals from Lagos Murtala Muhammed Airport (LOS) to top destinations. Compare live fares with Walz Travels.',
    url: 'https://www.walztravels.com/flights/cheap-flights-from-lagos',
  },
}

const faqs = [
  {
    q: 'What are the cheapest flights from Lagos right now?',
    a: 'The cheapest flights from Lagos typically run to Dubai (from £280), London (from £364), and Accra (from £120). Connecting flights via Ethiopian Airlines, Qatar Airways, or Turkish Airlines often offer the lowest fares. Walz Travels monitors live fares and can set price alerts on your preferred routes.',
  },
  {
    q: 'Which airlines fly from Lagos?',
    a: 'Airlines operating from Lagos Murtala Muhammed International Airport (LOS) include British Airways, Emirates, Qatar Airways, Ethiopian Airlines, Turkish Airlines, Air Peace, Egypt Air, Kenya Airways, and RwandAir. Emirates and Air Peace offer direct service to Dubai. British Airways flies direct to London.',
  },
  {
    q: 'What is the cheapest month to fly from Lagos?',
    a: 'January and February are typically the cheapest months to fly from Lagos, as demand is lowest after the holiday season. April–May is another low-season window. Avoid June–August (UK summer holidays) and December–January (Christmas) for the best prices. Book 8–12 weeks in advance for the lowest fares.',
  },
  {
    q: 'How can I find cheap international flights from Lagos?',
    a: 'To find cheap flights from Lagos: (1) Book 8–12 weeks ahead; (2) Fly mid-week (Tuesday or Wednesday); (3) Consider connecting flights via Addis Ababa, Doha, or Dubai; (4) Set price alerts with Walz Travels; (5) Be flexible on dates by ±3 days. Walz Travels has direct access to Sabre GDS for real-time pricing across 400+ airlines.',
  },
  {
    q: 'Do I need a visa to fly from Lagos to London?',
    a: 'Yes. Nigerian passport holders require a UK Standard Visitor Visa to fly to London. The visa fee is £115 and processing takes 3–8 weeks. Walz Travels processes UK visas for Nigerians end-to-end, including document preparation and submission — alongside your flight booking.',
  },
  {
    q: 'What is the cheapest flight from Lagos to London?',
    a: 'The cheapest Lagos to London flights operate on Qatar Airways (via Doha), Ethiopian Airlines (via Addis Ababa), and Turkish Airlines (via Istanbul). Economy fares start from around £364 in the low season. British Airways operates the only direct Lagos–London flight at around 6 hours 40 minutes.',
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

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.walztravels.com' },
    { '@type': 'ListItem', position: 2, name: 'Flights', item: 'https://www.walztravels.com/flights' },
    { '@type': 'ListItem', position: 3, name: 'Cheap Flights from Lagos', item: 'https://www.walztravels.com/flights/cheap-flights-from-lagos' },
  ],
}

const TOP_ROUTES = [
  { slug: 'los-lhr', label: 'Lagos → London', iata: 'LOS–LHR', from: '£364', flag: '🇬🇧' },
  { slug: 'los-dxb', label: 'Lagos → Dubai', iata: 'LOS–DXB', from: '£280', flag: '🇦🇪' },
  { slug: 'los-yyz', label: 'Lagos → Toronto', iata: 'LOS–YYZ', from: '£640', flag: '🇨🇦' },
  { slug: 'los-jfk', label: 'Lagos → New York', iata: 'LOS–JFK', from: '£620', flag: '🇺🇸' },
  { slug: 'los-jnb', label: 'Lagos → Johannesburg', iata: 'LOS–JNB', from: '£290', flag: '🇿🇦' },
  { slug: 'los-cdg', label: 'Lagos → Paris', iata: 'LOS–CDG', from: '£390', flag: '🇫🇷' },
  { slug: 'los-fra', label: 'Lagos → Frankfurt', iata: 'LOS–FRA', from: '£380', flag: '🇩🇪' },
  { slug: 'los-ams', label: 'Lagos → Amsterdam', iata: 'LOS–AMS', from: '£375', flag: '🇳🇱' },
  { slug: 'los-nbo', label: 'Lagos → Nairobi', iata: 'LOS–NBO', from: '£220', flag: '🇰🇪' },
  { slug: 'los-iad', label: 'Lagos → Washington DC', iata: 'LOS–IAD', from: '£610', flag: '🇺🇸' },
  { slug: 'los-atl', label: 'Lagos → Atlanta', iata: 'LOS–ATL', from: '£590', flag: '🇺🇸' },
  { slug: 'los-bom', label: 'Lagos → Mumbai', iata: 'LOS–BOM', from: '£350', flag: '🇮🇳' },
]

export default function CheapFlightsFromLagosPage() {
  return (
    <>
      <Script id="faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script id="breadcrumb-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <main className="min-h-screen bg-[#FAF7F2]">
        {/* Hero */}
        <div className="bg-[#0B1F3A] text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
            <nav className="flex items-center gap-2 text-sm text-white/50 mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link href="/flights" className="hover:text-white transition-colors">Flights</Link>
              <span>/</span>
              <span className="text-white/80">Cheap Flights from Lagos</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Lagos (LOS) · 400+ Airlines · Live Fares
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Cheap Flights from Lagos 2026
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              Find the best cheap international flights from Lagos Murtala Muhammed Airport (LOS) to London, Dubai, Toronto, New York and beyond. Walz Travels compares live fares across 400+ airlines.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

          {/* Route grid */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-2">Top Flight Routes from Lagos</h2>
            <p className="text-sm text-gray-500 mb-5">Estimated one-way economy fares. Live pricing available on the search page.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOP_ROUTES.map(route => (
                <Link
                  key={route.slug}
                  href={`/flights/${route.slug}`}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{route.flag}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{route.label}</p>
                      <p className="text-xs text-gray-400 font-mono">{route.iata}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-600">from {route.from}</p>
                    <p className="text-xs text-gray-400">one-way</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Tips section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">How to Find the Cheapest Flights from Lagos</h2>
            <div className="space-y-4">
              {[
                {
                  tip: 'Book 8–12 weeks in advance',
                  detail: 'The sweet spot for cheap flights from Lagos is 8–12 weeks before departure. Last-minute bookings are rarely cheap on international routes.',
                },
                {
                  tip: 'Fly in January or February',
                  detail: 'The cheapest months to fly from Lagos are January and February (post-holiday low season) and April–May. Avoid June–August and December–January if possible.',
                },
                {
                  tip: 'Consider connecting flights',
                  detail: 'Direct flights from Lagos to London (British Airways) or Dubai (Emirates) are convenient but often more expensive. Connecting via Addis Ababa (Ethiopian), Doha (Qatar), or Istanbul (Turkish) can save £100–£300.',
                },
                {
                  tip: 'Fly mid-week',
                  detail: 'Tuesday and Wednesday departures from Lagos are typically £30–£80 cheaper than Friday and Sunday flights on popular routes.',
                },
                {
                  tip: 'Set a price alert',
                  detail: 'Walz Travels monitors live fares on your preferred routes. WhatsApp us your route and target price and we will notify you when fares drop.',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{item.tip}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Airlines section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">Airlines Flying from Lagos</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Lagos Murtala Muhammed International Airport (LOS) is served by over 20 international airlines. Key carriers include:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                'British Airways', 'Emirates', 'Qatar Airways', 'Ethiopian Airlines',
                'Turkish Airlines', 'Air Peace', 'Egypt Air', 'Kenya Airways',
                'RwandAir', 'Lufthansa', 'Delta Air Lines', 'South African Airways',
              ].map(airline => (
                <div key={airline} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-[#0B1F3A]">
                  {airline}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              British Airways operates the only direct Lagos–London service. Emirates and Air Peace operate direct Lagos–Dubai flights. All other long-haul routes connect through at least one hub.
            </p>
          </div>

          {/* Visa note */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <h2 className="text-base font-bold text-[#0B1F3A] mb-2">Visa Requirements for Nigerian Travellers</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              Nigerian passport holders require a visa to enter the UK, Canada, USA, Schengen Area, and most European countries. Walz Travels processes visas alongside flight bookings so you have everything sorted in one place.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { href: '/visa/uk-visa-nigeria', label: 'UK Visa for Nigerians' },
                { href: '/visa/canada-visa-nigeria', label: 'Canada Visa for Nigerians' },
                { href: '/visa/schengen-visa-nigeria', label: 'Schengen Visa for Nigerians' },
                { href: '/visa', label: 'All Visa Services' },
              ].map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 p-3 rounded-xl bg-white border border-amber-200 hover:border-amber-400 transition-colors text-sm text-[#0B1F3A] font-medium"
                >
                  <span className="text-amber-500">→</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-5">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-sm font-semibold text-[#0B1F3A] mb-1">{faq.q}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              400+ Airlines · Sabre GDS · IATA Certified
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Search Cheap Flights from Lagos</h2>
            <p className="text-white/60 text-sm mb-6">
              Walz Travels searches live fares across 400+ airlines. WhatsApp us your route and travel dates for a personalised quote.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/flights"
                className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-400 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                Search live fares →
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

          <p className="text-xs text-gray-400 text-center leading-relaxed pb-6">
            Fares shown are estimates based on historical pricing and are subject to availability at time of booking. Walz Travels is IATA registered. All prices in GBP unless stated.
          </p>
        </div>
      </main>
    </>
  )
}
