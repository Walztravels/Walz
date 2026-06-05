'use client'

import { useState } from 'react'
import { Plane, Hotel, Map, FileText } from 'lucide-react'
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
  { id: 'tours', label: 'Tours', icon: Map },
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
        {activeTab === 'tours' && (
          <div className="p-6">
            <div className="text-center py-8">
              <Map className="w-12 h-12 text-walz-gold mx-auto mb-4" />
              <h3 className="font-display text-xl text-walz-deep-navy mb-2">Private Tours</h3>
              <p className="text-walz-muted mb-6 max-w-sm mx-auto">
                Discover our hand-crafted private tours in Dublin and London with expert local guides.
              </p>
              <a
                href="/tours"
                className="inline-block btn-gold"
              >
                View All Tours
              </a>
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
