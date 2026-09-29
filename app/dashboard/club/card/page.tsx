// app/dashboard/club/card/page.tsx — Digital Jade Card (membership credential).
//
// THIS IS NOT A PAYMENT CARD: no Visa/Mastercard logo, no card number, no
// CVV, no stored balance. It shows: brand, customer name, tier badge,
// public member ID, member-since date, and a QR that resolves to the
// minimal public verification view (lib/jade-club/verify.ts) — never
// account data, never a login.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Sparkles } from 'lucide-react'
import QRCode from 'qrcode'
import { getJadeClubCardView } from '@/lib/jade-club/membership'
import { JADE_CLUB_TIER_LABELS } from '@/lib/jade-club/types'
import { RotateQrButton } from './RotateQrButton'

export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

export default async function DigitalJadeCardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/club/card')

  const card = await getJadeClubCardView(session.user.id)
  const verifyUrl = `${SITE}/club/verify/${card.verificationToken}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 260, margin: 1, errorCorrectionLevel: 'M' })

  const displayName = session.user.name || session.user.email?.split('@')[0] || 'Member'

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-lg">
        <Link href="/dashboard/club"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Jade Travel Club
        </Link>

        {/* ── Digital Card ─────────────────────────────── */}
        <div className="relative rounded-3xl overflow-hidden border border-[#C9A84C]/25 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #060e1c 0%, #0B1F3A 55%, #08331f 130%)' }}>
          <div className="p-7">
            <div className="flex items-start justify-between mb-8">
              <div>
                <p className="text-[#C9A84C] font-bold text-xl tracking-wide">JADE</p>
                <p className="text-white/70 text-[11px] uppercase tracking-[0.2em]">Travel Club</p>
                <p className="text-white/30 text-[10px] mt-0.5">by Walz Travels</p>
              </div>
              <Sparkles className="w-6 h-6 text-[#C9A84C]/70" />
            </div>

            <p className="text-white font-bold text-lg mb-1 truncate">{displayName}</p>
            <span className="inline-block text-[11px] font-bold uppercase tracking-wide text-[#0B1F3A] bg-[#C9A84C] px-2.5 py-0.5 rounded-full mb-6">
              {JADE_CLUB_TIER_LABELS[card.tier]}
            </span>

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-widest">Member ID</p>
                <p className="text-white font-mono font-semibold text-sm">{card.memberCode}</p>
                <p className="text-white/30 text-[10px] uppercase tracking-widest mt-3">Member Since</p>
                <p className="text-white/70 text-xs">{format(new Date(card.memberSince), 'MMMM yyyy')}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Jade Card verification QR code" className="w-24 h-24 rounded-lg bg-white p-1.5 flex-shrink-0" />
            </div>
          </div>
        </div>

        <p className="text-white/30 text-xs text-center mt-4">
          This card is a Jade Travel Club membership credential — it is not a payment card and holds no monetary value.
        </p>

        {/* ── Actions ──────────────────────────────────── */}
        <div className="mt-6 space-y-3">
          <RotateQrButton />
          <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
            className="block text-center w-full px-4 py-2.5 bg-white/8 border border-white/15 text-white text-sm font-semibold rounded-xl hover:bg-white/12 transition-colors">
            Preview public verification page
          </a>
        </div>
      </div>
    </div>
  )
}
