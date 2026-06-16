'use client'

import { useState } from 'react'
import { Plane, Hotel, Sparkles, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FlightSearchForm } from './FlightSearchForm'
import { HotelSearchForm } from './HotelSearchForm'
import type { FlightResult, HotelResult } from '@/types/booking'

interface SearchTabsProps {
  onFlightResults?: (results: FlightResult[]) => void
  onHotelResults?: (results: HotelResult[]) => void
  compact?: boolean
}

const tabs = [
  { id: 'flights', label: 'Flights', icon: Plane },
  { id: 'hotels', label: 'Hotels', icon: Hotel },
  { id: 'experiences', label: 'Experiences', icon: Sparkles },
  { id: 'visa', label: 'Visa', icon: FileText },
]

export function SearchTabs({ onFlightResults, onHotelResults, compact = false }: SearchTabsProps) {
  const [activeTab, setActiveTab] = useState('flights')

  return (
    <div className={cn('w-full', compact ? '' : 'max-w-5xl mx-auto')}>
      {/* Tab buttons */}
      <div className="flex rounded-t-2xl overflow-hidden">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all duration-200',
              activeTab === id
                ? 'bg-white text-walz-deep-navy'
                : 'bg-walz-deep-navy/60 text-walz-muted hover:bg-walz-deep-navy/80 hover:text-walz-white',
              compact ? 'px-3' : 'px-4'
            )}
          >
            <Icon className={cn('flex-shrink-0', compact ? 'w-4 h-4' : 'w-4 h-4')} />
            <span className={cn('hidden', compact ? 'sm:inline' : 'sm:inline')}>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-b-2xl shadow-luxury">
        {activeTab === 'flights' && (
          <FlightSearchForm onResults={onFlightResults} />
        )}
        {activeTab === 'hotels' && (
          <HotelSearchForm onResults={onHotelResults} />
        )}
        {activeTab === 'experiences' && (
          <div className="p-5">
            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-4">
              What kind of experience are you looking for?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  href:   'https://www.walztravels.com/activities',
                  emoji:  '🎭',
                  label:  'Activities',
                  desc:   'Tickets, day trips & curated experiences in 100+ destinations',
                  accent: 'hover:border-amber-400/60 hover:bg-amber-50/40',
                  tag:    'Powered by Hotelbeds',
                },
                {
                  href:   'https://www.walztravels.com/tours',
                  emoji:  '🗺️',
                  label:  'Tours',
                  desc:   'Exclusive private guided tours with expert local guides',
                  accent: 'hover:border-emerald-400/60 hover:bg-emerald-50/40',
                  tag:    'Private & Group',
                },
                {
                  href:   'https://www.walztravels.com/packages',
                  emoji:  '📦',
                  label:  'Packages',
                  desc:   'All-inclusive group packages, bundles & curated getaways',
                  accent: 'hover:border-blue-400/60 hover:bg-blue-50/40',
                  tag:    'Best Value',
                },
              ].map(({ href, emoji, label, desc, accent, tag }) => (
                <a
                  key={href}
                  href={href}
                  className={`group flex flex-col gap-2 p-4 rounded-xl border border-gray-200
                    transition-all duration-200 ${accent}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{emoji}</span>
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100
                      px-2 py-0.5 rounded-full">{tag}</span>
                  </div>
                  <p className="font-bold text-[#0B1F3A] text-sm">{label}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
                  <p className="text-[#C9A84C] text-xs font-semibold mt-1">
                    Explore {label} →
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'visa' && (
          <div className="p-6">
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-walz-gold mx-auto mb-4" />
              <h3 className="font-display text-xl text-walz-deep-navy mb-2">Visa Assistance</h3>
              <p className="text-walz-muted mb-6 max-w-sm mx-auto">
                Expert visa guidance for over 50 countries. Let our specialists handle your application.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {['UAE', 'USA', 'Canada', 'Schengen', 'Australia', 'China'].map((country) => (
                  <a
                    key={country}
                    href={`/visa/${country.toLowerCase()}`}
                    className="px-3 py-1.5 rounded-full border border-walz-border text-walz-slate hover:bg-walz-deep-navy hover:text-walz-gold hover:border-walz-deep-navy transition-colors text-sm"
                  >
                    {country}
                  </a>
                ))}
              </div>
              <a
                href="/visa"
                className="inline-block btn-gold"
              >
                All Visa Services
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
