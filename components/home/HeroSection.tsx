'use client'

import { SearchTabs } from '@/components/search/SearchTabs'
import { Shield, Star, Award } from 'lucide-react'

const stats = [
  { icon: Star, value: '15,000+', label: 'Trips Booked' },
  { icon: Shield, value: '98%', label: 'Satisfaction Rate' },
  { icon: Award, value: 'IATA', label: 'Certified Agency' },
]

export function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=80')",
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-walz-deep-navy/80 via-walz-deep-navy/60 to-walz-deep-navy/90" />

      {/* Gold accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-walz-gold-gradient" />

      {/* Content */}
      <div className="relative z-10 w-full container-walz py-16 flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-walz-gold/10 border border-walz-gold/30 mb-6 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-walz-gold animate-pulse" />
          <span className="text-walz-gold text-sm font-medium tracking-wide">
            IATA Certified Luxury Travel Agency
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-display text-center text-walz-white mb-4 leading-tight">
          <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold">
            Your World,
          </span>
          <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold walz-text-gradient">
            Your Way
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-walz-muted text-center text-lg lg:text-xl max-w-2xl mb-10 leading-relaxed">
          Discover the world&apos;s most extraordinary destinations with expertly curated
          flights, hotels, and private tours. Your dream journey starts here.
        </p>

        {/* Search Tabs */}
        <div className="w-full max-w-5xl">
          <SearchTabs />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-6 lg:gap-10 mt-12">
          {stats.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg walz-gold-gradient flex items-center justify-center shadow-gold-glow">
                  <Icon className="w-4 h-4 text-walz-deep-navy" />
                </div>
                <span className="font-display text-2xl font-bold text-walz-white">{value}</span>
              </div>
              <span className="text-walz-muted text-sm tracking-wide">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path
            d="M0 60V20C240 0 480 10 720 5C960 0 1200 15 1440 10V60H0Z"
            fill="#F7F4EF"
          />
        </svg>
      </div>
    </section>
  )
}
