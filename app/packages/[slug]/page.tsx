import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import prisma from '@/lib/db'
import { MapPin, Clock, ArrowLeft, Check, ArrowRight } from 'lucide-react'
import { BookingCard } from '@/components/packages/BookingCard'

export const revalidate = 60

type RouteContext = { params: { slug: string } }

function parseHighlights(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function coverPhoto(pkg: { photos: string[]; imageUrl: string | null }): string | null {
  return pkg.photos[0] ?? pkg.imageUrl ?? null
}

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const pkg = await prisma.tourListing.findUnique({ where: { slug: params.slug } })
  if (!pkg) return {}
  return {
    title: { absolute: `${pkg.name} | Walz Travels` },
    description: pkg.description.slice(0, 160),
    openGraph: { title: pkg.name, description: pkg.description.slice(0, 160) },
  }
}

export default async function PackageDetailPage({ params }: RouteContext) {
  const [pkg, related] = await Promise.all([
    prisma.tourListing.findUnique({ where: { slug: params.slug } }),
    prisma.tourListing.findMany({
      where: { active: true, slug: { not: params.slug } },
      orderBy: { order: 'asc' },
      take: 3,
    }),
  ])

  if (!pkg || !pkg.active) notFound()

  const highlights = parseHighlights(pkg.highlights)
  const allPhotos = pkg.photos.filter(Boolean)
  const heroImage = coverPhoto(pkg) ?? 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=85'

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── HERO ── */}
      <section className="relative h-[55vh] min-h-[420px] overflow-hidden">
        <Image
          src={heroImage}
          fill
          priority
          sizes="100vw"
          alt={pkg.name}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/40 to-transparent" />

        {/* Back link */}
        <div className="absolute top-6 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/packages"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All Packages
          </Link>
        </div>

        <div className="absolute bottom-0 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 lg:pb-14">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1 text-white/70 text-sm">
              <MapPin className="w-3.5 h-3.5" /> {pkg.location}
            </span>
            <span className="text-white/40">·</span>
            <span className="flex items-center gap-1 text-white/70 text-sm">
              <Clock className="w-3.5 h-3.5" /> {pkg.duration}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight max-w-3xl">
            {pkg.name}
          </h1>
        </div>
      </section>

      {/* ── BODY ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Left — content */}
          <div className="lg:col-span-2 space-y-10">

            {/* Description */}
            <div>
              <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">About this package</h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{pkg.description}</p>
            </div>

            {/* Highlights */}
            {highlights.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">What&apos;s included</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-gray-700 text-sm">
                      <span className="w-5 h-5 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#C9A84C]" />
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Photo gallery */}
            {allPhotos.length > 1 && (
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Gallery</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {allPhotos.slice(1).map((src, i) => (
                    <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden">
                      <Image
                        src={src}
                        fill
                        alt={`${pkg.name} photo ${i + 2}`}
                        className="object-cover hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, 33vw"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — BookingCard */}
          <div className="lg:col-span-1">
            <BookingCard
              packageSlug={pkg.slug}
              packageName={pkg.name}
              price={pkg.price}
              currency={pkg.currency}
              location={pkg.location}
              duration={pkg.duration}
            />
          </div>
        </div>

        {/* ── RELATED PACKAGES ── */}
        {related.length > 0 && (
          <div className="mt-16 pt-12 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-[#0B1F3A] mb-8">More packages</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map(r => {
                const rCover = coverPhoto(r)
                return (
                  <Link
                    key={r.id}
                    href={`/packages/${r.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all"
                  >
                    <div className="relative h-44 overflow-hidden bg-gray-100">
                      {rCover ? (
                        <Image
                          src={rCover}
                          fill
                          alt={r.name}
                          sizes="(max-width: 640px) 100vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F3A] to-[#1a3358]" />
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-[#0B1F3A] text-sm leading-snug group-hover:text-[#C9A84C] transition-colors">
                        {r.name}
                      </h3>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-500">{r.location} · {r.duration}</p>
                        <span className="text-xs font-bold text-[#C9A84C]">
                          {r.currency} {r.price.toLocaleString()}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-[#0B1F3A] group-hover:text-[#C9A84C] transition-colors mt-3 font-medium">
                        View <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
