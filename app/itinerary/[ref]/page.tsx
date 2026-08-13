import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { BUSINESS } from '@/lib/config/business'
import { ViewTracker, PrintButton, MobileStickyBar } from './_ClientShell'

export const dynamic = 'force-dynamic'

// ── Data interfaces ────────────────────────────────────────────────────────────
interface ItinDay {
  day: number; title: string; description?: string;
  activities?: string[]; meals?: string; accommodation?: string;
  clientNotes?: string; notes?: string; // notes is legacy, clientNotes is canonical
}
interface ItinFlight {
  from?: string; to?: string; airline?: string; flightNumber?: string;
  date?: string; time?: string; class?: string; pnr?: string; cost?: number;
}
interface ItinHotel {
  name?: string; location?: string; checkIn?: string; checkOut?: string;
  roomType?: string; nights?: number; cost?: number;
  images?: string[]
}
interface PriceRow { item: string; description?: string; cost: number }

// ── New interfaces for enhanced sections ─────────────────────────────────────
interface PackageOption {
  id: string
  name: string
  price: number
  currency: string
  description?: string
  features: string[]
  isSelected?: boolean
}
interface PaymentMilestone {
  label: string
  amount: number
  currency: string
  dueDate?: string
  paid?: boolean
}
interface ItinOptions {
  packageOptions?: PackageOption[]
  paymentSchedule?: PaymentMilestone[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

function fmtDate(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function currencySym(currency: string) {
  const map: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', NGN: '₦' }
  return map[currency] ?? currency + ' '
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function ClientItineraryPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) notFound()
  // Draft itineraries are not visible to clients
  if (!['proposal', 'approved', 'live'].includes(itin.status)) notFound()

  // Track view (server-side: increment counter + record first view time)
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
  const options = safeParse<ItinOptions>(itin.options, {})

  const packageOptions: PackageOption[] = options.packageOptions ?? []
  const paymentSchedule: PaymentMilestone[] = options.paymentSchedule ?? []

  const sym = currencySym(itin.currency)
  const waLink = `https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}?text=${encodeURIComponent(`Hi Walz Travels, I have a question about my itinerary ${itin.referenceNumber}.`)}`

  return (
    <main className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
      {/* Client-side view tracking ping */}
      <ViewTracker refCode={itin.referenceNumber} />

      {/* Mobile sticky bottom bar */}
      <MobileStickyBar
        whatsappE164={BUSINESS.contacts.globalWhatsapp.e164}
        refCode={itin.referenceNumber}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-[#0B1F3A] py-4 px-6 sticky top-0 z-10 shadow-lg print:static print:shadow-none">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img src="/walz-logo.png" alt="Walz Travels" className="h-8" />
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xs font-mono">{itin.referenceNumber}</span>
            {itin.status === 'approved' && (
              <span className="bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full">Approved</span>
            )}
            {/* Desktop PDF button */}
            <div className="hidden sm:block">
              <PrintButton />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
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

        {/* ── Trip details strip ───────────────────────────────────────────── */}
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

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {itin.overview && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-3">Trip Overview</h2>
            <p className="text-gray-600 leading-relaxed">{itin.overview}</p>
          </div>
        )}

        {/* ── Package options ───────────────────────────────────────────────── */}
        {packageOptions.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-gray-900 text-xl mb-4">Choose Your Package</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packageOptions.map((pkg) => {
                const pkgSym = currencySym(pkg.currency)
                return (
                  <div
                    key={pkg.id}
                    className={`rounded-2xl p-5 border-2 shadow-sm transition-colors ${
                      pkg.isSelected
                        ? 'bg-amber-50 border-amber-400'
                        : 'bg-white border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-gray-900">{pkg.name}</p>
                        {pkg.isSelected && (
                          <span className="inline-block mt-1 bg-amber-400 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="text-amber-700 font-bold text-lg">
                        {pkgSym}{Number(pkg.price).toLocaleString()}
                      </p>
                    </div>

                    {pkg.description && (
                      <p className="text-gray-500 text-sm mb-3">{pkg.description}</p>
                    )}

                    {pkg.features.length > 0 && (
                      <ul className="space-y-1.5">
                        {pkg.features.map((feat, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-amber-500 mt-0.5 flex-shrink-0">✓</span>
                            {feat}
                          </li>
                        ))}
                      </ul>
                    )}

                    {!pkg.isSelected && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 flex items-center justify-center gap-2 w-full bg-[#0B1F3A] hover:bg-[#1a3a6b] text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                      >
                        Select this package →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Day by Day ───────────────────────────────────────────────────── */}
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
                        {d.clientNotes && <span>📌 {d.clientNotes}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Flights ──────────────────────────────────────────────────────── */}
        {flights.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">✈️ Flights</h2>
            {/* Horizontally scrollable on mobile when many fields */}
            <div className="overflow-x-auto -mx-2 px-2">
              <div className="space-y-3 min-w-[320px]">
                {flights.map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{f.from || ''} → {f.to || ''}</p>
                      <p className="text-gray-500 text-sm">{f.airline || ''} {f.flightNumber || ''}{f.class ? ` · ${f.class}` : ''}</p>
                      {f.time && <p className="text-gray-500 text-xs mt-0.5">{f.time}</p>}
                      {f.pnr && <p className="text-amber-600 text-xs font-mono mt-1">PNR: {f.pnr}</p>}
                    </div>
                    {f.date && <p className="text-gray-600 text-sm font-medium flex-shrink-0">{fmtDate(f.date)}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Hotels ───────────────────────────────────────────────────────── */}
        {hotels.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">🏨 Accommodation</h2>
            <div className="space-y-3">
              {hotels.map((h, i) => (
                <div key={i} className="bg-gray-50 rounded-xl overflow-hidden">
                  {/* Hotel image gallery */}
                  {h.images && h.images.length > 0 && (
                    <div className="flex gap-1 h-36 overflow-hidden">
                      {h.images.slice(0, 4).map((src, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={idx}
                          src={src}
                          alt={`${h.name || 'Hotel'} photo ${idx + 1}`}
                          className={`object-cover flex-shrink-0 ${
                            idx === 0
                              ? 'w-1/2 h-full'
                              : h.images!.length === 2
                              ? 'w-1/2 h-full'
                              : 'w-1/6 h-full flex-1'
                          }`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-bold text-gray-900">{h.name || ''}</p>
                    {h.location && <p className="text-gray-500 text-sm">📍 {h.location}</p>}
                    {h.checkIn && (
                      <p className="text-gray-600 text-sm mt-1">
                        {fmtDate(h.checkIn)} — {fmtDate(h.checkOut)}
                        {h.nights ? ` · ${h.nights} nights` : ''}
                        {h.roomType ? ` · ${h.roomType}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Inclusions / Exclusions ───────────────────────────────────────── */}
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

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        {(priceBreakdown.length > 0 || itin.totalPrice) && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">💰 Pricing</h2>
            {priceBreakdown.length > 0 && (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm mb-4 min-w-[280px]">
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
              </div>
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

        {/* ── Payment schedule ─────────────────────────────────────────────── */}
        {paymentSchedule.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-gray-900 text-lg mb-4">📅 Payment Schedule</h2>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[380px]">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left py-2.5 text-gray-500 font-semibold text-xs uppercase tracking-wider">Milestone</th>
                    <th className="text-right py-2.5 text-gray-500 font-semibold text-xs uppercase tracking-wider">Amount</th>
                    <th className="text-right py-2.5 text-gray-500 font-semibold text-xs uppercase tracking-wider">Due Date</th>
                    <th className="text-right py-2.5 text-gray-500 font-semibold text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentSchedule.map((m, i) => {
                    const mSym = currencySym(m.currency)
                    return (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 font-medium text-gray-800">{m.label}</td>
                        <td className="py-3 text-right font-semibold text-gray-800">
                          {mSym}{Number(m.amount).toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-gray-500 text-sm">
                          {m.dueDate ? fmtDate(m.dueDate) : '—'}
                        </td>
                        <td className="py-3 text-right">
                          {m.paid ? (
                            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">
                              ✓ Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Terms ────────────────────────────────────────────────────────── */}
        {itin.terms && (
          <div className="bg-gray-100 rounded-2xl p-6 mb-6">
            <h3 className="font-bold text-gray-700 text-sm mb-2">Terms &amp; Conditions</h3>
            <p className="text-gray-500 text-xs leading-relaxed whitespace-pre-line">{itin.terms}</p>
          </div>
        )}

        {/* ── Contact CTA ───────────────────────────────────────────────────── */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center mb-6">
          <h3 className="text-white font-bold text-lg mb-2">Questions about your itinerary?</h3>
          <p className="text-white/60 text-sm mb-6">We&apos;re here to make your trip perfect.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="bg-green-500 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-green-400 transition">💬 WhatsApp Us</a>
            <a href={`mailto:${BUSINESS.contacts.email}`} className="bg-amber-500 text-black font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-400 transition">✉️ Email Us</a>
          </div>
        </div>

        {/* ── Need Help / Emergency contact ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 text-base mb-4">🆘 Need Help?</h2>
          <p className="text-gray-500 text-sm mb-5">
            Our team is available around the clock to assist with any travel concerns, emergencies, or last-minute changes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* WhatsApp (Global) */}
            <a
              href={`https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl p-4 transition-colors"
            >
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-green-800 font-bold text-sm">WhatsApp (Global)</p>
                <p className="text-green-600 text-xs">{BUSINESS.contacts.globalWhatsapp.display}</p>
              </div>
            </a>

            {/* WhatsApp (Nigeria) */}
            <a
              href={`https://wa.me/${BUSINESS.contacts.nigeriaWhatsapp.e164}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl p-4 transition-colors"
            >
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-green-800 font-bold text-sm">WhatsApp (Nigeria)</p>
                <p className="text-green-600 text-xs">{BUSINESS.contacts.nigeriaWhatsapp.display}</p>
              </div>
            </a>

            {/* Email */}
            <a
              href={`mailto:${BUSINESS.contacts.email}`}
              className="flex items-center gap-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl p-4 transition-colors"
            >
              <span className="text-2xl">✉️</span>
              <div>
                <p className="text-amber-800 font-bold text-sm">Email</p>
                <p className="text-amber-600 text-xs">{BUSINESS.contacts.email}</p>
              </div>
            </a>

            {/* Emergency phone */}
            <a
              href={`tel:${BUSINESS.contacts.emergencyPhone.e164}`}
              className="flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl p-4 transition-colors"
            >
              <span className="text-2xl">📞</span>
              <div>
                <p className="text-red-800 font-bold text-sm">Emergency Line</p>
                <p className="text-red-600 text-xs">{BUSINESS.contacts.emergencyPhone.display}</p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0B1F3A] py-8 px-6 mt-12 print:hidden">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-white/30 text-sm">Created by Walz Travels · {itin.referenceNumber}</p>
          <p className="text-white/20 text-xs mt-1">{BUSINESS.contacts.email} · walztravels.com</p>
        </div>
      </footer>
    </main>
  )
}
