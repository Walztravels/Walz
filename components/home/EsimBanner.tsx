import Link from 'next/link'
import { Signal, ArrowRight } from 'lucide-react'

export function EsimBanner() {
  return (
    <section className="bg-[#0B1F3A] border-y border-[#C9A84C]/20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/15 border border-[#C9A84C]/30 flex items-center justify-center flex-shrink-0">
              <Signal className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <p className="text-white text-sm">
              <span className="font-bold text-[#C9A84C]">📶 Jade Connect</span>
              {' '}— Stay connected in 150+ countries. No roaming.{' '}
              <span className="text-white/60">Instant eSIM from</span>{' '}
              <span className="font-bold text-white">USD $9.99</span>
            </p>
          </div>
          <Link
            href="/esim"
            className="flex-shrink-0 flex items-center gap-1.5 px-5 py-2 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-colors whitespace-nowrap"
          >
            Get Connected
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
