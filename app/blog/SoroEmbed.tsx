'use client'

import Script from 'next/script'
import { useState, useEffect } from 'react'

const SORO_SRC = 'https://app.trysoro.com/api/embed/e527122f-370b-455e-8cb1-6eb259425df9'

// keyword → Unsplash photo ID (confirmed unique, distinct topics)
const KEYWORD_IMGS: [string, string][] = [
  ['flight',    'photo-1436491865332-7a61a109cc05'],
  ['airport',   'photo-1526772662000-3f88f10405ff'],
  ['visa',      'photo-1450101499163-c8848c66ca85'],
  ['passport',  'photo-1488646953014-85cb44e25828'],
  ['canada',    'photo-1530521954074-e64f6810b32d'],
  ['toronto',   'photo-1517090504586-fde19ea6066f'],
  ['uk',        'photo-1548013146-72479768bada'],
  ['london',    'photo-1513635269975-59663e0ac1ad'],
  ['dubai',     'photo-1512453979798-5ea266f8880c'],
  ['schengen',  'photo-1499856871958-5b9627545d1a'],
  ['paris',     'photo-1431274172761-fca41d930114'],
  ['europe',    'photo-1515859005217-8a1f08870f59'],
  ['solo',      'photo-1501426026826-31c667bdf23d'],
  ['hotel',     'photo-1571003123894-1f0594d2b5d9'],
  ['refusal',   'photo-1450101499163-c8848c66ca85'],
  ['interview', 'photo-1521737711867-e3b97375f902'],
  ['booking',   'photo-1503220317375-aaad61436b1b'],
  ['luxury',    'photo-1455587734955-081b22074882'],
  ['travel',    'photo-1488646953014-85cb44e25828'],
]

const FALLBACK_POOL = [
  'photo-1436491865332-7a61a109cc05',
  'photo-1503220317375-aaad61436b1b',
  'photo-1548013146-72479768bada',
  'photo-1530521954074-e64f6810b32d',
  'photo-1512453979798-5ea266f8880c',
  'photo-1499856871958-5b9627545d1a',
  'photo-1526772662000-3f88f10405ff',
  'photo-1501426026826-31c667bdf23d',
  'photo-1450101499163-c8848c66ca85',
  'photo-1571003123894-1f0594d2b5d9',
  'photo-1515859005217-8a1f08870f59',
  'photo-1521737711867-e3b97375f902',
]

function unsplash(id: string) {
  return `https://images.unsplash.com/${id}?w=800&q=80&fit=crop&auto=format`
}

function getImageForTitle(title: string, idx: number): string {
  const t = title.toLowerCase()
  for (const [kw, id] of KEYWORD_IMGS) {
    if (t.includes(kw)) return unsplash(id)
  }
  return unsplash(FALLBACK_POOL[idx % FALLBACK_POOL.length])
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm animate-pulse">
          <div className="h-[210px] bg-gray-200" />
          <div className="p-5 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-4/5" />
            <div className="h-4 bg-gray-200 rounded w-3/5" />
            <div className="h-3 bg-gray-100 rounded w-full mt-2" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-20 mt-2" />
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
      // Target exact Soro class names confirmed from live DOM
      const cards = document.querySelectorAll<HTMLElement>('.soro-blog-card')
      if (!cards.length) return

      cards.forEach((card, idx) => {
        const img   = card.querySelector<HTMLImageElement>('img')
        const title = card.querySelector('.soro-blog-card-title')?.textContent ?? ''

        if (!img) return

        const isBroken =
          img.naturalWidth === 0 ||
          img.src.includes('supabase.co') ||
          img.src.includes('trysoro.com') ||
          img.src === ''

        if (isBroken) {
          img.src = getImageForTitle(title, idx)
          img.onerror = () => {
            img.src = unsplash(FALLBACK_POOL[idx % FALLBACK_POOL.length])
            img.onerror = null
          }
        }
      })
    }

    const timers = [300, 800, 1500, 2500, 4000].map(ms => setTimeout(fixImages, ms))

    const root = document.getElementById('soro-blog')
    let obs: MutationObserver | null = null
    if (root) {
      obs = new MutationObserver(fixImages)
      obs.observe(root, { childList: true, subtree: true })
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

      {/* w-full ensures .soro-blog inside can stretch to full container width */}
      <div id="soro-blog" className={status !== 'ready' ? 'sr-only' : 'w-full'} />

      <Script
        src={SORO_SRC}
        strategy="afterInteractive"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
    </>
  )
}
