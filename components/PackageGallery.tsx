'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

interface PackageGalleryProps {
  images: string[]
  title: string
}

export function PackageGallery({ images, title }: PackageGalleryProps) {
  const safe =
    images.length > 0
      ? images
      : ['https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=85']

  const [current, setCurrent] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPausedRef = useRef(false)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const goTo = useCallback(
    (index: number) => {
      setIsVisible(false)
      setTimeout(() => {
        setCurrent((index + safe.length) % safe.length)
        setIsVisible(true)
      }, 350)
    },
    [safe.length],
  )

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (!isPausedRef.current) {
        setCurrent((c) => {
          const next = (c + 1) % safe.length
          setIsVisible(false)
          setTimeout(() => {
            setCurrent(next)
            setIsVisible(true)
          }, 350)
          return c
        })
      }
    }, 4000)
  }, [safe.length])

  useEffect(() => {
    if (safe.length > 1) startInterval()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startInterval, safe.length])

  const handleMouseEnter = () => {
    isPausedRef.current = true
  }

  const handleMouseLeave = () => {
    isPausedRef.current = false
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX
    const delta = touchStartX.current - touchEndX.current
    if (Math.abs(delta) > 50) {
      if (delta > 0) {
        next()
      } else {
        prev()
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div
        className="relative aspect-video rounded-2xl overflow-hidden bg-[#0B1F3A] select-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={safe[current]}
          alt={`${title} — photo ${current + 1}`}
          fill
          priority={current === 0}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 800px"
          className="object-cover"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 700ms ease',
          }}
        />

        {/* Dark gradient bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

        {/* Image counter */}
        {safe.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 text-[#C9A84C] text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm">
            {current + 1} / {safe.length}
          </div>
        )}

        {/* Prev / Next arrows */}
        {safe.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Desktop: thumbnail strip */}
      {safe.length > 1 && (
        <div className="hidden md:flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {safe.slice(0, 10).map((src, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`View photo ${i + 1}`}
              className="relative flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden cursor-pointer transition-all"
              style={{
                outline: i === current ? '2px solid #C9A84C' : '2px solid transparent',
                outlineOffset: '1px',
                opacity: i === current ? 1 : 0.6,
              }}
            >
              <Image
                src={src}
                alt={`${title} thumbnail ${i + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Mobile: dot indicators */}
      {safe.length > 1 && (
        <div className="flex md:hidden justify-center gap-1.5">
          {safe.slice(0, 10).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              className="rounded-full transition-all cursor-pointer"
              style={{
                width: i === current ? '20px' : '6px',
                height: '6px',
                backgroundColor: i === current ? '#C9A84C' : '#CBD5E1',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
