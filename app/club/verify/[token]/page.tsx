// app/club/verify/[token]/page.tsx — PUBLIC Jade Card verification page.
//
// What a QR scan opens. No authentication, no session/cookie is created
// here, and no account data beyond the minimal public view is ever
// rendered — see lib/jade-club/verify.ts for exactly what that is.

import { ShieldCheck, ShieldAlert, Gem } from 'lucide-react'
import { verifyJadeClubToken } from '@/lib/jade-club/verify'
import { privateMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

// Never indexed — this is a per-card verification surface, not content.
export const metadata = privateMetadata('Jade Card Verification', 'Verify a Jade Travel Club membership card.')

export default async function VerifyJadeCardPage({ params }: { params: { token: string } }) {
  const result = await verifyJadeClubToken(params.token)

  return (
    <div className="min-h-screen bg-[#060e1c] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Gem className="w-5 h-5 text-[#C9A84C]" />
          <p className="text-[#C9A84C] font-bold tracking-widest text-sm uppercase">Jade Travel Club</p>
        </div>

        {result.ok ? (
          <div className="bg-[#0B1F3A] rounded-2xl border border-green-500/25 p-6 text-center">
            <ShieldCheck className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-green-400 font-bold text-sm uppercase tracking-wide mb-4">Verified Membership</p>
            <dl className="space-y-3 text-left">
              <Row label="Membership" value={result.membership.statusLabel} />
              <Row label="Tier" value={result.membership.tierLabel} />
              <Row label="Member" value={result.membership.maskedMemberName} />
              <Row label="Member Since" value={result.membership.memberSince} />
              <Row label="Valid Through" value={result.membership.validThrough ?? 'Ongoing'} />
            </dl>
          </div>
        ) : (
          <div className="bg-[#0B1F3A] rounded-2xl border border-red-500/25 p-6 text-center">
            <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-bold text-sm uppercase tracking-wide">Card Could Not Be Verified</p>
            <p className="text-white/40 text-xs mt-2">This code may be invalid, expired, or has been replaced with a newer one.</p>
          </div>
        )}

        <p className="text-white/20 text-[11px] text-center mt-6">
          This page shows only membership status — no account, booking, or travel details are ever displayed here.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/30 text-[10px] uppercase tracking-widest">{label}</dt>
      <dd className="text-white font-semibold text-sm">{value}</dd>
    </div>
  )
}
