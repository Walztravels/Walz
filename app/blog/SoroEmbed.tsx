'use client'

import Script from 'next/script'
import { useState, useEffect } from 'react'

const SORO_SRC = 'https://app.trysoro.com/api/embed/e527122f-370b-455e-8cb1-6eb259425df9'

const TRAVEL_IMAGES = [
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1578895101408-1a36b834405b?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&fit=crop',
  'https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?w=800&q=80&fit=crop',
]

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm animate-pulse">
          <div className="h-[220px] bg-gray-200" />
          <div className="p-5 space-y-3">
            <div className="h-3 bg-gray-200 rounded w-20" />
            <div className="h-5 bg-gray-200 rounded" />
            <div className="h-5 bg-gray-200 rounded w-4/5" />
            <div className="h-4 bg-gray-200 rounded w-full mt-2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SoroEmbed() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (status !== 'ready') return
    let imgIdx = 0

    function fixImages() {
      const el = document.getElementById('soro-blog')
      if (!el) return
      el.querySelectorAll<HTMLImageElement>('img').forEach(img => {
        // Apply size styles to every image
        img.style.width = '100%'
        img.style.height = '220px'
        img.style.objectFit = 'cover'
        img.style.objectPosition = 'center'
        img.style.display = 'block'

        // Replace broken or Soro-bucket images immediately
        if (
          img.naturalWidth === 0 ||
          img.src.includes('afocirmbqdxnkyescnev') ||
          img.src.includes('supabase.co')
        ) {
          img.src = TRAVEL_IMAGES[imgIdx % TRAVEL_IMAGES.length]
          imgIdx++
        }

        // Catch images that break after load
        img.addEventListener('error', () => {
          img.src = TRAVEL_IMAGES[imgIdx % TRAVEL_IMAGES.length]
          imgIdx++
        }, { once: true })
      })
    }

    // Run at multiple intervals to catch lazy-loaded images
    const timers = [500, 1000, 2000, 4000].map(ms => setTimeout(fixImages, ms))

    // Also watch for any new DOM nodes Soro injects
    const el = document.getElementById('soro-blog')
    let obs: MutationObserver | null = null
    if (el) {
      obs = new MutationObserver(fixImages)
      obs.observe(el, { childList: true, subtree: true })
    }

    return () => {
      timers.forEach(clearTimeout)
      obs?.disconnect()
    }
  }, [status])

  return (
    <>
      {status === 'loading' && <Skeleton />}
      {status === 'error' && (
        <p className="text-center text-gray-400 py-12 text-sm">
          Articles loading — check back shortly.
        </p>
      )}

      <div id="soro-blog" className={status !== 'ready' ? 'sr-only' : ''} />

      <Script
        src={SORO_SRC}
        strategy="afterInteractive"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
    </>
  )
}
