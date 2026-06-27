import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ItinDay {
  day: number; title: string; description?: string;
  activities?: string[]; meals?: string; accommodation?: string; notes?: string;
}
interface ItinFlight {
  from?: string; to?: string; airline?: string; flightNumber?: string;
  date?: string; time?: string; class?: string; pnr?: string; cost?: number;
}
interface ItinHotel {
  name?: string; location?: string; checkIn?: string; checkOut?: string;
  roomType?: string; nights?: number; cost?: number;
}
interface PriceRow { item: string; description?: string; cost: number }

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

function fmtDate(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function ClientItineraryPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) notFound()

  // Track view (fire and forget)
  prisma.itinerary.update({
    where: { id: itin.id },
    data: { viewCount: { increment: 1 }, viewedAt: itin.viewedAt ?? new Date(), updatedAt: new Date() },
  }).catch(() => {})

  const days = safeParse<ItinDay[]>(itin.days, [])
  const flights = safeParse<ItinFlight[]>(itin.flights, [])
  const hotels = safeParse<ItinHotel[]>(itin.hotels, [])
  const inclusions = safeParse<string[]>(itin.inclusions, [])
  const exclusions = safeParse<string[]>(itin.exclusions, [])
  const priceBreakdown = safeParse<PriceRow[]>(itin.priceBreakdown, [])
  const sym = itin.currency === 'GBP' ? '£' : itin.currency === 'USD' ? '$' : itin.currency === 'EUR' ? '€' : itin.currency === 'AED' ? 'AED ' : '₦'

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0B1F3A] py-4 px-6 sticky top-0 z-10 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img src="/walz-logo.png" alt="Walz Travels" className="h-8" />
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-xs font-mono">{itin.referenceNumber}</span>
            {itin.status === 'approved' && (
              <span className="bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full">Approved</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero */}
        {itin.coverImage ? (
          <div className="relative h-72 rounded-3xl overflow-hidden mb-8 shadow-2xl">
            <img src={itin.coverImage} alt={itin.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8">
              <h1 className="text-white text-4xl font-bold mb-2">{itin.title}</h1>
              <p className="text-white/70 text-sm">{itin.numberOfTravellers} traveller{itin.numberOfTravellers > 1 ? 's' : ''} · {itin.destination}{itin.duration ? ` · ${itin.duration} days` : ''}</p>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#0B1F3A] to-[#1a3a6b] rounded-3xl p-10 mb-8 shadow-2xl">
            <h1 className="text-white text-4xl font-bold mb-3">{itin.title}</h1>
            <p className="text-white/60 text-sm">📍 {itin.destination} · {itin.numberOfTravellers} traveller{itin.numberOfTravellers > 1 ? 's' : ''}{itin.duration ? ` · ${itin.duration} days` : ''}</p>
            {itin.startDate && <p className="text-amber-400 text-sm mt-2 font-medium">📅 {fmtDate(itin.startDate)}{itin.endDate ? ` — ${fmtDate(itin.endDate)}` : ''}</p>}
          </div>
        )}

        {/* Trip details strip */}
        {(itin.startDate || itin.tripType || itin.numberOfTravellers) && (
          <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm flex flex-wrap gap-6">
            {itin.startDate && (
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Dates</p>
                <p className="text-gray-800 font-medium text-sm">{fmtDate(itin.startDate)}{itin.endDate ? ` – ${fmtDate(itin.endDate)}` : ''}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Travellers</p>
              <p className="text-gray-800 font-medium text-sm">{itin.numberOfTravellers}{itin.tripType ? ` · ${itin.tripType}` : ''}</p>
            </div>
            {itin.destination && (
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Destination</p>
                <p className="text-gray-800 font-medium text-sm">{itin.destination}</p>
              </div>
            )}
          </div>
        )}

        {/* Overview */}
        {itin.overview && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-3">Trip Overview</h2>
            <p className="text-gray-600 leading-relaxed">{itin.overview}</p>
          </div>
        )}

        {/* Day by Day */}
        {days.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-gray-900 text-xl mb-4">Day-by-Day Plan</h2>
            <div className="space-y-4">
              {days.map((d) => (
                <div key={d.day} className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-amber-400">
                  <div className="flex items-start gap-4">
                    <div className="bg-amber-50 rounded-xl px-3 py-2 text-center flex-shrink-0">
                      <p className="text-amber-600 text-xs font-bold uppercase">Day</p>
                      <p className="text-amber-700 text-xl font-bold">{d.day}</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 text-base mb-2">{d.title}</h3>
                      {d.description && <p className="text-gray-600 text-sm leading-relaxed mb-3">{d.description}</p>}
                      {(d.activities || []).length > 0 && (
                        <ul className="space-y-1.5 mb-3">
                          {(d.activities || []).map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                              <span className="text-amber-500 mt-0.5">•</span>{a}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        {d.accommodation && <span>🏨 {d.accommodation}</span>}
                        {d.meals && <span>🍽 {d.meals}</span>}
                        {d.notes && <span>📌 {d.notes}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flights */}
        {flights.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">✈️ Flights</h2>
            <div className="space-y-3">
              {flights.map((f, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900">{f.from || ''} → {f.to || ''}</p>
                    <p className="text-gray-500 text-sm">{f.airline || ''} {f.flightNumber || ''} · {f.class || ''}</p>
                    {f.pnr && <p className="text-amber-600 text-xs font-mono mt-1">PNR: {f.pnr}</p>}
                  </div>
                  {f.date && <p className="text-gray-600 text-sm font-medium">{fmtDate(f.date)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hotels */}
        {hotels.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">🏨 Accommodation</h2>
            <div className="space-y-3">
              {hotels.map((h, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-bold text-gray-900">{h.name || ''}</p>
                  {h.location && <p className="text-gray-500 text-sm">📍 {h.location}</p>}
                  {h.checkIn && <p className="text-gray-600 text-sm">{fmtDate(h.checkIn)} — {fmtDate(h.checkOut)} · {h.nights || ''} nights · {h.roomType || ''}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inclusions / Exclusions */}
        {(inclusions.length > 0 || exclusions.length > 0) && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {inclusions.length > 0 && (
                <div>
                  <h3 className="font-bold text-green-700 mb-3">✅ Included</h3>
                  <ul className="space-y-2">
                    {inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-500">✓</span>{inc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {exclusions.length > 0 && (
                <div>
                  <h3 className="font-bold text-red-600 mb-3">❌ Not Included</h3>
                  <ul className="space-y-2">
                    {exclusions.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-red-400">✗</span>{exc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing */}
        {(priceBreakdown.length > 0 || itin.totalPrice) && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">💰 Pricing</h2>
            {priceBreakdown.length > 0 && (
              <table className="w-full text-sm mb-4">
                <tbody>
                  {priceBreakdown.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3 font-medium text-gray-800">{r.item}</td>
                      <td className="py-3 text-gray-500">{r.description || ''}</td>
                      <td className="py-3 text-right font-semibold text-gray-800">{sym}{Number(r.cost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {itin.totalPrice && (
              <div className="bg-[#0B1F3A] rounded-xl p-4 flex items-center justify-between">
                <span className="text-white font-bold">Total</span>
                <span className="text-amber-400 font-bold text-xl">{sym}{Number(itin.totalPrice).toLocaleString()}</span>
              </div>
            )}
            {itin.deposit && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-3">
                <p className="text-amber-800 font-bold text-sm">
                  Deposit: {sym}{Number(itin.deposit).toLocaleString()}
                  {itin.depositDue ? ` — due by ${fmtDate(itin.depositDue)}` : ''}
                </p>
                {itin.balanceDue && <p className="text-amber-700 text-sm mt-1">Balance due by {fmtDate(itin.balanceDue)}</p>}
              </div>
            )}
          </div>
        )}

        {/* Terms */}
        {itin.terms && (
          <div className="bg-gray-100 rounded-2xl p-6 mb-6">
            <h3 className="font-bold text-gray-700 text-sm mb-2">Terms &amp; Conditions</h3>
            <p className="text-gray-500 text-xs leading-relaxed whitespace-pre-line">{itin.terms}</p>
          </div>
        )}

        {/* Contact CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
          <h3 className="text-white font-bold text-lg mb-2">Questions about your itinerary?</h3>
          <p className="text-white/60 text-sm mb-6">We&apos;re here to make your trip perfect.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://wa.me/447398753797" className="bg-green-500 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-green-400 transition">💬 WhatsApp Us</a>
            <a href="mailto:contact@walztravels.com" className="bg-amber-500 text-black font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-400 transition">✉️ Email Us</a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#0B1F3A] py-8 px-6 mt-12">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-white/30 text-sm">Created by Walz Travels · {itin.referenceNumber}</p>
          <p className="text-white/20 text-xs mt-1">Questions? contact@walztravels.com · walztravels.com</p>
        </div>
      </footer>
    </main>
  )
}
