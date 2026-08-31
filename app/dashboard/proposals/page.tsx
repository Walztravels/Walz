// app/dashboard/proposals/page.tsx — Release 6.2: Full itinerary proposals list

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Globe, AlertCircle, Sparkles } from 'lucide-react'
import prisma from '@/lib/db'
import { proposalStatusLabel, proposalStatusColor, proposalNeedsAction } from '@/lib/portal/status-normalizers'

export const dynamic = 'force-dynamic'

export default async function ProposalsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/proposals')

  const proposals = await prisma.itinerary.findMany({
    where: {
      userId: session.user.id,
      status: { not: 'draft' },
    },
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      status: true,
      destination: true,
      startDate: true,
      endDate: true,
      totalPrice: true,
      currency: true,
      sentAt: true,
      approvedAt: true,
      numberOfTravellers: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const pendingCount = proposals.filter(p => proposalNeedsAction(p.status)).length

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-3xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-5 h-5 text-[#C9A84C]" />
          <h1 className="text-white font-bold text-2xl">My Itineraries</h1>
          {proposals.length > 0 && (
            <span className="text-xs bg-[#C9A84C] text-[#0B1F3A] px-2 py-0.5 rounded-full font-bold">
              {proposals.length}
            </span>
          )}
        </div>
        {pendingCount > 0 && (
          <p className="text-amber-400 text-sm mb-6">
            {pendingCount} itinerar{pendingCount === 1 ? 'y' : 'ies'} awaiting your approval
          </p>
        )}
        {pendingCount === 0 && proposals.length > 0 && (
          <p className="text-white/40 text-sm mb-6">Your travel itineraries from Walz Travels</p>
        )}

        {proposals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">✈️</p>
            <h3 className="text-white font-semibold text-base mb-2">No itineraries yet</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto mb-6">
              When our team prepares a travel itinerary for you, it will appear here for your review and approval.
            </p>
            <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
              Contact us to get started
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <Link key={p.id} href={`/itinerary/${p.referenceNumber}`}
                className="block bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 hover:border-[#C9A84C]/30 transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${proposalStatusColor(p.status)}`}>
                        {proposalStatusLabel(p.status)}
                      </span>
                      <span className="text-xs text-white/30 font-mono">{p.referenceNumber}</span>
                    </div>
                    <h3 className="text-white font-bold text-base mb-1 group-hover:text-[#C9A84C] transition-colors leading-tight">
                      {p.title}
                    </h3>
                    <p className="text-white/50 text-sm flex items-center gap-1.5 flex-wrap">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{p.destination}</span>
                      {p.startDate && <span>· {format(new Date(p.startDate), 'MMM yyyy')}</span>}
                      {p.numberOfTravellers > 1 && <span>· {p.numberOfTravellers} travellers</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {p.totalPrice != null && (
                      <p className="text-[#C9A84C] font-bold text-base">
                        {p.currency} {p.totalPrice.toLocaleString()}
                      </p>
                    )}
                    <p className="text-white/30 text-xs mt-1">{format(new Date(p.updatedAt), 'd MMM yyyy')}</p>
                  </div>
                </div>

                {proposalNeedsAction(p.status) && (
                  <div className="mt-4 flex items-center justify-between gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="flex items-center gap-2 text-xs text-amber-400 font-medium">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Your approval is needed
                    </span>
                    <span className="text-xs text-amber-300 font-semibold">Tap to review →</span>
                  </div>
                )}

                {p.approvedAt && (
                  <p className="mt-3 text-xs text-green-400/70">
                    Approved {format(new Date(p.approvedAt), 'd MMM yyyy')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Ask Jade CTA */}
        <Link href="/dashboard/jade"
          className="mt-6 flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#C9A84C]/10 to-[#C9A84C]/5 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Ask Jade about your itineraries</p>
            <p className="text-white/40 text-xs">Understand what&apos;s included, what&apos;s pending, and what to do next</p>
          </div>
          <span className="text-[#C9A84C]/60 group-hover:text-[#C9A84C] transition-colors text-sm">→</span>
        </Link>
      </div>
    </div>
  )
}
