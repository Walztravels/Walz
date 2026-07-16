import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'

export const revalidate = 86400

interface RouteData {
  from: string
  to: string
  fromIata: string
  toIata: string
  fromCountry: string
  toCountry: string
  estimatedFrom: string
  currency: string
  airlines: string[]
  flightTime: string
  layover: string | null
  description: string
  bodyParagraphs: string[]
  faqs?: Array<{ q: string; a: string }>
  titleOverride?: string
}

const ROUTES: Record<string, RouteData> = {
  'los-lhr': {
    from: 'Lagos', to: 'London', fromIata: 'LOS', toIata: 'LHR',
    fromCountry: 'Nigeria', toCountry: 'United Kingdom',
    estimatedFrom: '£364', currency: 'GBP',
    airlines: ['British Airways', 'Qatar Airways', 'Ethiopian Airlines', 'Emirates', 'Turkish Airlines'],
    flightTime: '6h 40m direct / 10–13h connecting',
    layover: 'Via Doha, Dubai, Addis Ababa or Istanbul',
    description: 'Lagos–London flights from £364. British Airways direct, plus Qatar Airways & Ethiopian Airlines. IATA-certified agency — 24/7 expert support.',
    bodyParagraphs: [
      'The Lagos (LOS) to London Heathrow (LHR) route is one of the busiest between West Africa and Europe. British Airways operates the only direct service — approximately 6 hours 40 minutes with no layover. Connecting options via Doha (Qatar Airways), Dubai (Emirates), Addis Ababa (Ethiopian Airlines), and Istanbul (Turkish Airlines) typically take 10–13 hours total.',
      'Prices vary by season. The cheapest months are January and February, when economy fares can fall to £364. The most expensive period is June–August (UK summer) when fares rise to £680–£950. Walz Travels monitors live fares across all airlines and can alert you when prices drop.',
      'Nigerian passport holders need a UK visitor visa to travel on this route. Walz Travels processes UK visas with a 90%+ approval rate and can package your visa and flights together.',
    ],
  },
  'acc-lhr': {
    from: 'Accra', to: 'London', fromIata: 'ACC', toIata: 'LHR',
    fromCountry: 'Ghana', toCountry: 'United Kingdom',
    estimatedFrom: '£397', currency: 'GBP',
    airlines: ['Brussels Airlines', 'Royal Air Maroc', 'Ethiopian Airlines', 'British Airways', 'Turkish Airlines'],
    flightTime: '8–12h connecting',
    layover: 'Via Brussels, Casablanca, Addis Ababa or Istanbul',
    description: 'Cheap flights Accra to London from £397. Brussels Airlines, Royal Air Maroc, Ethiopian Airlines & British Airways. Book with Walz Travels.',
    titleOverride: 'Cheap Flights Accra to London (ACC–LHR) from £397 | Walz Travels',
    bodyParagraphs: [
      'Flights from Accra Kotoka International Airport (ACC) to London Heathrow (LHR) all connect through a hub — there is no direct service from Accra to London as of 2026. The most popular cheap Accra to London routes use Brussels Airlines (via Brussels), Royal Air Maroc (via Casablanca), Ethiopian Airlines (via Addis Ababa), and Turkish Airlines (via Istanbul). British Airways also operates Accra–London connections via other hubs.',
      'The cheapest Accra to London flights are typically found between January and March. Economy return fares start from approximately £397 during the low season. Peak travel in June–August (UK summer holidays) and December–January (Christmas/New Year) pushes fares to £650–£900+. Booking 8–12 weeks ahead and flying mid-week (Tuesday/Wednesday) secures the best prices. Walz Travels monitors live fares and sends price alerts on request.',
      'Ghanaian passport holders require a UK Standard Visitor Visa before boarding any Accra to London flight. Applications are submitted online and biometrics are collected at VFS Global in Accra. Walz Travels processes UK visa applications for Ghanaian clients end-to-end — document review, covering letter, and submission — with a strong approval rate. Book your Accra to London flights and UK visa together for a streamlined experience.',
      'The total journey time from Accra to London varies by connection. Brussels Airlines via Brussels (BRU) takes approximately 9–10 hours. Royal Air Maroc via Casablanca (CMN) takes 9–11 hours. Ethiopian Airlines via Addis Ababa (ADD) takes 11–13 hours. Istanbul connections (Turkish Airlines) take approximately 10–12 hours.',
    ],
    faqs: [
      {
        q: 'What are the cheapest flights from Accra to London?',
        a: 'The cheapest Accra to London flights typically operate via Brussels (Brussels Airlines), Casablanca (Royal Air Maroc), or Addis Ababa (Ethiopian Airlines). Economy return fares start from around £397 in the low season (January–March). Walz Travels monitors live fares across all airlines on this route.',
      },
      {
        q: 'Is there a direct flight from Accra to London?',
        a: 'There is currently no direct (non-stop) flight from Accra (ACC) to London (LHR) as of 2026. All Accra to London flights connect through at least one hub. Brussels, Casablanca, Addis Ababa, and Istanbul are the most common connection cities.',
      },
      {
        q: 'How long is the flight from Accra to London?',
        a: 'The total journey from Accra to London takes 9–13 hours depending on the connection. Brussels Airlines via Brussels is one of the quickest at around 9–10 hours. Ethiopian Airlines via Addis Ababa takes approximately 11–13 hours.',
      },
      {
        q: 'Do Ghanaians need a visa to fly to London from Accra?',
        a: 'Yes. Ghanaian passport holders require a UK Standard Visitor Visa to enter the United Kingdom. Applications are submitted online through the UKVI portal and biometrics are collected at VFS Global in Accra. Walz Travels processes UK visas for Ghanaians with expert document preparation.',
      },
      {
        q: 'Which airlines fly from Accra to London?',
        a: 'Airlines operating connecting flights from Accra (ACC) to London Heathrow (LHR) include Brussels Airlines (via Brussels), Royal Air Maroc (via Casablanca), Ethiopian Airlines (via Addis Ababa), Turkish Airlines (via Istanbul), and British Airways (via various connections). Fares and schedules vary by season.',
      },
    ],
  },
  'los-dxb': {
    from: 'Lagos', to: 'Dubai', fromIata: 'LOS', toIata: 'DXB',
    fromCountry: 'Nigeria', toCountry: 'United Arab Emirates',
    estimatedFrom: '£280', currency: 'GBP',
    airlines: ['Emirates', 'Air Peace', 'Ethiopian Airlines', 'Qatar Airways'],
    flightTime: '6h 30m direct (Emirates)',
    layover: 'Direct on Emirates and Air Peace',
    description: 'Flights Lagos to Dubai from £280. Emirates direct service 6h30m. Air Peace also operates direct. Multiple connecting options. Book with Walz Travels.',
    bodyParagraphs: [
      'Emirates operates daily direct flights from Lagos Murtala Muhammed International (LOS) to Dubai International (DXB), covering the distance in approximately 6 hours 30 minutes. Air Peace also operates a direct Lagos–Dubai service. This is one of the better-connected routes for Nigerian travellers.',
      'UAE tourist visas for Nigerians typically cost AED 350 (approximately £75) and take 2–3 working days to process. Walz Travels handles UAE visas and flights together.',
      'Dubai is a popular stopover destination for Nigerians travelling onward to other parts of Asia or Australia. Emirates allows extended stopovers on through-tickets.',
    ],
  },
  'los-jfk': {
    from: 'Lagos', to: 'New York', fromIata: 'LOS', toIata: 'JFK',
    fromCountry: 'Nigeria', toCountry: 'United States',
    estimatedFrom: '£620', currency: 'GBP',
    airlines: ['Delta', 'United', 'Ethiopian Airlines', 'Qatar Airways', 'British Airways'],
    flightTime: '12–16h connecting',
    layover: 'Via London, Doha, Addis Ababa or Amsterdam',
    description: 'Flights Lagos to New York (JFK) from £620. Delta, United, Ethiopian Airlines. Connect via London, Doha or Addis Ababa. Book with Walz Travels.',
    bodyParagraphs: [
      'There is no direct flight from Lagos (LOS) to New York JFK or Newark (EWR) as of 2026. All flights connect through major hubs. Common routing: Lagos → London Heathrow → New York (British Airways, Virgin Atlantic), Lagos → Doha → New York (Qatar Airways), Lagos → Addis Ababa → Washington Dulles or New York (Ethiopian Airlines).',
      'Nigerian passport holders require a US B1/B2 visa to travel to New York. This is one of the more challenging visas to obtain. Walz Travels advises on US visa applications alongside flight bookings.',
      'Total journey times range from 12 to 16 hours depending on the connection. London is the most common hub — British Airways offers good connections at Heathrow.',
    ],
  },
  'acc-jfk': {
    from: 'Accra', to: 'New York', fromIata: 'ACC', toIata: 'JFK',
    fromCountry: 'Ghana', toCountry: 'United States',
    estimatedFrom: '£580', currency: 'GBP',
    airlines: ['Delta', 'United', 'Ethiopian Airlines', 'Brussels Airlines'],
    flightTime: '13–17h connecting',
    layover: 'Via Brussels, Addis Ababa, London or Amsterdam',
    description: 'Flights Accra to New York from £580. Delta, United, Ethiopian Airlines via multiple hubs. IATA certified. Book with Walz Travels.',
    bodyParagraphs: [
      'Accra to New York flights connect through European and African hubs. Key routing options include Accra → Brussels → New York (Brussels Airlines + Delta/United codeshare), Accra → Addis Ababa → Washington (Ethiopian Airlines), and Accra → Amsterdam → New York (KLM).',
      'Delta Air Lines operates a nonstop service from Accra to New York JFK — check the current schedule with Walz Travels as frequencies and availability may vary by season.',
      'Ghanaian passport holders require a US B1/B2 visitor visa. Walz Travels advises on US visa strategy alongside your flight booking.',
    ],
  },
  'los-yyz': {
    from: 'Lagos', to: 'Toronto', fromIata: 'LOS', toIata: 'YYZ',
    fromCountry: 'Nigeria', toCountry: 'Canada',
    estimatedFrom: '£640', currency: 'GBP',
    airlines: ['Air Canada', 'British Airways', 'Ethiopian Airlines', 'Qatar Airways'],
    flightTime: '14–18h connecting',
    layover: 'Via London, Doha, Addis Ababa or Amsterdam',
    description: 'Flights Lagos to Toronto from £640. Air Canada, British Airways, Ethiopian Airlines. Connect via London or Doha. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Toronto Pearson (YYZ) flights all connect through at least one hub. The most popular routing for Nigerians is Lagos → London Heathrow → Toronto (British Airways + Air Canada) or Lagos → Doha → Toronto (Qatar Airways). Ethiopian Airlines also offers a connection via Addis Ababa.',
      'Nigerian passport holders require a Canadian Temporary Resident Visa (TRV) to enter Canada. Processing times from Nigeria currently average 8–12 weeks. Walz Travels handles Canada visa applications end-to-end.',
      'Total journey times typically range from 14 to 18 hours. The London routing is popular among Nigerians in the diaspora who want to combine both visits.',
    ],
  },
  'acc-yyz': {
    from: 'Accra', to: 'Toronto', fromIata: 'ACC', toIata: 'YYZ',
    fromCountry: 'Ghana', toCountry: 'Canada',
    estimatedFrom: '£610', currency: 'GBP',
    airlines: ['Air Canada', 'Brussels Airlines', 'Ethiopian Airlines', 'KLM'],
    flightTime: '15–18h connecting',
    layover: 'Via Brussels, Amsterdam or Addis Ababa',
    description: 'Flights Accra to Toronto from £610. Air Canada, Brussels Airlines, KLM, Ethiopian Airlines. Book with Walz Travels — IATA certified.',
    bodyParagraphs: [
      'All Accra to Toronto flights connect through European or African hubs. Brussels Airlines connects to Air Canada through Brussels (BRU). KLM connects through Amsterdam (AMS). Ethiopian Airlines offers Addis Ababa connections.',
      'Ghanaian passport holders require a Canadian visitor visa. Walz Travels processes Canada visa applications for Ghanaian clients in Accra.',
    ],
  },
  'los-nbo': {
    from: 'Lagos', to: 'Nairobi', fromIata: 'LOS', toIata: 'NBO',
    fromCountry: 'Nigeria', toCountry: 'Kenya',
    estimatedFrom: '£320', currency: 'GBP',
    airlines: ['Kenya Airways', 'Ethiopian Airlines', 'RwandAir'],
    flightTime: '5–9h connecting',
    layover: 'Via Addis Ababa or Kigali. Kenya Airways operates direct on some schedules',
    description: 'Flights Lagos to Nairobi from £320. Kenya Airways, Ethiopian Airlines, RwandAir. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Nairobi Jomo Kenyatta International (NBO) is a popular intra-African route. Kenya Airways operates a direct Lagos–Nairobi service on some schedules. Ethiopian Airlines connects via Addis Ababa and RwandAir connects via Kigali.',
      'Nigerian passport holders can obtain a Kenya e-visa online before departure. Walz Travels can advise on the Kenya e-visa process.',
    ],
  },
  'los-jnb': {
    from: 'Lagos', to: 'Johannesburg', fromIata: 'LOS', toIata: 'JNB',
    fromCountry: 'Nigeria', toCountry: 'South Africa',
    estimatedFrom: '£290', currency: 'GBP',
    airlines: ['South African Airways', 'Ethiopian Airlines', 'Kenya Airways', 'Air Peace'],
    flightTime: '6–10h connecting or direct',
    layover: 'Some direct services available',
    description: 'Flights Lagos to Johannesburg from £290. Direct options available. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Johannesburg O.R. Tambo International (JNB) is one of the major intra-African routes. Multiple airlines operate this route including South African Airways, Ethiopian Airlines (via Addis Ababa), and Air Peace.',
      'Nigerian passport holders need a South Africa visa. Walz Travels advises on South Africa visa applications.',
    ],
  },
  'los-bom': {
    from: 'Lagos', to: 'Mumbai', fromIata: 'LOS', toIata: 'BOM',
    fromCountry: 'Nigeria', toCountry: 'India',
    estimatedFrom: '£480', currency: 'GBP',
    airlines: ['Emirates', 'Ethiopian Airlines', 'Air India', 'Qatar Airways'],
    flightTime: '10–14h connecting',
    layover: 'Via Dubai or Doha',
    description: 'Flights Lagos to Mumbai from £480. Emirates via Dubai, Qatar via Doha. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Mumbai Chhatrapati Shivaji Maharaj International (BOM) flights connect through Middle Eastern hubs. Emirates offers a Lagos → Dubai → Mumbai connection. Qatar Airways offers Lagos → Doha → Mumbai.',
      'Nigerian passport holders require an Indian e-visa. Walz Travels can advise on the India e-visa application process.',
    ],
  },
  'acc-dxb': {
    from: 'Accra', to: 'Dubai', fromIata: 'ACC', toIata: 'DXB',
    fromCountry: 'Ghana', toCountry: 'United Arab Emirates',
    estimatedFrom: '£310', currency: 'GBP',
    airlines: ['Emirates', 'Ethiopian Airlines', 'Turkish Airlines'],
    flightTime: '7–11h connecting',
    layover: 'Via Addis Ababa or Istanbul',
    description: 'Flights Accra to Dubai from £310. Emirates, Ethiopian Airlines, Turkish Airlines. Book with Walz Travels.',
    bodyParagraphs: [
      'Accra Kotoka International (ACC) to Dubai International (DXB) flights connect through Addis Ababa (Ethiopian Airlines) or Istanbul (Turkish Airlines). Emirates offers connections with a short layover.',
      'Ghanaian passport holders require a UAE tourist visa. Walz Travels processes UAE visas for Ghanaian clients.',
    ],
  },
  'acc-nbo': {
    from: 'Accra', to: 'Nairobi', fromIata: 'ACC', toIata: 'NBO',
    fromCountry: 'Ghana', toCountry: 'Kenya',
    estimatedFrom: '£280', currency: 'GBP',
    airlines: ['Kenya Airways', 'Ethiopian Airlines', 'RwandAir'],
    flightTime: '4–8h connecting',
    layover: 'Via Addis Ababa or Kigali',
    description: 'Flights Accra to Nairobi from £280. Kenya Airways, Ethiopian, RwandAir. Book with Walz Travels.',
    bodyParagraphs: [
      'Accra to Nairobi is an important intra-African business route. Connections go via Addis Ababa (Ethiopian Airlines) or Kigali (RwandAir). Some Kenya Airways schedules include direct Accra–Nairobi service.',
    ],
  },
  'los-cdg': {
    from: 'Lagos', to: 'Paris', fromIata: 'LOS', toIata: 'CDG',
    fromCountry: 'Nigeria', toCountry: 'France',
    estimatedFrom: '£390', currency: 'GBP',
    airlines: ['Air France', 'Ethiopian Airlines', 'Turkish Airlines', 'Royal Air Maroc'],
    flightTime: '6–10h connecting',
    layover: 'Air France direct available',
    description: 'Flights Lagos to Paris CDG from £390. Air France direct, plus Ethiopian, Turkish, Royal Air Maroc. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Paris Charles de Gaulle (CDG) is a well-served route. Air France operates direct flights from Lagos. Connecting options via Casablanca (Royal Air Maroc), Addis Ababa (Ethiopian Airlines), and Istanbul (Turkish Airlines) are also available.',
      'Nigerian passport holders require a French Schengen visa to visit Paris. Walz Travels processes Schengen visa applications through the French embassy with a strong track record.',
    ],
  },
  'los-fra': {
    from: 'Lagos', to: 'Frankfurt', fromIata: 'LOS', toIata: 'FRA',
    fromCountry: 'Nigeria', toCountry: 'Germany',
    estimatedFrom: '£420', currency: 'GBP',
    airlines: ['Lufthansa', 'Ethiopian Airlines', 'Turkish Airlines', 'Air France'],
    flightTime: '7–11h connecting',
    layover: 'Via Addis Ababa or Istanbul',
    description: 'Flights Lagos to Frankfurt from £420. Lufthansa, Ethiopian Airlines, Turkish Airlines. Book with Walz Travels.',
    bodyParagraphs: [
      "Lagos to Frankfurt Airport (FRA) flights connect through several hubs. Lufthansa offers connections, and Ethiopian Airlines and Turkish Airlines both serve this route. Frankfurt is Germany's main hub and a popular entry point for Nigerians visiting Germany or onward to other European destinations.",
      'Nigerian passport holders require a German Schengen visa. Walz Travels processes German Schengen applications.',
    ],
  },
  'acc-cdg': {
    from: 'Accra', to: 'Paris', fromIata: 'ACC', toIata: 'CDG',
    fromCountry: 'Ghana', toCountry: 'France',
    estimatedFrom: '£370', currency: 'GBP',
    airlines: ['Air France', 'Brussels Airlines', 'Royal Air Maroc', 'Ethiopian Airlines'],
    flightTime: '6–10h connecting',
    layover: 'Air France direct available. Also via Brussels or Casablanca',
    description: 'Flights Accra to Paris from £370. Air France direct, Brussels Airlines, Royal Air Maroc. Book with Walz Travels.',
    bodyParagraphs: [
      'Accra to Paris CDG is well connected given the strong French West Africa links. Air France operates direct flights from Accra. Royal Air Maroc connects via Casablanca and Brussels Airlines via Brussels.',
      'Ghanaian passport holders require a French Schengen visa. Walz Travels processes Schengen applications for Ghanaian clients.',
    ],
  },
  'los-ams': {
    from: 'Lagos', to: 'Amsterdam', fromIata: 'LOS', toIata: 'AMS',
    fromCountry: 'Nigeria', toCountry: 'Netherlands',
    estimatedFrom: '£410', currency: 'GBP',
    airlines: ['KLM', 'Ethiopian Airlines', 'Turkish Airlines'],
    flightTime: '6–10h connecting. KLM direct available',
    layover: 'KLM direct Lagos–Amsterdam. Also via Addis Ababa or Istanbul',
    description: 'Flights Lagos to Amsterdam from £410. KLM direct service. Ethiopian Airlines, Turkish Airlines also available. Book with Walz Travels.',
    bodyParagraphs: [
      'KLM operates direct flights from Lagos Murtala Muhammed (LOS) to Amsterdam Schiphol (AMS). This makes Amsterdam one of the few European cities you can reach from Lagos without a transfer. Flight time is approximately 6 hours.',
      'Dutch Schengen visas are required for Nigerian passport holders. Walz Travels processes Netherlands Schengen applications.',
    ],
  },
  'acc-ams': {
    from: 'Accra', to: 'Amsterdam', fromIata: 'ACC', toIata: 'AMS',
    fromCountry: 'Ghana', toCountry: 'Netherlands',
    estimatedFrom: '£380', currency: 'GBP',
    airlines: ['KLM', 'Ethiopian Airlines', 'Brussels Airlines'],
    flightTime: '6–9h connecting. KLM direct available',
    layover: 'KLM direct. Also via Addis Ababa or Brussels',
    description: 'Flights Accra to Amsterdam from £380. KLM direct service available. Book with Walz Travels.',
    bodyParagraphs: [
      'KLM operates a direct Accra–Amsterdam service, making this one of the most convenient routes from West Africa to Europe. Ghanaian passport holders require a Netherlands Schengen visa.',
      'Walz Travels processes Schengen visa applications for Ghanaian clients and can package visa with flight booking.',
    ],
  },
  'los-iad': {
    from: 'Lagos', to: 'Washington DC', fromIata: 'LOS', toIata: 'IAD',
    fromCountry: 'Nigeria', toCountry: 'United States',
    estimatedFrom: '£600', currency: 'GBP',
    airlines: ['United', 'Ethiopian Airlines', 'British Airways'],
    flightTime: '14–18h connecting',
    layover: 'Via London, Addis Ababa or Amsterdam',
    description: 'Flights Lagos to Washington Dulles from £600. United, Ethiopian Airlines, British Airways. Book with Walz Travels.',
    bodyParagraphs: [
      'Lagos to Washington Dulles (IAD) flights connect through major hubs. Ethiopian Airlines connects via Addis Ababa and serves Dulles. British Airways routes through London Heathrow. United Airlines routes through various hubs.',
      'Nigerian passport holders require a US B1/B2 visitor visa for Washington DC. Walz Travels advises on US visa strategy.',
    ],
  },
  'los-atl': {
    from: 'Lagos', to: 'Atlanta', fromIata: 'LOS', toIata: 'ATL',
    fromCountry: 'Nigeria', toCountry: 'United States',
    estimatedFrom: '£590', currency: 'GBP',
    airlines: ['Delta', 'Ethiopian Airlines', 'British Airways'],
    flightTime: '14–17h connecting',
    layover: 'Via London, Addis Ababa or Amsterdam',
    description: 'Flights Lagos to Atlanta from £590. Delta, Ethiopian Airlines, British Airways. Book with Walz Travels.',
    bodyParagraphs: [
      "Lagos to Atlanta Hartsfield-Jackson (ATL) — one of the world's busiest airports — connects through several hubs. Delta has a strong network through ATL. Ethiopian Airlines connects via Addis Ababa.",
      'Nigerian passport holders require a US B1/B2 visa. Walz Travels advises on US visa applications.',
    ],
  },
}

