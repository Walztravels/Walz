// app/dashboard/travellers/page.tsx — Release 6.4: Traveller list RSC

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Plus, ChevronRight, Shield, AlertCircle } from 'lucide-react'
import prisma from '@/lib/db'
import { toTravellerDTO } from '@/lib/portal/traveller-dto'
import { getPrimaryTravellerCompleteness, getTravellerProfileCompleteness } from '@/lib/portal/traveller-completeness'
import { getPassportExpiryStatus } from '@/lib/portal/traveller-dto'

export const dynamic = 'force-dynamic'

function completenessColor(pct: number) {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function passportExpiryColor(status: string) {
  if (status === 'VALID') return 'text-green-400'
  if (status === 'EXPIRES_SOON') return 'text-yellow-400'
  if (status === 'EXPIRED') return 'text-red-400'
  return 'text-white/30'
}

function passportExpiryLabel(status: string, expiryDate: string | null) {
  if (status === 'VALID' && expiryDate) {
    const d = new Date(expiryDate)
    return `Passport valid until ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
  }
  if (status === 'EXPIRES_SOON') return 'Passport may require review soon'
  if (status === 'EXPIRED') return 'Passport expired'
  if (status === 'NOT_PROVIDED') return 'Passport not provided'
  return ''
}

export default async function TravellersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/travellers')

  const [vault, savedTravellers] = await Promise.all([
    prisma.passportVault.findUnique({
      where: { userId: session.user.id },
      select: {
        givenNames: true, surname: true, dateOfBirth: true,
        nationality: true, sex: true, passportNumber: true, expiryDate: true,
        phone: true, homeAddress: true, isSetupComplete: true,
      },
    }),
    prisma.travellerProfile.findMany({
      where: { userId: session.user.id, isDeleted: false },
      orderBy: [{ relationship: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const user = { phone: (session.user as Record<string, unknown>)?.phone as string | null ?? null }
  const primaryCompleteness = getPrimaryTravellerCompleteness(vault, user)
  const primaryPassportStatus = getPassportExpiryStatus(vault?.expiryDate ?? null)

  const primaryName = vault?.givenNames && vault?.surname
    ? `${vault.givenNames} ${vault.surname}`.trim()
    : (session.user?.name ?? session.user?.email ?? 'You')

  const primaryInitials = (primaryName[0] ?? 'Y').toUpperCase()

  const savedDTOs = savedTravellers.map(t => ({
    dto: toTravellerDTO(t),
    completeness: getTravellerProfileCompleteness({
      firstName: t.firstName,
      lastName: t.lastName,
      dateOfBirth: t.dateOfBirth,
      nationality: t.nationality,
      gender: t.gender,
      phone: t.phone,
      email: t.email,
      passportMeta: t.passportMeta && typeof t.passportMeta === 'object'
        ? {
            maskedNumber: (t.passportMeta as Record<string, unknown>).maskedNumber as string ?? null,
            expiryDate: (t.passportMeta as Record<string, unknown>).expiryDate as string ?? null,
          }
        : null,
    }),
  }))

  const actionCount = (primaryCompleteness.percent < 50 ? 1 : 0) +
    savedDTOs.filter(x => x.completeness.percent < 50).length

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-2xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-[#C9A84C]" />
            <h1 className="text-white font-bold text-2xl">Travellers</h1>
          </div>
          <Link href="/dashboard/travellers/new"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C]/20 transition-colors">
            <Plus className="w-4 h-4" />
            Add traveller
          </Link>
        </div>

        {actionCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-amber-400 text-sm">
              {actionCount} traveller profile{actionCount > 1 ? 's' : ''} need{actionCount === 1 ? 's' : ''} attention
            </p>
          </div>
        )}

        {/* Primary traveller */}
        <div className="mb-8">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Me</h2>
          <Link href="/portal/passport-vault"
            className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B1F3A] border border-white/8 hover:border-[#C9A84C]/30 transition-all group">
            <div className="w-12 h-12 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-lg flex-shrink-0">
              {primaryInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm group-hover:text-[#C9A84C] transition-colors">{primaryName}</p>
              <p className="text-white/40 text-xs mt-0.5">Primary traveller</p>
              {/* Completeness bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${completenessColor(primaryCompleteness.percent)}`}
                    style={{ width: `${primaryCompleteness.percent}%` }}
                  />
                </div>
                <span className="text-white/30 text-[10px] w-8 text-right">{primaryCompleteness.percent}%</span>
              </div>
              {vault?.expiryDate && (
                <p className={`text-xs mt-1 ${passportExpiryColor(primaryPassportStatus)}`}>
                  {passportExpiryLabel(
                    primaryPassportStatus,
                    vault.expiryDate.toISOString().split('T')[0],
                  )}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#C9A84C] flex-shrink-0 transition-colors" />
          </Link>
        </div>

        {/* Saved travellers */}
        <div>
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
            Saved Travellers
            {savedDTOs.length > 0 && (
              <span className="ml-2 text-white/20 font-normal normal-case">{savedDTOs.length}</span>
            )}
          </h2>

          {savedDTOs.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
              <Users className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-white/40 text-sm mb-1">No saved travellers yet</p>
              <p className="text-white/25 text-xs mb-4">
                Add family members and travel companions to reuse their details on future bookings.
              </p>
              <Link href="/dashboard/travellers/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
                <Plus className="w-4 h-4" />
                Add your first traveller
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {savedDTOs.map(({ dto, completeness }) => {
                const pm = dto.passportMeta
                const pStatus = pm?.expiryStatus ?? 'NOT_PROVIDED'
                return (
                  <Link key={dto.id} href={`/dashboard/travellers/${dto.id}`}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B1F3A] border border-white/8 hover:border-[#C9A84C]/30 transition-all group">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 font-semibold text-sm flex-shrink-0">
                      {dto.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold text-sm group-hover:text-[#C9A84C] transition-colors">
                          {dto.displayName}
                        </p>
                        {pStatus === 'EXPIRED' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Passport expired</span>
                        )}
                        {pStatus === 'EXPIRES_SOON' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Review soon</span>
                        )}
                      </div>
                      <p className="text-white/30 text-xs mt-0.5">{dto.relationship}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${completenessColor(completeness.percent)}`}
                            style={{ width: `${completeness.percent}%` }}
                          />
                        </div>
                        <span className="text-white/30 text-[10px] w-8 text-right">{completeness.percent}%</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#C9A84C] flex-shrink-0 transition-colors" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Ask Jade CTA */}
        <Link href="/dashboard/jade"
          className="mt-6 flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#C9A84C]/10 to-[#C9A84C]/5 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <span className="text-[#0B1F3A] text-base">✨</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Ask Jade about your travellers</p>
            <p className="text-white/40 text-xs">Check passport status, completeness, or plan a trip together</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#C9A84C]/60 group-hover:text-[#C9A84C] transition-colors flex-shrink-0" />
        </Link>

        {/* Privacy note */}
        <div className="mt-4 flex items-start gap-2 p-4 rounded-xl bg-white/3 border border-white/6">
          <Shield className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
          <p className="text-white/30 text-xs leading-relaxed">
            Removing a saved traveller does not affect historical booking records.
            Your booking history always reflects the original traveller details at the time of booking.
          </p>
        </div>
      </div>
    </div>
  )
}
