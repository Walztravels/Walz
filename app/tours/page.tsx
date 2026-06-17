'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Users,
  Clock,
  Star,
  Check,
  X,
  Loader2,
  MapPin,
  CheckCircle,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { JadeChat } from '@/components/ui/JadeChat'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbTour {
  id: string
  name: string
  slug: string
  description: string
  highlights: string   // JSON string — array of strings
  price: number
  currency: string
  duration: string
  location: string
  imageUrl: string | null
  active: boolean
  order: number
}

// ── Enquiry form ───────────────────────────────────────────────────────────────

const enquirySchema = z.object({
  tourName: z.string().min(1),
  tourDate: z.string().min(1, 'Select a preferred date'),
  groupSize: z.number().min(1).max(20),
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(7, 'Phone number required'),
  specialRequirements: z.string().optional(),
  preferredPickupLocation: z.string().optional(),
})

type EnquiryFormData = z.infer<typeof enquirySchema>

function EnquiryModal({ tourName, onClose }: { tourName: string; onClose: () => void }) {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<EnquiryFormData>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { tourName, groupSize: 2 },
  })

  const onSubmit = async (data: EnquiryFormData) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/tours/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const resData = await response.json() as { error?: string }
        throw new Error(resData.error || 'Failed to submit enquiry')
      }
      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-luxury w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-walz-deep-navy p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-walz-white">Enquire About Tour</h3>
            <p className="text-walz-muted text-sm">{tourName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-walz-muted hover:text-walz-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-walz-success" />
            </div>
            <h4 className="font-display text-xl font-bold text-walz-deep-navy mb-2">Enquiry Received!</h4>
            <p className="text-walz-muted text-sm mb-5">
              Our tour specialists will contact you within 24 hours to discuss your personalised itinerary.
            </p>
            <Button variant="gold" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-walz">First Name *</label>
                <Input {...register('firstName')} className={cn(errors.firstName && 'border-walz-error')} />
                {errors.firstName && <p className="text-walz-error text-xs mt-1">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="label-walz">Last Name *</label>
                <Input {...register('lastName')} className={cn(errors.lastName && 'border-walz-error')} />
                {errors.lastName && <p className="text-walz-error text-xs mt-1">{errors.lastName.message}</p>}
              </div>
            </div>
            <div>
              <label className="label-walz">Email *</label>
              <Input type="email" {...register('email')} className={cn(errors.email && 'border-walz-error')} />
              {errors.email && <p className="text-walz-error text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label-walz">Phone *</label>
              <Input type="tel" placeholder="+44 7700 000000" {...register('phone')} className={cn(errors.phone && 'border-walz-error')} />
              {errors.phone && <p className="text-walz-error text-xs mt-1">{errors.phone.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-walz">Preferred Date *</label>
                <Input type="date" min={new Date().toISOString().split('T')[0]} {...register('tourDate')} className={cn(errors.tourDate && 'border-walz-error')} />
                {errors.tourDate && <p className="text-walz-error text-xs mt-1">{errors.tourDate.message}</p>}
              </div>
              <div>
                <label className="label-walz">Group Size *</label>
                <select className="input-walz h-10" {...register('groupSize', { valueAsNumber: true })}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label-walz">Special Requirements (optional)</label>
              <textarea
                className="input-walz min-h-[80px] resize-none"
                placeholder="Accessibility needs, dietary requirements, special occasions..."
                {...register('specialRequirements')}
              />
            </div>
            {error && <div className="p-3 bg-red-50 rounded-lg text-walz-error text-sm">{error}</div>}
            <Button type="submit" variant="gold" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending Enquiry...</> : 'Send Enquiry'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Tour Card — IntersectionObserver scroll fade-in ────────────────────────────

function TourCard({ tour, index }: { tour: DbTour; index: number }) {
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Scroll fade-in — IntersectionObserver, staggered by index
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])

  let parsedHighlights: string[] = []
  try { parsedHighlights = JSON.parse(tour.highlights) } catch { parsedHighlights = [] }

  return (
    <>
      <div
        ref={cardRef}
        className={`group bg-white rounded-2xl overflow-hidden border border-gray-100
          shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col
          ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        style={{ transitionDelay: `${index * 80}ms` }}
      >
        {/* Image */}
        <div className="relative h-52 overflow-hidden bg-walz-deep-navy/10">
          {tour.imageUrl ? (
            <img
              src={tour.imageUrl}
              alt={tour.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C3557] to-[#0B1F3A]">
              <ImageIcon className="w-10 h-10 text-white/20" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-3 right-3 bg-walz-gold text-walz-deep-navy text-xs font-bold px-3 py-1.5 rounded-full">
            From {tour.currency} {tour.price.toLocaleString()}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col flex-1">
          <h3 className="font-display text-base font-bold text-walz-deep-navy mb-1 leading-snug line-clamp-2">
            {tour.name}
          </h3>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-walz-muted text-xs mb-3">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />{tour.location}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{tour.duration}
            </span>
          </div>

          <p className="text-walz-muted text-sm leading-relaxed line-clamp-2 mb-4 flex-1">
            {tour.description}
          </p>

          {/* Highlights — top 3 only */}
          {parsedHighlights.length > 0 && (
            <ul className="space-y-1 mb-4">
              {parsedHighlights.slice(0, 3).map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-walz-deep-navy">
                  <Check className="w-3 h-3 text-walz-gold flex-shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          )}

          {/* CTA buttons */}
          <div className="flex gap-2 pt-3 border-t border-gray-100 mt-auto">
            <a href={`/tours/book?slug=${tour.slug}`} className="flex-1">
              <Button variant="gold" className="w-full text-xs py-2.5">Book Now</Button>
            </a>
            <JadeChat
              context={{
                source:      'tour_page',
                pageTitle:   tour.name,
                pageUrl:     `/tours`,
                price:       `${tour.currency} ${tour.price}`,
                location:    tour.location,
                enquiryType: 'tour_booking',
              }}
              label="Enquire"
              className="whitespace-nowrap px-3 py-2 text-xs"
              variant="outline"
            />
          </div>
        </div>
      </div>

      {isEnquiryOpen && (
        <EnquiryModal tourName={tour.name} onClose={() => setIsEnquiryOpen(false)} />
      )}
    </>
  )
}

// ── Fallback tours (shown if DB fetch fails or times out) ─────────────────────

const FALLBACK_TOURS: DbTour[] = [
  {
    id: '1', slug: 'niagara-falls-vip', active: true, order: 1,
    name: 'Niagara Falls VIP Private Tour',
    location: 'Niagara Falls, Canada',
    duration: '8 hours',
    price: 450,
    currency: 'CAD',
    description: 'Private guide, luxury vehicle, and exclusive viewpoints — see the falls without the crowds. From Toronto, full day.',
    highlights: JSON.stringify(['Private guide throughout', 'Luxury vehicle', 'Exclusive viewpoints', 'Hotel pickup available']),
    imageUrl: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
  },
  {
    id: '2', slug: 'london-private-day-tour', active: true, order: 2,
    name: 'London Private Day Tour',
    location: 'London, United Kingdom',
    duration: '8 hours',
    price: 295,
    currency: 'GBP',
    description: 'Buckingham Palace, the Tower of London, and a Thames cruise — a full day of London highlights with a private guide.',
    highlights: JSON.stringify(['Buckingham Palace', 'Tower of London', 'Thames cruise', 'Westminster & Big Ben']),
    imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
  },
  {
    id: '3', slug: 'dubai-city-desert-safari', active: true, order: 3,
    name: 'Dubai City and Desert Safari',
    location: 'Dubai, UAE',
    duration: '10 hours',
    price: 200,
    currency: 'USD',
    description: 'Glide past the Marina skyline on a private yacht with chilled drinks and unforgettable sunset views over the Gulf.',
    highlights: JSON.stringify(['Burj Khalifa views', 'Desert dune bashing', 'Traditional dinner', 'Private guide']),
    imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80',
  },
  {
    id: '4', slug: 'dublin-private-day-tour', active: true, order: 4,
    name: 'Dublin Private Day Tour',
    location: 'Dublin, Ireland',
    duration: '8 hours',
    price: 275,
    currency: 'EUR',
    description: "Trinity College, the Guinness Storehouse, and Dublin's best pubs — explored at your pace with a local expert guide.",
    highlights: JSON.stringify(['Trinity College', 'Guinness Storehouse', 'Temple Bar district', 'Kilmainham Gaol']),
    imageUrl: 'https://images.unsplash.com/photo-1564959130747-897fb406b9af?w=800&q=80',
  },
  {
    id: '5', slug: 'paris-full-day-tour', active: true, order: 5,
    name: 'Paris Full Day Private Tour',
    location: 'Paris, France',
    duration: '8 hours',
    price: 250,
    currency: 'EUR',
    description: 'Eiffel Tower, Louvre Museum, Notre Dame and a Seine river cruise — the iconic Paris experience.',
    highlights: JSON.stringify(['Eiffel Tower', 'Louvre Museum', 'Notre Dame', 'Seine river cruise']),
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ToursPage() {
  const [tours,   setTours]   = useState<DbTour[]>([])
  const [loading, setLoading] = useState(true)
  const [ready,   setReady]   = useState(false)
  const [heroUrl, setHeroUrl] = useState('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1800&q=80')

  useEffect(() => {
    fetch('/api/media/tours_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setHeroUrl(d.url) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setReady(true)

    // 5-second timeout: if DB hangs, show fallback tours
    const timer = setTimeout(() => {
      setTours(prev => prev.length === 0 ? FALLBACK_TOURS : prev)
      setLoading(false)
    }, 5000)

    fetch('/api/tours?type=tour')
      .then((r) => r.json())
      .then((data) => {
        clearTimeout(timer)
        setTours(Array.isArray(data) && data.length > 0 ? data : FALLBACK_TOURS)
        setLoading(false)
      })
      .catch(() => {
        clearTimeout(timer)
        setTours(FALLBACK_TOURS)
        setLoading(false)
      })

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-walz-off-white">

      {/* ── Hero — fullscreen, static image, gradient bottom-up ─────────────── */}
      <div
        className="relative h-screen min-h-[640px] bg-cover bg-center flex items-end"
        style={{ backgroundImage: `url('${heroUrl}')` }}
      >
        {/* Gradient overlay — bottom up */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/95 via-[#0B1F3A]/30 to-transparent" />

        {/* Hero content — bottom-anchored */}
        <div className="relative container-walz pb-16 lg:pb-24">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-walz-gold/10 border border-walz-gold/30 mb-6 transition-all duration-700 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <MapPin className="w-4 h-4 text-walz-gold" />
            <span className="text-walz-gold text-sm font-semibold tracking-wide">Private Tours</span>
          </div>

          {/* Heading — fades in on load */}
          <h1 className={`font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-walz-white mb-4 leading-tight transition-all duration-700 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            Exclusive<br className="hidden sm:block" /> Private Tours
          </h1>

          {/* Subheading — fades in 0.3s after heading */}
          <p className={`text-white/60 max-w-xl text-base lg:text-lg leading-relaxed transition-all duration-700 delay-300 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            Discover the world&apos;s finest destinations with our expert private guides.
            Every tour is fully personalised to your interests and pace.
          </p>

          {/* Scroll cue */}
          <div className={`mt-10 transition-all duration-700 delay-500 ${ready ? 'opacity-60' : 'opacity-0'}`}>
            <ChevronDown className="w-6 h-6 text-white animate-bounce" />
          </div>
        </div>
      </div>

      {/* ── Tours ────────────────────────────────────────────────────────────── */}
      <div className="container-walz py-12 lg:py-16">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-walz-gold" />
          </div>
        ) : tours.length === 0 ? (
          <div className="text-center py-20 text-walz-muted">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-walz-deep-navy mb-2">Tours coming soon</p>
            <p className="text-sm">Check back shortly or contact us to discuss a private tour.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tours.map((tour, index) => (
              <TourCard key={tour.id} tour={tour} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────────────── */}
      <div className="bg-walz-deep-navy py-12">
        <div className="container-walz text-center">
          <h2 className="font-display text-2xl font-bold text-walz-white mb-3">Want a Custom Tour?</h2>
          <p className="text-walz-muted mb-6 max-w-lg mx-auto text-sm">
            We create fully bespoke multi-day tours and itineraries worldwide.
            Contact us to plan your dream journey.
          </p>
          <a href="mailto:tours@walztravels.com" className="btn-gold inline-flex items-center gap-2 text-sm">
            Contact Our Tour Team
          </a>
        </div>
      </div>

    </div>
  )
}
