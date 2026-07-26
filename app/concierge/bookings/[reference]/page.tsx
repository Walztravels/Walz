import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import BookingStatus from './BookingStatus'

interface Props {
  params:      Promise<{ reference: string }>
  searchParams: Promise<{ paid?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params
  return {
    title:       `Booking ${reference} — Walz Concierge`,
    description: 'Check your Walz Concierge booking status and download your voucher.',
  }
}

export default async function BookingPage({ params, searchParams }: Props) {
  const { reference } = await params
  const { paid }      = await searchParams

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* Back */}
      <div className="px-6 pt-8">
        <Link
          href="/concierge/airport-services"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs font-medium transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Airport Services
        </Link>
      </div>

      <section className="relative px-6 pt-10 pb-8 text-center overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,168,76,0.10) 0%, transparent 70%)' }}
        />
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">Walz Concierge</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {paid === '1' ? 'Payment received — thank you.' : 'Your booking'}
        </h1>
        {paid === '1' && (
          <p className="text-white/50 text-sm mt-3 max-w-sm mx-auto">
            We are confirming your booking now. Your voucher will appear on this page once ready.
          </p>
        )}
      </section>

      <section className="px-6 pb-24">
        <BookingStatus reference={reference} initialPaid={paid === '1'} />
      </section>
    </main>
  )
}
