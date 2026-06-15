import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Image from 'next/image'
import type { Metadata } from 'next'
import { Clock, MapPin, Check, X, MessageCircle } from 'lucide-react'

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await prisma.activity.findUnique({ where: { slug: params.slug } })
  if (!a) return { title: 'Activity Not Found' }
  return {
    title:       `${a.title} | Walz Travels`,
    description: a.shortDesc ?? a.description.slice(0, 155),
    openGraph: {
      title: a.title,
      description: a.shortDesc ?? a.description.slice(0, 155),
      images: a.image ? [a.image] : [],
    },
  }
}

const SYM: Record<string, string> = { GBP:'£',USD:'$',EUR:'€',CAD:'CA$',NGN:'₦',GHS:'₵',AED:'AED ' }

export default async function ActivityPage({ params }: Props) {
  const activity = await prisma.activity.findUnique({
    where: { slug: params.slug, isPublished: true },
  })

  if (!activity) notFound()

  const waText = encodeURIComponent(
    `Hi Walz Travels! I'm interested in booking "${activity.title}" (${SYM[activity.currency] ?? ''}${activity.price.toLocaleString()}). Please can you give me more details?`
  )
  const waLink = `https://wa.me/447398753797?text=${waText}`

  return (
    <main className="min-h-screen bg-[#070f1e]">
      {/* Hero */}
      <div className="relative h-[55vh] min-h-[380px] bg-[#0d2347] overflow-hidden">
        {activity.image && (
          <Image
            src={activity.image}
            alt={activity.title}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070f1e] via-black/40 to-transparent" />

        {/* Badge */}
        {activity.badge && (
          <div className="absolute top-6 left-6">
            <span className="bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              {activity.badge}
            </span>
          </div>
        )}

        {/* Category */}
        <div className="absolute top-6 right-6">
          <span className="bg-white/15 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full capitalize border border-white/20">
            {activity.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 -mt-16 relative z-10 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Main column */}
          <div className="md:col-span-2">
            <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
              {activity.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#C9A84C]" />
                {activity.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#C9A84C]" />
                {activity.duration}
              </span>
            </div>

            <p className="text-white/75 leading-relaxed mb-8 text-base">
              {activity.description}
            </p>

            {activity.meetingPoint && (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-6">
                <p className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1">Meeting Point</p>
                <p className="text-white text-sm">{activity.meetingPoint}</p>
              </div>
            )}

            {activity.included.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-bold mb-3 text-sm uppercase tracking-wider">What&apos;s Included</h3>
                <ul className="space-y-2">
                  {activity.included.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-white/75 text-sm">
                      <Check className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activity.notIncluded.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-bold mb-3 text-sm uppercase tracking-wider">Not Included</h3>
                <ul className="space-y-2">
                  {activity.notIncluded.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-white/50 text-sm">
                      <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activity.notes && (
              <div className="bg-amber-900/20 border border-[#C9A84C]/20 rounded-2xl px-5 py-4 mb-6">
                <p className="text-xs text-[#C9A84C] font-semibold uppercase tracking-wider mb-2">Important Notes</p>
                <p className="text-white/70 text-sm whitespace-pre-line">{activity.notes}</p>
              </div>
            )}
          </div>

          {/* Booking sidebar */}
          <div className="md:col-span-1">
            <div className="bg-[#0d2347] border border-white/10 rounded-2xl p-6 sticky top-6">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Price from</p>
              <p className="text-4xl font-bold text-white mb-0.5">
                {SYM[activity.currency] ?? ''}{activity.price.toLocaleString()}
              </p>
              <p className="text-white/40 text-xs mb-6">per person · {activity.currency}</p>

              <a href={waLink} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20bd5c] text-white font-bold py-3.5 rounded-xl transition-colors text-sm mb-3">
                <MessageCircle className="w-4 h-4" />
                Book via WhatsApp
              </a>

              <a href={`mailto:hello@walztravels.com?subject=${encodeURIComponent(`Booking: ${activity.title}`)}`}
                className="flex items-center justify-center gap-2 w-full bg-white/8 hover:bg-white/12 border border-white/15 text-white/80 font-medium py-3 rounded-xl transition-colors text-sm">
                Email Us Instead
              </a>

              <p className="text-white/30 text-xs text-center mt-4 leading-relaxed">
                Our team will confirm availability and guide you through the booking.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
