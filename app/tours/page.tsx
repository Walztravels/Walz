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
  const cardRef = useRef<HTMLDivElement>(null)

  // Scroll fade-in — IntersectionObserver, staggered by index
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    el.style.opacity = '0'
    el.style.transform = 'translateY(32px)'
    el.style.transition = `opacity 0.55s ease ${index * 100}ms, transform 0.55s ease ${index * 100}ms`

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])

  let highlights: string[] = []
  try { highlights = JSON.parse(tour.highlights) } catch { highlights = [] }

  const price = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: tour.currency, maximumFractionDigits: 0,
  }).format(tour.price)

  return (
    <>
      {/* group class enables image zoom on card hover */}
      <div
        ref={cardRef}
        id={tour.slug}
        className="group bg-white rounded-2xl border border-walz-border shadow-card overflow-hidden scroll-mt-24"
      >
        {/* Image — overflow-hidden clips the zoom */}
        <div className="relative h-64 lg:h-72 overflow-hidden bg-gray-100">
          {tour.imageUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
              style={{ backgroundImage: `url('${tour.imageUrl}')` }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300">
              <ImageIcon className="w-16 h-16" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-walz-deep-navy/80 via-walz-deep-navy/20 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-white mb-1">{tour.name}</h2>
                <div className="flex items-center gap-2 text-walz-muted text-sm">
                  <MapPin className="w-3.5 h-3.5 text-walz-gold" />
                  {tour.location}
                </div>
              </div>
              <div className="text-right">
                <div className="text-walz-muted text-xs">From</div>
                <div className="text-walz-gold font-bold text-2xl">{price}</div>
                <div className="text-walz-muted text-xs">per person</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-6">
          {/* Meta */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-1.5 text-sm text-walz-muted">
              <Clock className="w-4 h-4 text-walz-gold" />
              <span>{tour.duration}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-walz-muted">
              <Users className="w-4 h-4 text-walz-gold" />
              <span>Private tour</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-walz-muted">
              <Star className="w-4 h-4 text-walz-gold fill-walz-gold" />
              <span>Highly rated</span>
            </div>
          </div>

          <p className="text-walz-muted text-sm leading-relaxed mb-5 line-clamp-3">{tour.description}</p>

          {/* Highlights */}
          {highlights.length > 0 && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-walz-deep-navy mb-3">Tour Highlights</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {highlights.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-walz-gold flex-shrink-0" />
                    <span className="text-sm text-walz-slate">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="flex gap-3 pt-4 border-t border-walz-border">
            <a href={`/tours/book?slug=${tour.slug}`} className="flex-1">
              <Button variant="gold" className="w-full">Book Now</Button>
            </a>
            <Button variant="navy" className="whitespace-nowrap" onClick={() => setIsEnquiryOpen(true)}>
              Enquire
            </Button>
          </div>
        </div>
      </div>

      {isEnquiryOpen && (
        <EnquiryModal tourName={tour.name} onClose={() => setIsEnquiryOpen(false)} />
      )}
    </>
  )
}

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
    fetch('/api/tours')
      .then((r) => r.json())
      .then((data) => { setTours(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
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
      <div className="container-walz py-12 lg:py-16 space-y-8 lg:space-y-12">
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
          // Pass index for staggered IntersectionObserver delay
          tours.map((tour, index) => <TourCard key={tour.id} tour={tour} index={index} />)
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
