'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Clock, DollarSign, ArrowLeft, ArrowRight,
  X, ChevronLeft, ChevronRight, MessageCircle, CheckCircle,
} from 'lucide-react'

interface Tour {
  id: string
  name: string
  slug: string
  description: string
  highlights: string          // JSON string
  location: string
  duration: string
  price: number
  currency: string
  photos: string[]
  imageUrl: string | null
  active: boolean
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price)
}

function getCover(tour: Tour): string {
  return tour.photos?.[0] ?? tour.imageUrl ?? ''
}

function parseHighlights(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return raw ? raw.split('\n').filter(Boolean) : []
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: string[]
  index: number
  onClose: () => void
  onNav: (i: number) => void
}

function Lightbox({ photos, index, onClose, onNav }: LightboxProps) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight') onNav((index + 1) % photos.length)
    if (e.key === 'ArrowLeft') onNav((index - 1 + photos.length) % photos.length)
  }, [index, photos.length, onClose, onNav])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={onClose}>
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        {index + 1} / {photos.length}
      </div>

      {/* Prev */}
      {photos.length > 1 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center z-10 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNav((index - 1 + photos.length) % photos.length) }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <div className="max-w-5xl max-h-[80vh] px-16" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[index]}
          alt={`Photo ${index + 1}`}
          className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
        />
      </div>

      {/* Next */}
      {photos.length > 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center z-10 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNav((index + 1) % photos.length) }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={url + i}
              onClick={(e) => { e.stopPropagation(); onNav(i) }}
              className={`flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === index ? 'border-[#C9A84C]' : 'border-white/20 hover:border-white/60'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page content ──────────────────────────────────────────────────────────

function TourDetailContent() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : Array.isArray(params.slug) ? params.slug[0] : ''

  const [tour, setTour] = useState<Tour | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ready, setReady] = useState(false)

  // Gallery state
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/tours/${slug}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then((data: Tour | null) => {
        if (data) setTour(data)
        setLoading(false)
        setTimeout(() => setReady(true), 50)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-walz-off-white">
        <div className="w-10 h-10 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !tour) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-walz-off-white gap-4">
        <h1 className="font-display text-3xl font-bold text-[#0B1F3A]">Tour Not Found</h1>
        <p className="text-gray-500">This tour may no longer be available.</p>
        <Link href="/tours" className="btn-gold px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Tours
        </Link>
      </div>
    )
  }

  const photos = tour.photos?.length ? tour.photos : (tour.imageUrl ? [tour.imageUrl] : [])
  const highlights = parseHighlights(tour.highlights)
  const whatsappMessage = encodeURIComponent(`Hi Jade, I'm interested in the ${tour.name} tour (${formatPrice(tour.price, tour.currency)}). Can you help me book?`)

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* ── Hero gallery ────────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <div className="relative w-full overflow-hidden bg-[#0B1F3A]" style={{ height: 'min(70vh, 600px)' }}>
          {/* Hero image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[galleryIndex]}
            alt={tour.name}
            className={`w-full h-full object-cover transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/80 via-transparent to-[#0B1F3A]/20" />

          {/* Back link */}
          <div className="absolute top-6 left-6">
            <Link
              href="/tours"
              className="flex items-center gap-2 bg-black/40 hover:bg-black/60 text-white text-sm px-4 py-2 rounded-xl backdrop-blur-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> All Tours
            </Link>
          </div>

          {/* Hero arrows */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setGalleryIndex((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setGalleryIndex((i) => (i + 1) % photos.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Hero title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
            <div
              className={`transition-all duration-700 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
              <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-2">
                {tour.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#C9A84C]" /> {tour.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#C9A84C]" /> {tour.duration}
                </span>
                <span className="flex items-center gap-1.5 font-bold text-[#C9A84C] text-base">
                  <DollarSign className="w-4 h-4" /> From {formatPrice(tour.price, tour.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Photo counter */}
          {photos.length > 1 && (
            <div className="absolute top-6 right-6 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
              {galleryIndex + 1} / {photos.length}
            </div>
          )}
        </div>
      )}

      {/* ── Thumbnail strip ──────────────────────────────────────────────── */}
      {photos.length > 1 && (
        <div className="bg-[#0B1F3A] px-4 py-3">
          <div className="container-walz flex gap-2 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <button
                key={url + i}
                onClick={() => {
                  setGalleryIndex(i)
                  setLightboxIndex(i)
                }}
                className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === galleryIndex ? 'border-[#C9A84C]' : 'border-white/20 hover:border-white/60'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {/* View all photos */}
            <button
              onClick={() => setLightboxIndex(galleryIndex)}
              className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 border-white/20 hover:border-[#C9A84C] bg-white/10 text-white text-xs flex items-center justify-center transition-all"
            >
              View all
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="container-walz py-10 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left — description + highlights */}
          <div className="lg:col-span-2">
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-4">About This Tour</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-line mb-8">{tour.description}</p>

            {highlights.length > 0 && (
              <div>
                <h3 className="font-display text-xl font-bold text-[#0B1F3A] mb-4">What&apos;s Included</h3>
                <ul className="space-y-3">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#C9A84C] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right — booking card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sticky top-6">
              <div className="mb-5">
                <div className="text-sm text-gray-500 mb-1">From</div>
                <div className="text-4xl font-bold text-[#C9A84C]">
                  {formatPrice(tour.price, tour.currency)}
                </div>
                <div className="text-sm text-gray-500 mt-1">per person · {tour.duration}</div>
              </div>

              <div className="space-y-3 mb-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                  {tour.location}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                  {tour.duration}
                </div>
              </div>

              {/* WhatsApp CTA */}
              <a
                href={`https://wa.me/447398753797?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold py-3 rounded-xl text-sm transition-colors mb-3"
              >
                <MessageCircle className="w-4 h-4" />
                Book via WhatsApp
              </a>

              <Link
                href="/portal/application"
                className="flex items-center justify-center gap-2 w-full border-2 border-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-[#0B1F3A] font-bold py-3 rounded-xl text-sm transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                Enquire Online
              </Link>

              <p className="text-xs text-gray-400 text-center mt-4">
                Free consultation · No booking fee · 24/7 support
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lightbox ────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && photos.length > 0 && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={(i) => { setLightboxIndex(i); setGalleryIndex(i) }}
        />
      )}
    </div>
  )
}

export default function TourDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-walz-off-white">
        <div className="w-10 h-10 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TourDetailContent />
    </Suspense>
  )
}
