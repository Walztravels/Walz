import Link from 'next/link'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Service Rates',
  description: 'Transparent pricing for visa applications, travel planning, and all Walz Travels services.',
  alternates: { canonical: 'https://www.walztravels.com/rates' },
}

const FALLBACK_RATES = [
  { country: 'United Kingdom', flag: '🇬🇧', visaType: 'Standard Visitor Visa',   fee: 150, currency: 'GBP', processingTime: '3–8 weeks' },
  { country: 'United Kingdom', flag: '🇬🇧', visaType: 'Priority Visa',           fee: 200, currency: 'GBP', processingTime: '5–10 days' },
  { country: 'Canada',         flag: '🇨🇦', visaType: 'Visitor Visa / eTA',      fee: 120, currency: 'GBP', processingTime: '2–6 weeks' },
  { country: 'USA',            flag: '🇺🇸', visaType: 'B-1/B-2 Visitor Visa',    fee: 180, currency: 'GBP', processingTime: '4–12 weeks' },
  { country: 'Schengen',       flag: '🇪🇺', visaType: 'Short Stay Visa',         fee: 130, currency: 'GBP', processingTime: '3–6 weeks' },
  { country: 'UAE / Dubai',    flag: '🇦🇪', visaType: 'Tourist Visa',            fee: 100, currency: 'GBP', processingTime: '3–5 days' },
  { country: 'Australia',      flag: '🇦🇺', visaType: 'eVisitor / Tourist Visa', fee: 110, currency: 'GBP', processingTime: '1–4 weeks' },
]

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AED: 'AED ', AUD: 'A$', NGN: '₦',
}

const SERVICE_RATES = [
  { service: 'Express Consultation', desc: '30-min call with a visa specialist',            price: 'Free',    note: 'No commitment required'      },
  { service: 'Document Review',      desc: 'Full review of your application documents',     price: 'Included', note: 'Included in all packages'   },
  { service: 'Flight Booking',       desc: 'Best-fare flight search & booking',             price: 'From £25', note: 'Per booking'                },
  { service: 'Hotel Booking',        desc: 'Curated hotel selection & booking',             price: 'From £15', note: 'Per booking'                },
  { service: 'Travel Insurance',     desc: 'Walz Travel Shield — powered by Battleface',   price: 'From £12', note: 'Per person'                 },
  { service: 'eSIM / Jade Connect',  desc: 'Global data SIM for 190+ countries',           price: 'From £4',  note: 'Per 1GB plan'               },
]

function getCountrySlug(country: string): string {
  const map: Record<string, string> = {
    'United Kingdom': 'united-kingdom',
    'Canada':         'canada',
    'USA':            'usa',
    'Schengen':       'schengen',
    'UAE / Dubai':    'uae',
    'UAE':            'uae',
    'Australia':      'australia',
    'Nigeria':        'nigeria',
    'Ghana':          'ghana',
  }
  return map[country] ?? country.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

async function getRates() {
  try {
    return await prisma.visaService.findMany({
      where:   { active: true },
      orderBy: { createdAt: 'asc' },
    })
  } catch {
    return []
  }
}

export default async function RatesPage() {
  const dbRates = await getRates()
  const rates   = dbRates.length > 0 ? dbRates : FALLBACK_RATES

  return (
    <div className="min-h-screen bg-[#F5F0E8]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 px-5 text-center">
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[3px] mb-3">Transparent Pricing</p>
        <h1 className="text-white font-bold text-3xl lg:text-4xl mb-4">Service Rates</h1>
        <p className="text-white/50 text-base max-w-lg mx-auto">
          No hidden fees. Every cost is explained upfront before you commit to anything.
        </p>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-12 space-y-12">

        {/* Visa Application Rates */}
        <section>
          <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Visa Application Service Fees</h2>
          <p className="text-gray-500 text-sm mb-6">
            Our fee covers document preparation, submission support, and ongoing tracking.
            Government / embassy fees are separate and paid directly.
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="grid grid-cols-5 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <div className="col-span-2">Destination / Type</div>
              <div>Walz Fee</div>
              <div className="hidden sm:block">Est. Time</div>
              <div></div>
            </div>
            {rates.map((r, i) => {
              const flag = 'flag' in r ? (r.flag ?? '') : ''
              const sym  = SYM[r.currency] ?? r.currency
              return (
                <div key={i} className={`grid grid-cols-5 gap-3 px-5 py-4 items-center ${i < rates.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="col-span-2">
                    <p className="font-semibold text-[#0B1F3A] text-sm">
                      {flag && <span className="mr-1.5">{flag}</span>}
                      {r.country}
                    </p>
                    <p className="text-xs text-gray-400">{r.visaType}</p>
                  </div>
                  <p className="font-bold text-[#C9A84C] text-sm">{sym}{r.fee.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 hidden sm:block">{r.processingTime}</p>
                  <div className="flex justify-end">
                    <Link
                      href={`/visa/apply/${getCountrySlug(r.country)}`}
                      className="text-xs font-bold text-[#C9A84C] hover:text-[#0B1F3A] bg-[#C9A84C]/10 hover:bg-[#C9A84C] px-3 py-1.5 rounded-full transition-all whitespace-nowrap">
                      Apply →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            * Government/embassy fees are approximate and subject to change. Exact amounts confirmed at time of application.
          </p>
        </section>

        {/* Other Services */}
        <section>
          <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Other Services</h2>
          <p className="text-gray-500 text-sm mb-6">Add-on services available to all clients.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {SERVICE_RATES.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-bold text-[#0B1F3A]">{s.service}</p>
                  <span className="text-[#C9A84C] font-bold text-sm whitespace-nowrap">{s.price}</span>
                </div>
                <p className="text-sm text-gray-500">{s.desc}</p>
                <p className="text-xs text-gray-400 mt-1">{s.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[2px] mb-3">Get Started</p>
          <h3 className="text-white font-bold text-xl mb-3">Not sure which service you need?</h3>
          <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
            Book a free 30-minute consultation and we will walk you through the exact costs for your situation — no obligation.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://wa.me/12317902336" target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-full hover:bg-white transition-colors text-sm">
              WhatsApp Us Free
            </a>
            <Link href="/visa"
              className="inline-flex items-center justify-center gap-2 border border-white/20 text-white px-6 py-3 rounded-full hover:border-white hover:text-white transition-colors text-sm">
              Check Visa Requirements
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