interface Props {
  params: { route: string }
}

export async function generateStaticParams() {
  return Object.keys(ROUTES).map(route => ({ route }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = ROUTES[params.route]
  if (!data) return { title: 'Flights — Walz Travels' }
  const title = data.titleOverride ??
    `Flights ${data.from} to ${data.to} (${data.fromIata}–${data.toIata}) from ${data.estimatedFrom} | Walz Travels`
  return {
    title,
    description: data.description,
    alternates: { canonical: `https://www.walztravels.com/flights/${params.route}` },
    openGraph: {
      title: `${data.from} to ${data.to} Flights — From ${data.estimatedFrom}`,
      description: data.description,
      url: `https://www.walztravels.com/flights/${params.route}`,
    },
  }
}

export default function FlightRoutePage({ params }: Props) {
  const data = ROUTES[params.route]
  if (!data) notFound()

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.walztravels.com' },
      { '@type': 'ListItem', position: 2, name: 'Flights', item: 'https://www.walztravels.com/flights' },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${data.from} to ${data.to}`,
        item: `https://www.walztravels.com/flights/${params.route}`,
      },
    ],
  }

  const offerSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Flights from ${data.from} to ${data.to}`,
    description: data.description,
    offers: {
      '@type': 'Offer',
      priceCurrency: data.currency,
      price: data.estimatedFrom.replace(/[^0-9.]/g, ''),
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'TravelAgency',
        name: 'Walz Travels',
        url: 'https://www.walztravels.com',
      },
    },
  }

  const faqSchema = data.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null

  return (
    <>
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Script
        id="offer-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(offerSchema) }}
      />
      {faqSchema && (
        <Script
          id="faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <main className="min-h-screen bg-[#FAF7F2]">
        {/* Hero */}
        <div className="bg-[#0B1F3A] text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-white/50 mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link href="/flights" className="hover:text-white transition-colors">Flights</Link>
              <span>/</span>
              <span className="text-white/80">{data.from} to {data.to}</span>
            </nav>

            {/* Eyebrow */}
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              From {data.estimatedFrom} &middot; {data.fromCountry} → {data.toCountry}
            </p>

            {/* H1 */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Flights from {data.from} to {data.to} ({data.fromIata}–{data.toIata})
            </h1>

            <p className="text-white/70 text-base max-w-2xl">
              {data.description}
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

          {/* From / To cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-4xl font-bold text-[#0B1F3A] mb-1">{data.fromIata}</p>
              <p className="text-sm font-semibold text-[#0B1F3A]">{data.from}</p>
              <p className="text-xs text-gray-400 mt-0.5">{data.fromCountry}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <p className="text-4xl font-bold text-[#0B1F3A] mb-1">{data.toIata}</p>
              <p className="text-sm font-semibold text-[#0B1F3A]">{data.to}</p>
              <p className="text-xs text-gray-400 mt-0.5">{data.toCountry}</p>
            </div>
          </div>

          {/* Flight details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">Flight Details</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Estimated fare</p>
                  <p className="text-sm text-gray-600">From {data.estimatedFrom} one-way economy</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Flight time</p>
                  <p className="text-sm text-gray-600">{data.flightTime}</p>
                </div>
              </div>
              {data.layover && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Connections</p>
                    <p className="text-sm text-gray-600">{data.layover}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Airlines</p>
                  <p className="text-sm text-gray-600">{data.airlines.join(', ')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Body content */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">
              {data.from} to {data.to}: Route Guide
            </h2>
            <div className="space-y-4">
              {data.bodyParagraphs.map((para, i) => (
                <p key={i} className="text-sm text-gray-700 leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Live Fares · 400+ Airlines · IATA Certified
            </p>
            <h2 className="text-2xl font-bold text-white mb-2">
              Search {data.from}–{data.to} Flights
            </h2>
            <p className="text-white/60 text-sm mb-6">
              Walz Travels searches Sabre GDS for real-time inventory across all airlines on this route.
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

          {/* FAQ section — rendered only for routes that have faqs data */}
          {data.faqs && data.faqs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-[#0B1F3A] mb-5">
                Frequently Asked Questions — {data.from} to {data.to} Flights
              </h2>
              <div className="space-y-4">
                {data.faqs.map((faq, i) => (
                  <div key={i} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                    <p className="text-sm font-semibold text-[#0B1F3A] mb-1">{faq.q}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related routes */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4">Popular Routes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(ROUTES)
                .filter(([slug]) => slug !== params.route)
                .slice(0, 6)
                .map(([slug, r]) => (
                  <Link
                    key={slug}
                    href={`/flights/${slug}`}
                    className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-xs text-[#0B1F3A] font-medium"
                  >
                    <span className="font-mono text-amber-600">{r.fromIata}–{r.toIata}</span>
                    <span className="text-gray-500 truncate">{r.from} → {r.to}</span>
                  </Link>
                ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 text-center leading-relaxed pb-6">
            Fares shown are estimates based on historical pricing and are subject to change. Live pricing is
            available on the search page. Walz Travels is IATA registered. All fares are subject to
            availability at time of booking.
          </p>
        </div>
      </main>
    </>
  )
}
