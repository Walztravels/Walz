'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

interface Props {
  photos: string[]
  alt: string
  interval?: number
}

export function PromoPhotoSlider({ photos, alt, interval = 4000 }: Props) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  const valid = photos.filter(Boolean)
  const count = valid.length

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % count)
  }, [count])

  useEffect(() => {
    if (count <= 1 || paused) return
    const t = setInterval(next, interval)
    return () => clearInterval(t)
  }, [count, paused, next, interval])

  if (count === 0) {
    return <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F3A] to-[#1a3358]" />
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {valid.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0'}`}
        >
          <Image
            src={src}
            alt={`${alt} ${i + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={i === 0}
          />
        </div>
      ))}

      {count > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {valid.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setCurrent(i) }}
              className={`rounded-full transition-all ${i === current ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
