'use client'

import { SearchTabs } from '@/components/search/SearchTabs'
import { Shield, Star, Award, Sparkles } from 'lucide-react'

const stats = [
  { icon: Star, value: '15,000+', label: 'Trips Booked' },
  { icon: Shield, value: '98%', label: 'Satisfaction Rate' },
  { icon: Award, value: 'IATA', label: 'Certified Agency' },
]

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=80')",
        }}
      />

      {/* Gradient Overlay - More sophisticated layering */}
      <div className="absolute inset-0 bg-gradient-to-b from-walz-deep-navy/90 via-walz-deep-navy/70 to-walz-deep-navy/95" />
      <div className="absolute inset-0 bg-gradient-to-r from-walz-deep-navy/40 via-transparent to-walz-deep-navy/40" />

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-walz-gold/50 to-transparent" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-walz-gold/5 rounded-full blur-3xl" />
      <div className="absolute bottom-40 right-10 w-96 h-96 bg-walz-gold/5 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 w-full container-walz py-20 flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-walz-gold/10 border border-walz-gold/30 mb-8 backdrop-blur-sm">
          <Sparkles className="w-4 h-4 text-walz-gold" />
          <span className="text-walz-gold text-sm font-medium tracking-wide">
            IATA Certified Luxury Travel Agency
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-display text-center text-walz-white mb-5 leading-[1.1]">
          <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-2">
            Your World,
          </span>
          <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold walz-text-gradient">
            Your Way
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-walz-muted text-center text-lg lg:text-xl max-w-2xl mb-12 leading-relaxed text-pretty">
          Discover the world&apos;s most extraordinary destinations with expertly curated
          flights, hotels, and private tours. Your dream journey starts here.
        </p>

        {/* Search Tabs */}
        <div className="w-full max-w-5xl">
          <SearchTabs />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-8 lg:gap-12 mt-14">
          {stats.map(({ icon: Icon, value, label }, index) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2.5 group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl walz-gold-gradient flex items-center justify-center shadow-gold-glow group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-5 h-5 text-walz-deep-navy" />
                </div>
                <span className="font-display text-3xl font-bold text-walz-white">{value}</span>
              </div>
              <span className="text-walz-muted text-sm tracking-wider uppercase">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Wave - Refined */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
          <path
            d="M0 80V30C180 10 360 0 540 10C720 20 900 40 1080 35C1260 30 1380 20 1440 15V80H0Z"
            fill="#FDFBF7"
          />
        </svg>
      </div>
    </section>
  )
}
