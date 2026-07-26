import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import AirportServiceFlow from './AirportServiceFlow'

interface Props { params: Promise<{ type: string }> }

const SERVICE_META: Record<string, { label: string; icon: string; description: string; badge: string }> = {
  'lounge': {
    label:       'Airport Lounge',
    icon:        '🛋️',
    description: 'Access premium airport lounges with dining, showers, quiet seating and fast Wi-Fi.',
    badge:       'Instant booking',
  },
  'meet-greet': {
    label:       'Meet & Greet',
    icon:        '🤝',
    description: 'A personal greeter meets you at the gate and escorts you through fast-track and baggage.',
    badge:       'Instant booking',
  },
  'transfer': {
    label:       'Airport Transfer',
    icon:        '🚗',
    description: 'Private, executive car transfer between airport and any destination — in comfort.',
    badge:       'Instant booking',
  },
  'sleeping-pod': {
    label:       'Sleeping Pods',
    icon:        '😴',
    description: 'Private sleeping cabins for long layovers — rest undisturbed, then board refreshed.',
    badge:       'Instant booking',
  },
  'baggage': {
    label:       'Baggage Delivery',
    icon:        '🧳',
    description: 'Door-to-door baggage collection and delivery — hotel, home or next destination.',
    badge:       'Instant booking',
  },
}

export function generateStaticParams() {
  return Object.keys(SERVICE_META).map(type => ({ type }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params
  const meta = SERVICE_META[type]
  if (!meta) return { title: 'Airport Services — Walz Concierge' }
  return {
    title:       `${meta.label} — Walz Concierge`,
    description: meta.description,
  }
}

export default async function AirportServiceTypePage({ params }: Props) {
  const { type } = await params
  const meta = SERVICE_META[type]
  if (!meta) notFound()

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

      {/* Hero */}
      <section className="relative px-6 pt-12 pb-10 text-center overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 70%)' }}
        />
        <span className="text-5xl mb-5 block">{meta.icon}</span>
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">Walz Concierge</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{meta.label}</h1>
        <p className="text-white/60 text-base max-w-lg mx-auto leading-relaxed mb-6">{meta.description}</p>
        <span className="inline-flex items-center gap-2 bg-white/5 border border-[#C9A84C]/30 text-[#C9A84C] text-xs font-semibold px-4 py-2 rounded-full">
          <CheckCircle className="w-3.5 h-3.5" />
          {meta.badge}
        </span>
      </section>

      {/* Booking flow */}
      <section className="px-6 pb-24">
        <AirportServiceFlow type={type} />
      </section>

      {/* Help footer */}
      <div className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-white/30 text-xs">
          Need help?{' '}
          <a
            href="https://wa.me/12317902336"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors">
            WhatsApp our concierge team
          </a>
          {' '}or ask Jade.
        </p>
      </div>
    </main>
  )
}
