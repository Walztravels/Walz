import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import prisma from '@/lib/db'
import { PackageGallery } from '@/components/PackageGallery'
import PackageBookingModal from '@/components/PackageBookingModal'
import CinematicPackageCard from '@/components/CinematicPackageCard'

export const revalidate = 60

// ── Types ─────────────────────────────────────────────────────────────────────

interface TravelPackage {
  id: string
  slug: string
  title: string
  destination: string
  country_iso2: string | null
  tagline: string | null
  description: string | null
  highlights: string[]
  inclusions: string[]
  exclusions: string[]
  itinerary: Array<{ day: number; title: string; description: string }>
  images: string[]
  duration_days: number
  duration_nights: number | null
  price_per_person: number
  currency: string
  original_price: number | null
  deposit_amount: number | null
  package_type: string
  departure_date: string | null
  return_date: string | null
  total_seats: number | null
  seats_booked: number
  departure_city: string | null
  visa_included: boolean
  flight_included: boolean
  hotel_included: boolean
  hotel_rating: number | null
  meals: string | null
  is_featured: boolean
  is_active: boolean
  seo_title: string | null
  seo_description: string | null
  display_order: number
}

// ── Fallbacks ─────────────────────────────────────────────────────────────────

const DESTINATION_FALLBACKS: Record<
  string,
  { name: string; image: string; country: string; tagline: string }
> = {
  london: {
    name: 'London',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1600&q=85',
    country: 'United Kingdom',
    tagline: 'World-class city breaks and cultural experiences',
  },
  dubai: {
    name: 'Dubai',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1600&q=85',
    country: 'UAE',
    tagline: 'Luxury, adventure and skyline experiences',
  },
  toronto: {
    name: 'Toronto',
    image: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=85',
    country: 'Canada',
    tagline: 'Vibrant city with diverse culture and nature',
  },
  paris: {
    name: 'Paris',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&q=85',
    country: 'France',
    tagline: 'Romance, cuisine and timeless elegance',
  },
  'new-york': {
    name: 'New York',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1600&q=85',
    country: 'USA',
    tagline: 'The city that never sleeps, endlessly electric',
  },
  amsterdam: {
    name: 'Amsterdam',
    image: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=1600&q=85',
    country: 'Netherlands',
    tagline: 'Canals, culture and world-class museums',
  },
  maldives: {
    name: 'Maldives',
    image: 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=1600&q=85',
    country: 'Maldives',
    tagline: 'Paradise overwater villas and pristine lagoons',
  },
  singapore: {
    name: 'Singapore',
    image: 'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=1600&q=85',
    country: 'Singapore',
    tagline: 'Futuristic city-state of food, nature and design',
  },
  accra: {
    name: 'Accra',
    image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=85',
    country: 'Ghana',
    tagline: 'Heritage, beaches and the vibrant heart of West Africa',
  },
  lagos: {
    name: 'Lagos',
    image: 'https://images.unsplash.com/photo-1618828665011-0abd973f7bb8?w=1600&q=85',
    country: 'Nigeria',
    tagline: 'Afrobeats, beaches and the energy of Africa',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flagEmoji(iso2: string | null): string {
  if (!iso2 || iso2.length !== 2) return '🌍'
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function packageTypeBadge(type: string): string {
  const map: Record<string, string> = {
    group: 'Group Tour',
    private: 'Private',
    honeymoon: 'Honeymoon',
    corporate: 'Corporate',
  }
  return map[type] ?? type
}

function packageTypeColor(type: string): string {
  const map: Record<string, string> = {
    group: 'bg-[#C9A84C]/15 text-[#8B6914]',
    private: 'bg-[#0B1F3A]/10 text-[#0B1F3A]',
    honeymoon: 'bg-pink-50 text-pink-700',
    corporate: 'bg-slate-100 text-slate-700',
  }
  return map[type] ?? 'bg-gray-100 text-gray-700'
}

function safeJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return [] as unknown as T
    }
  }
  return value
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  try {
    const rows = await prisma.$queryRawUnsafe<TravelPackage[]>(
      'SELECT * FROM travel_packages WHERE slug = $1 AND is_active = true LIMIT 1',
      params.slug,
    )
    if (rows.length > 0) {
      const pkg = rows[0]
      const title = pkg.seo_title ?? `${pkg.title} | Walz Travels`
      const description =
        pkg.seo_description ?? pkg.tagline ?? (pkg.description?.slice(0, 155) ?? '')
      const images = safeJsonField<string[]>(pkg.images as unknown as string)
      const ogImage = images?.[0] ?? undefined
      return {
        title,
        description,
        alternates: { canonical: `https://www.walztravels.com/packages/${pkg.slug}` },
        openGraph: {
          title,
          description,
          images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
        },
      }
    }
  } catch {
    // fall through to fallbacks
  }

  const fb = DESTINATION_FALLBACKS[params.slug]
  if (fb) {
    return {
      title: `${fb.name} Packages | Walz Travels`,
      description: `${fb.tagline}. Book your ${fb.name} trip with Walz Travels — flights, visa, hotel and tours included.`,
      openGraph: { images: [{ url: fb.image, width: 1600, height: 900 }] },
    }
  }

  return { title: 'Package Not Found | Walz Travels' }
}

