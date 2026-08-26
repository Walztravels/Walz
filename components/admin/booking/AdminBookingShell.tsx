'use client'
import { ArrowLeft } from 'lucide-react'
import StepIndicator from './StepIndicator'
import SupplierHealth from './SupplierHealth'
import type { BookingProductType } from '@/lib/pricing/booking-price'

const PRODUCT_LABELS: Record<BookingProductType, string> = {
  FLIGHT:    'Flight Booking',
  HOTEL:     'Hotel Booking',
  TRANSFER:  'Transfer Booking',
  ACTIVITY:  'Activity Booking',
  TOUR:      'Tour Booking',
  INSURANCE: 'Insurance',
  ESIM:      'eSIM',
  OTHER:     'Booking',
}

const PRODUCT_SUPPLIERS: Partial<Record<BookingProductType, string[]>> = {
  FLIGHT:    ['DUFFEL'],
  HOTEL:     ['HOTELBEDS_HOTELS'],
  TRANSFER:  ['HOTELBEDS_TRANSFERS'],
  ACTIVITY:  ['VIATOR', 'HOTELBEDS_ACTIVITIES'],
}

interface AdminBookingShellProps {
  productType:   BookingProductType
  steps:         string[]
  currentStep:   number    // 0-indexed
  children:      React.ReactNode
  summary:       React.ReactNode   // BookingSummary goes in sidebar
  searchBar?:    React.ReactNode   // optional full-width top section
  onBack?:       () => void
  onStepClick?:  (index: number) => void
  /** Pass a custom title override */
  title?:        string
  /** Banner to show below search (error/warning/info) */
  banner?:       React.ReactNode
}

export default function AdminBookingShell({
  productType,
  steps,
  currentStep,
  children,
  summary,
  searchBar,
  onBack,
  onStepClick,
  title,
  banner,
}: AdminBookingShellProps) {
  const label    = title ?? PRODUCT_LABELS[productType]
  const suppliers = PRODUCT_SUPPLIERS[productType]

  return (
    <div className="flex flex-col min-h-screen bg-[#061320]">
      {/* ── Top bar: back + title + step indicator ─────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#061320]/95 backdrop-blur border-b border-[#1a2f4a]">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors
                text-sm font-medium flex-shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <div className="flex-shrink-0">
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">{label}</h1>
          </div>

          <div className="flex-1 flex justify-center overflow-x-auto">
            <StepIndicator
              steps={steps}
              current={currentStep}
              onStepClick={onStepClick}
            />
          </div>

          <div className="flex-shrink-0 text-xs text-gray-500 hidden md:block">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>
      </header>

      {/* ── Optional search bar ─────────────────────────────────────────────── */}
      {searchBar && (
        <div className="bg-[#0a1929] border-b border-[#1a2f4a]">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4">
            {searchBar}
          </div>
        </div>
      )}

      {/* ── Banner (error / price change / warning) ─────────────────────────── */}
      {banner && (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 mt-4 w-full">
          {banner}
        </div>
      )}

      {/* ── Main two-column layout ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Left — main content */}
          <div className="min-w-0">
            {children}
          </div>

          {/* Right — booking summary (sticky on desktop) */}
          <div className="xl:sticky xl:top-20 flex flex-col gap-4">
            {summary}
          </div>
        </div>
      </main>

      {/* ── Footer: supplier health ─────────────────────────────────────────── */}
      <footer className="border-t border-[#1a2f4a] bg-[#0a1929]">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3">
          <SupplierHealth
            suppliers={suppliers}
            refreshInterval={5 * 60 * 1000}
          />
        </div>
      </footer>
    </div>
  )
}
