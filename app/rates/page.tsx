import Link from 'next/link'

export const metadata = {
  title: 'Service Rates — Walz Travels',
  description: 'Transparent pricing for visa applications, travel planning, and all Walz Travels services.',
}

const VISA_RATES = [
  { destination: 'United Kingdom',   type: 'Standard Visitor Visa',   fee: '£150',  gov: '£115',  total: '£265',  time: '3–8 weeks' },
  { destination: 'United Kingdom',   type: 'Priority Visa',           fee: '£200',  gov: '£500',  total: '£700',  time: '5–10 days' },
  { destination: 'Canada',           type: 'Visitor Visa / eTA',      fee: '£120',  gov: 'CAD 7', total: '£120+', time: '2–6 weeks' },
  { destination: 'USA',              type: 'B-1/B-2 Visitor Visa',    fee: '£180',  gov: '$185',  total: '£180+', time: '4–12 weeks' },
  { destination: 'Schengen',         type: 'Short Stay Visa',         fee: '£130',  gov: '€90',   total: '£130+', time: '3–6 weeks' },
  { destination: 'UAE / Dubai',      type: 'Tourist Visa',            fee: '£100',  gov: 'AED 250', total: '£100+', time: '3–5 days' },
  { destination: 'Australia',        type: 'eVisitor / Tourist Visa', fee: '£110',  gov: 'AUD 20', total: '£110+', time: '1–4 weeks' },
]

const SERVICE_RATES = [
  { service: 'Express Consultation', desc: '30-min call with a visa specialist', price: 'Free', note: 'No commitment required' },
  { service: 'Document Review',      desc: 'Full review of your application documents', price: 'Included', note: 'Included in all packages' },
  { service: 'Flight Booking',       desc: 'Best-fare flight search & booking', price: 'From £25', note: 'Per booking' },
  { service: 'Hotel Booking',        desc: 'Curated hotel selection & booking', price: 'From £15', note: 'Per booking' },
  { service: 'Travel Insurance',     desc: 'Walz Travel Shield — powered by Battleface', price: 'From £12', note: 'Per person' },
  { service: 'eSIM / Jade Connect',  desc: 'Global data SIM for 190+ countries', price: 'From £4', note: 'Per 1GB plan' },
]

export default function RatesPage() {
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
              <div>Gov. Fee</div>
              <div>Est. Time</div>
            </div>
            {VISA_RATES.map((r, i) => (
              <div key={i} className={`grid grid-cols-5 gap-3 px-5 py-4 items-center ${i < VISA_RATES.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2">
                  <p className="font-semibold text-[#0B1F3A] text-sm">{r.destination}</p>
                  <p className="text-xs text-gray-400">{r.type}</p>
                </div>
                <p className="font-bold text-[#C9A84C] text-sm">{r.fee}</p>
                <p className="text-xs text-gray-500">{r.gov}</p>
                <p className="text-xs text-gray-500">{r.time}</p>
              </div>
            ))}
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
            <a href="https://wa.me/447398753797" target="_blank" rel="noreferrer"
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