export function generateStaticParams() {
  return []
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PackagePage({ params }: { params: { slug: string } }) {
  let pkg: TravelPackage | null = null
  let otherPackages: TravelPackage[] = []

  try {
    const rows = await prisma.$queryRawUnsafe<TravelPackage[]>(
      'SELECT * FROM travel_packages WHERE slug = $1 AND is_active = true LIMIT 1',
      params.slug,
    )
    if (rows.length > 0) {
      const raw = rows[0]
      pkg = {
        ...raw,
        highlights: safeJsonField<string[]>(raw.highlights as unknown as string),
        inclusions: safeJsonField<string[]>(raw.inclusions as unknown as string),
        exclusions: safeJsonField<string[]>(raw.exclusions as unknown as string),
        itinerary: safeJsonField<TravelPackage['itinerary']>(raw.itinerary as unknown as string),
        images: safeJsonField<string[]>(raw.images as unknown as string),
      }

      const others = await prisma.$queryRawUnsafe<TravelPackage[]>(
        'SELECT * FROM travel_packages WHERE is_active = true AND slug != $1 ORDER BY is_featured DESC, display_order ASC LIMIT 3',
        params.slug,
      )
      otherPackages = others.map((p) => ({
        ...p,
        images: safeJsonField<string[]>(p.images as unknown as string),
      }))
    }
  } catch {
    // DB unavailable
  }

  if (pkg) {
    return <PackageDetail pkg={pkg} otherPackages={otherPackages} />
  }

  const fb = DESTINATION_FALLBACKS[params.slug]
  if (fb) {
    return <DestinationFallback slug={params.slug} fb={fb} />
  }

  notFound()
}

// ── Full Package Detail ───────────────────────────────────────────────────────

function PackageDetail({
  pkg,
  otherPackages,
}: {
  pkg: TravelPackage
  otherPackages: TravelPackage[]
}) {
  const seatsRemaining =
    pkg.total_seats != null ? pkg.total_seats - pkg.seats_booked : null
  const isLowSeats =
    seatsRemaining != null &&
    pkg.total_seats != null &&
    seatsRemaining <= pkg.total_seats * 0.5
  const savings =
    pkg.original_price != null ? pkg.original_price - pkg.price_per_person : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: pkg.title,
    description: pkg.tagline ?? pkg.description,
    offers: {
      '@type': 'Offer',
      price: pkg.price_per_person,
      priceCurrency: pkg.currency,
      availability:
        pkg.total_seats == null || (seatsRemaining != null && seatsRemaining > 0)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
    },
    provider: { '@type': 'TravelAgency', name: 'Walz Travels' },
  }

  const whatsappText = encodeURIComponent(
    `Hi! I'm interested in the "${pkg.title}" package. Can you help me book?`,
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-[#F7F4EF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">

            {/* ── LEFT COLUMN ── */}
            <div className="lg:col-span-2 space-y-10">

              {/* Gallery */}
              <div className="-mx-4 sm:-mx-0 overflow-hidden rounded-none sm:rounded-2xl">
                <PackageGallery images={pkg.images ?? []} title={pkg.title} />
              </div>

              {/* Header */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-sm text-[#0B1F3A]/60 font-medium">
                    {pkg.destination}
                    {pkg.country_iso2 && (
                      <span className="ml-1">{flagEmoji(pkg.country_iso2)}</span>
                    )}
                  </span>
                  <span className="text-[#0B1F3A]/30">·</span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${packageTypeColor(pkg.package_type)}`}
                  >
                    {packageTypeBadge(pkg.package_type)}
                  </span>
                </div>

                <h1 className="font-display text-3xl lg:text-5xl font-bold text-[#0B1F3A] leading-tight mb-3">
                  {pkg.title}
                </h1>

                {pkg.tagline && (
                  <p className="text-lg italic text-[#C9A84C] font-medium mb-5">{pkg.tagline}</p>
                )}

                {/* Quick facts */}
                <div className="flex flex-wrap gap-3">
                  <QuickFact
                    icon={<CalendarIcon />}
                    label={`${pkg.duration_days} Days${pkg.duration_nights != null ? ` · ${pkg.duration_nights} Nights` : ''}`}
                  />
                  {pkg.departure_city && (
                    <QuickFact icon={<PlaneIcon />} label={`Departs ${pkg.departure_city}`} />
                  )}
                  {pkg.departure_date && (
                    <QuickFact icon={<ClockIcon />} label={formatDate(pkg.departure_date)} />
                  )}
                  {pkg.hotel_rating != null && (
                    <QuickFact icon={<StarIcon />} label={`${pkg.hotel_rating}-star hotel`} />
                  )}
                  {pkg.meals && (
                    <QuickFact icon={<MealsIcon />} label={pkg.meals} />
                  )}
                </div>
              </div>

              {/* Overview */}
              {pkg.description && (
                <section>
                  <SectionHeading>Overview</SectionHeading>
                  <div className="space-y-4">
                    {pkg.description
                      .split('\n\n')
                      .filter(Boolean)
                      .map((para, i) => (
                        <p key={i} className="text-gray-600 leading-relaxed">
                          {para}
                        </p>
                      ))}
                  </div>
                </section>
              )}

              {/* Highlights */}
              {pkg.highlights?.length > 0 && (
                <section>
                  <SectionHeading>Highlights</SectionHeading>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pkg.highlights.map((h, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
                      >
                        <span className="flex-shrink-0 mt-0.5">
                          <svg viewBox="0 0 20 20" fill="#C9A84C" className="w-4 h-4">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                        <span className="text-sm text-gray-700 leading-snug">{h}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Inclusions & Exclusions */}
              {(pkg.inclusions?.length > 0 || pkg.exclusions?.length > 0) && (
                <section>
                  <SectionHeading>What&apos;s Included</SectionHeading>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {pkg.inclusions?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#0B1F3A]/50 mb-3">
                          Included
                        </p>
                        <ul className="space-y-2.5">
                          {pkg.inclusions.map((item, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                              <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center">
                                <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
                                  <path
                                    d="M2 6l3 3 5-5"
                                    stroke="#059669"
                                    strokeWidth={1.8}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pkg.exclusions?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#0B1F3A]/50 mb-3">
                          Not Included
                        </p>
                        <ul className="space-y-2.5">
                          {pkg.exclusions.map((item, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-500">
                              <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center">
                                <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
                                  <path
                                    d="M3 3l6 6M9 3l-6 6"
                                    stroke="#9CA3AF"
                                    strokeWidth={1.8}
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Itinerary */}
              {pkg.itinerary?.length > 0 && (
                <section>
                  <SectionHeading>Day-by-Day Itinerary</SectionHeading>
                  <div className="space-y-2">
                    {pkg.itinerary.map((day) => (
                      <details
                        key={day.day}
                        className="group bg-white border border-[#C9A84C]/15 rounded-2xl shadow-sm overflow-hidden"
                      >
                        <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="flex-shrink-0 w-9 h-9 rounded-full border-2 border-[#C9A84C] text-[#C9A84C] font-display text-sm font-bold flex items-center justify-center">
                              {day.day}
                            </span>
                            <span className="font-semibold text-[#0B1F3A] text-sm">
                              Day {day.day} — {day.title}
                            </span>
                          </div>
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </summary>
                        <div className="px-5 pb-5 pt-2 text-sm text-gray-600 leading-relaxed border-t border-gray-100">
                          {day.description}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {/* Other packages */}
              {otherPackages.length > 0 && (
                <section>
                  <SectionHeading>You Might Also Like</SectionHeading>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {otherPackages.map((p, i) => (
                      <CinematicPackageCard
                        key={p.id}
                        id={p.id}
                        slug={p.slug}
                        title={p.title}
                        destination={p.destination}
                        country_iso2={p.country_iso2}
                        tagline={p.tagline}
                        images={p.images ?? []}
                        duration_days={p.duration_days}
                        duration_nights={p.duration_nights}
                        price_per_person={p.price_per_person}
                        currency={p.currency}
                        original_price={p.original_price}
                        package_type={p.package_type}
                        departure_date={p.departure_date}
                        total_seats={p.total_seats}
                        seats_booked={p.seats_booked}
                        is_featured={p.is_featured ?? false}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* CTA Banner */}
              <section
                className="rounded-3xl p-10 lg:p-14 text-center"
                style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #1C3557 100%)' }}
              >
                <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-2">
                  Flexible Planning
                </p>
                <h2 className="font-display text-2xl font-bold text-white mb-3">
                  Can&apos;t find your dates?
                </h2>
                <p className="text-white/60 text-sm max-w-md mx-auto mb-6">
                  We build private packages too — your dates, your group, your budget. Chat with
                  us and we&apos;ll design the perfect trip.
                </p>
                <a
                  href={`https://wa.me/447398753797?text=${encodeURIComponent(`Hi! I'm interested in a private "${pkg.title}" package but need custom dates. Can you help?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
                >
                  <WhatsAppIcon />
                  Chat with Us on WhatsApp
                </a>
              </section>
            </div>

            {/* ── RIGHT COLUMN: Sticky booking card ── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="bg-white rounded-3xl border border-[#C9A84C]/20 shadow-2xl overflow-hidden">
                  <div className="p-6 space-y-5">

                    {/* Price */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
                        FROM
                      </p>
                      {pkg.original_price != null && (
                        <p className="text-sm text-gray-400 line-through mb-0.5">
                          {pkg.currency} {pkg.original_price.toLocaleString()}
                        </p>
                      )}
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-[#C9A84C]">
                          {pkg.currency} {pkg.price_per_person.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">per person</p>
                      {savings != null && savings > 0 && (
                        <span className="inline-block mt-2 bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                          Save {pkg.currency} {savings.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Seats progress */}
                    {pkg.total_seats != null && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>
                            {pkg.seats_booked} of {pkg.total_seats} seats booked
                          </span>
                          {seatsRemaining != null && (
                            <span
                              className={
                                isLowSeats ? 'text-red-500 font-semibold' : 'text-gray-400'
                              }
                            >
                              {seatsRemaining} left
                            </span>
                          )}
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (pkg.seats_booked / pkg.total_seats!) * 100)}%`,
                              backgroundColor: '#C9A84C',
                            }}
                          />
                        </div>
                        {isLowSeats && seatsRemaining != null && (
                          <p className="text-red-500 text-xs font-semibold mt-2">
                            Only {seatsRemaining}{' '}
                            {seatsRemaining === 1 ? 'seat' : 'seats'} left!
                          </p>
                        )}
                      </div>
                    )}

                    {/* Deposit */}
                    {pkg.deposit_amount != null && (
                      <div className="bg-[#C9A84C]/10 rounded-xl px-4 py-3 text-sm text-[#0B1F3A]">
                        <span className="font-semibold">Reserve your spot</span> with a{' '}
                        <span className="font-bold text-[#C9A84C]">
                          {pkg.currency} {pkg.deposit_amount.toLocaleString()}
                        </span>{' '}
                        deposit
                      </div>
                    )}

                    {/* Book button — triggers modal via custom event */}
                    <BookButton />

                    {/* WhatsApp */}
                    <a
                      href={`https://wa.me/447398753797?text=${whatsappText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm border-2 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white transition-colors cursor-pointer"
                    >
                      <WhatsAppIcon />
                      Ask Jade on WhatsApp
                    </a>

                    {/* Trust row */}
                    <div className="flex items-center justify-center gap-4 pt-1">
                      <TrustItem icon={<LockIcon />} label="Secure" />
                      <TrustItem icon={<CheckIcon />} label="Expert support" />
                      <TrustItem icon={<ChatIcon />} label="Reply in 2 hrs" />
                    </div>
                  </div>
                </div>

                {/* Departure badge below card */}
                {pkg.departure_date && (
                  <div className="mt-4 bg-[#0B1F3A] text-white rounded-xl px-4 py-3 text-sm text-center">
                    <span className="text-[#C9A84C] font-semibold">Next departure:</span>{' '}
                    {formatDate(pkg.departure_date)}
                    {pkg.departure_city && ` from ${pkg.departure_city}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PackageBookingModal pkg={{
        id: pkg.id,
        slug: pkg.slug,
        title: pkg.title,
        price_per_person: pkg.price_per_person,
        currency: pkg.currency,
        deposit_amount: pkg.deposit_amount,
        departure_date: pkg.departure_date,
        total_seats: pkg.total_seats,
        seats_booked: pkg.seats_booked,
      }} />
    </>
  )
}

// ── Destination Fallback ──────────────────────────────────────────────────────

function DestinationFallback({
  slug,
  fb,
}: {
  slug: string
  fb: { name: string; image: string; country: string; tagline: string }
}) {
  void slug
  const whatsappText = encodeURIComponent(
    `Hi! I'm interested in visiting ${fb.name}. Can you build a custom package for me?`,
  )

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* Hero */}
      <div className="relative h-[70vh] min-h-[480px] flex items-end overflow-hidden">
        <Image
          src={fb.image}
          alt={fb.name}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/95 via-[#0B1F3A]/50 to-transparent" />
        <div className="relative max-w-4xl mx-auto px-6 pb-16 w-full">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-3">
            {fb.country}
          </p>
          <h1 className="font-display text-4xl lg:text-6xl font-bold text-white mb-4 leading-tight">
            Packages to {fb.name}
          </h1>
          <p className="text-white/70 text-lg max-w-xl">{fb.tagline}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        <div className="text-center">
          <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A] mb-4">
            Your perfect {fb.name} trip, built around you.
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
            We build custom {fb.name} packages to your exact dates and budget — flights, visa,
            hotel, transfers and tours included. Tell us what you&apos;re looking for and
            we&apos;ll design the perfect itinerary.
          </p>
        </div>

        {/* Enquiry card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 max-w-xl mx-auto">
          <h3 className="font-display text-xl font-bold text-[#0B1F3A] mb-2">
            Enquire about {fb.name}
          </h3>
          <p className="text-gray-500 text-sm mb-6">We reply within 2 hours on WhatsApp.</p>
          <a
            href={`https://wa.me/447398753797?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
          >
            <WhatsAppIcon />
            Chat with Jade on WhatsApp
          </a>
        </div>

        {/* Links */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/packages"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border-2 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white transition-colors cursor-pointer"
          >
            View All Packages
          </Link>
          <Link
            href="/visa"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-[#C9A84C] hover:underline cursor-pointer"
          >
            Check Visa Requirements for {fb.country} →
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Book button — rendered via inline script to avoid a client boundary ───────
// Using a raw <script> + onclick attribute so the entire page stays a server component.

function BookButton() {
  return (
    <>
      <button
        id="open-booking-btn"
        type="button"
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 cursor-pointer"
        style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
      >
        Book This Package
      </button>
      {/* Attach the event without making this a client component */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('open-booking-btn')?.addEventListener('click',function(){window.dispatchEvent(new Event('open-booking-modal'))})`,
        }}
      />
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#0B1F3A] leading-tight">
        {children}
      </h2>
      <div className="mt-3 w-12 h-1 bg-[#C9A84C] rounded-full" />
    </div>
  )
}

function QuickFact({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
      <span className="text-[#C9A84C] flex-shrink-0">{icon}</span>
      {label}
    </div>
  )
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400">
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      {label}
    </div>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#C9A84C" className="w-4 h-4">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function MealsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M18 8h1a4 4 0 010 8h-1" />
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
