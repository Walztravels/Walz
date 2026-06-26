'use client'

import Script from 'next/script'
import { useState } from 'react'

const SORO_SRC = 'https://app.trysoro.com/api/embed/e527122f-370b-455e-8cb1-6eb259425df9'

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm animate-pulse">
          <div className="h-48 bg-gray-200" />
          <div className="p-5 space-y-3">
            <div className="h-3 bg-gray-200 rounded w-20" />
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded w-4/5" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mt-4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SoroEmbed() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <>
      {status === 'loading' && <Skeleton />}
      {status === 'error' && (
        <p className="text-center text-gray-400 py-12 text-sm">Articles loading — check back shortly.</p>
      )}

      <div id="soro-blog" className={status === 'loading' ? 'hidden' : ''} />

      <Script
        src={SORO_SRC}
        strategy="afterInteractive"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
    </>
  )
}
