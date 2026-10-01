// app/dashboard/club/card/page.tsx — Digital Jade Card (membership credential).
//
// THIS IS NOT A PAYMENT CARD: no Visa/Mastercard logo, no card number, no
// CVV, no stored balance. It shows: brand, customer name, tier badge,
// public member ID, member-since date, authoritative expiry (only when one
// exists), and a QR that resolves to the minimal public verification view
// (lib/jade-club/verify.ts) — never account data, never a login.
//
// Visual direction (Jade CX Polish, presentation-only): premium
// Apple-Wallet / airline-membership credential feel. No fake NFC/wallet
// integration, no fake barcode, no Platinum/Premium terminology, no
// Priority Pass or lounge claims, no benefit not already backed by real
// policy data — only richer treatment of the fields this page already
// authoritatively has.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Gem } from 'lucide-react'
import QRCode from 'qrcode'
import { getJadeClubCardView } from '@/lib/jade-club/membership'
import { JADE_CLUB_TIER_LABELS } from '@/lib/jade-club/types'
import { RotateQrButton } from './RotateQrButton'

export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// A focus-visible ring consistent with the pattern already established in
// PortalJadeChat.tsx — the one interactive-element treatment this page
// previously had none of.
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060e1c]'

export default async function DigitalJadeCardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/club/card')

  const card = await getJadeClubCardView(session.user.id)
  const verifyUrl = `${SITE}/club/verify/${card.verificationToken}`
  // QR mechanism unchanged: same package, same options, same source size,
  // same verification-URL shape, same rotate flow.
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 260, margin: 1, errorCorrectionLevel: 'M' })

  const displayName = session.user.name || session.user.email?.split('@')[0] || 'Member'

  // Decision 2: authoritative-only — render exclusively from the DTO's own
  // expiresAt, never computed/derived in the UI. Jade Free (and any
  // ongoing, non-termed membership) has expiresAt = null and the field is
  // omitted cleanly, not shown empty.
  const validUntil = card.expiresAt ? format(new Date(card.expiresAt), 'MMMM yyyy') : null

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 sm:px-6 lg:px-8 py-8 pb-24">
      <div className="max-w-lg">
        <Link
          href="/dashboard/club"
          className={`flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors w-fit rounded-md ${FOCUS_RING}`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Jade Travel Club
        </Link>

        {/* ── Digital Card ─────────────────────────────────────────────────
            Shell (gradient / gold border / shadow / radius) preserved as-is
            — it already reads as premium. Internals get a deliberate
            typographic hierarchy and rhythm instead of four repeated label
            styles, plus a subtle sheen for depth. ──────────────────────── */}
        <div
          className="relative rounded-3xl overflow-hidden border border-[#C9A84C]/25 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #060e1c 0%, #0B1F3A 55%, #08331f 130%)' }}
        >
          {/* Subtle depth/sheen — pure CSS, no texture asset, no new deps */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 90% at 15% -10%, rgba(201,168,76,0.14) 0%, rgba(201,168,76,0) 55%), radial-gradient(90% 70% at 110% 120%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 60%)',
            }}
          />

          <div className="relative p-7 sm:p-8">
            {/* Brand lockup */}
            <div className="flex items-start justify-between mb-9 sm:mb-10">
              <div>
                <p className="text-[#C9A84C] font-bold text-xl tracking-wide">JADE</p>
                <p className="text-white/75 text-[11px] uppercase tracking-[0.22em] mt-0.5">Travel Club</p>
                <p className="text-white/40 text-[10px] mt-1">by Walz Travels</p>
              </div>
              <Gem className="w-6 h-6 text-[#C9A84C]/80" aria-hidden="true" />
            </div>

            {/* Member identity — the card's primary typographic moment */}
            <p className="font-display text-white text-2xl sm:text-[1.75rem] leading-tight mb-2.5 truncate">
              {displayName}
            </p>
            <span
              className={
                'inline-flex items-center text-[11px] font-bold uppercase tracking-wide text-[#0B1F3A] px-3 py-1 rounded-full mb-7 sm:mb-8 ' +
                (card.tier === 'CLUB_PLUS'
                  ? 'bg-gradient-to-r from-[#E4C878] via-[#C9A84C] to-[#b8943d]'
                  : 'bg-[#C9A84C]')
              }
            >
              {JADE_CLUB_TIER_LABELS[card.tier]}
            </span>

            {/* Credential data + QR */}
            <div className="flex items-end justify-between gap-4">
              <dl className="space-y-3.5">
                <div>
                  <dt className="text-white/45 text-[10px] uppercase tracking-widest">Member ID</dt>
                  <dd className="text-white font-mono font-semibold text-sm tracking-wide mt-0.5">{card.memberCode}</dd>
                </div>
                <div>
                  <dt className="text-white/45 text-[10px] uppercase tracking-widest">Member Since</dt>
                  <dd className="text-white/80 text-xs mt-0.5">{format(new Date(card.memberSince), 'MMMM yyyy')}</dd>
                </div>
                {validUntil && (
                  <div>
                    <dt className="text-white/45 text-[10px] uppercase tracking-widest">Valid Until</dt>
                    <dd className="text-white/80 text-xs mt-0.5">{validUntil}</dd>
                  </div>
                )}
              </dl>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Jade Card verification QR code"
                className="w-24 h-24 rounded-xl bg-white p-1.5 flex-shrink-0 shadow-lg"
              />
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs text-center mt-4 leading-relaxed">
          This card is a Jade Travel Club membership credential — it is not a payment card and holds no monetary value.
        </p>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="mt-6 space-y-3">
          <RotateQrButton />
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`block text-center w-full px-4 py-2.5 bg-white/8 border border-white/15 text-white text-sm font-semibold rounded-xl hover:bg-white/12 transition-colors ${FOCUS_RING}`}
          >
            Preview public verification page
          </a>
        </div>
      </div>
    </div>
  )
}
