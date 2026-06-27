'use client'

import Script from 'next/script'
import { useState, useEffect } from 'react'

const SORO_SRC = 'https://app.trysoro.com/api/embed/e527122f-370b-455e-8cb1-6eb259425df9'

const TOPIC_IMAGES: Record<string, string[]> = {
  visa: [
    'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80&fit=crop',
  ],
  canada: [
    'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800&q=80&fit=crop',
  ],
  uk: [
    'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80&fit=crop',
  ],
  dubai: [
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5?w=800&q=80&fit=crop',
  ],
  schengen: [
    'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&fit=crop',
  ],
  flight: [
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=800&q=80&fit=crop',
  ],
  solo: [
    'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=800&q=80&fit=crop',
  ],
  hotel: [
    'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80&fit=crop',
  ],
  interview: [
    'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80&fit=crop',
  ],
  refusal: [
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=800&q=80&fit=crop',
  ],
  default: [
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=800&q=80&fit=crop',
    'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&fit=crop',
  ],
}

function getImageForElement(img: HTMLImageElement, idx: number): string {
  const title = (
    img.alt ||
    img.closest('article, li, [class*="card"], [class*="post"]')
      ?.querySelector('h1, h2, h3, h4')
      ?.textContent ||
    ''
  ).toLowerCase()

  for (const [keyword, urls] of Object.entries(TOPIC_IMAGES)) {
    if (keyword !== 'default' && title.includes(keyword)) {
      return urls[idx % urls.length]
    }
  }
  return TOPIC_IMAGES.default[idx % TOPIC_IMAGES.default.length]
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm animate-pulse">
          <div className="h-[200px] bg-gray-200" />
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

    function fixImages() {
      const el = document.getElementById('soro-blog')
      if (!el) return

      el.querySelectorAll<HTMLImageElement>('img').forEach((img, idx) => {
        img.style.width = '100%'
        img.style.height = '200px'
        img.style.objectFit = 'cover'
        img.style.objectPosition = 'center'
        img.style.display = 'block'

        const isBroken =
          img.naturalWidth === 0 ||
          img.src.includes('afocirmbqdxnkyescnev') ||
          img.src.includes('supabase.co') ||
          img.src.includes('trysoro.com') ||
          img.src === ''

        if (isBroken) {
          img.src = getImageForElement(img, idx)
        }

        img.addEventListener('error', () => {
          img.src = TOPIC_IMAGES.default[idx % TOPIC_IMAGES.default.length]
        }, { once: true })
      })
    }

    const timers = [500, 1000, 2000, 4000].map(ms => setTimeout(fixImages, ms))

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
