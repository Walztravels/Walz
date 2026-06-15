import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Clock, Check, X, ArrowLeft } from 'lucide-react'
import { getActivityBySlug, STATIC_ACTIVITIES } from '@/lib/activities-data'
import { BookingSidebar } from '@/components/activities/BookingSidebar'
import prisma from '@/lib/db'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  return STATIC_ACTIVITIES.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await getActivity(params.slug)
  if (!a) return { title: 'Activity | Walz Travels' }
  return {
    title:       `${a.title} | Walz Travels`,
    description: a.shortDesc ?? (a.description ?? '').slice(0, 160),
  }
}

async function getActivity(slug: string) {
  try {
    const db = await prisma.activity.findUnique({ where: { slug, isPublished: true } })
    if (db) return db
  } catch {}
  return getActivityBySlug(slug)
}

const SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', NGN: '₦', GHS: '₵', AED: 'AED ',
}

const CATEGORY_LABELS: Record<string, string> = {
  beach:     'Beach & Water',
  culture:   'Culture & History',
  wildlife:  'Wildlife & Safari',
  adventure: 'Adventure & Sports',
  food:      'Food & Drink',
  air:       'Helicopter & Air',
}

export default async function ActivityLandingPage({ params }: { params: { slug: string } }) {
  const activity = await getActivity(params.slug)
  if (!activity) notFound()

  const categoryLabel = CATEGORY_LABELS[activity.category] ?? activity.category

  return (
    <div className="min-h-screen bg-[#F5F0E8]">

      {/* Hero */}
      <div className="relative h-[55vh] md:h-[70vh] overflow-hidden">
        {activity.image ? (
          <Image src={activity.image} alt={activity.title} fill priority className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[#0B1F3A]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

        <Link href="/activities"
          className="absolute top-6 left-6 flex items-center gap-2 text-white/80 hover:text-white bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full text-sm transition-colors z-10">
          <ArrowLeft className="w-4 h-4" /> All Experiences
        </Link>

        {activity.badge && (
          <div className="absolute top-6 right-6 z-10">
            <span className="bg-[#C9A84C] text-[#0B1F3A] font-bold text-xs px-3 py-1.5 rounded-full uppercase tracking-wider">
              {activity.badge}
            </span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 z-10">
          <p className="text-[#C9A84C] text-xs uppercase tracking-[3px] mb-2">{categoryLabel}</p>
          <h1 className="text-white font-bold leading-tight mb-3"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3.5rem)' }}>
            {activity.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 flex-shrink-0" />{activity.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 flex-shrink-0" />{activity.duration}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-bold text-[#0B1F3A] text-lg mb-3">About this experience</h2>
              <p className="text-gray-600 leading-relaxed">{activity.description}</p>
            </div>

            {activity.included && activity.included.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-[#0B1F3A] text-lg mb-4">What&apos;s included</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activity.included.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />{item}
                    </div>
                  ))}
                </div>

                {activity.notIncluded && activity.notIncluded.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Not included</p>
                    <div className="space-y-2">
                      {activity.notIncluded.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-gray-400">
                          <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />{item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activity.meetingPoint && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-[#0B1F3A] text-lg mb-2">Meeting point</h2>
                <p className="text-gray-600 text-sm flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />
                  {activity.meetingPoint}
                </p>
              </div>
            )}

            {activity.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                <p className="font-semibold text-amber-900 text-sm mb-1.5">Important notes</p>
                <p className="text-amber-800 text-sm leading-relaxed">{activity.notes}</p>
              </div>
            )}
          </div>

          {/* Booking sidebar */}
          <BookingSidebar activity={activity} />
        </div>

        {/* More experiences */}
        <div className="mt-16">
          <h2 className="font-bold text-[#0B1F3A] text-xl mb-6">More experiences</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STATIC_ACTIVITIES.filter(a => a.slug !== activity.slug).slice(0, 3).map(a => (
              <Link key={a.slug} href={`/activities/${a.slug}`}
                className="group relative overflow-hidden rounded-2xl h-48 block">
                <Image src={a.image} alt={a.title} fill loading="lazy"
                  className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-[#C9A84C] text-xs uppercase tracking-wider mb-1">{a.duration}</p>
                  <p className="text-white font-bold text-sm leading-tight">{a.title}</p>
                  <p className="text-white/60 text-xs mt-1">
                    {SYM[a.currency]}{a.price.toLocaleString()} from
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
