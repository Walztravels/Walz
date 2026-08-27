import { getAdminSession } from '@/lib/admin-auth'
import { redirect }        from 'next/navigation'
import prisma              from '@/lib/db'
import Link                from 'next/link'
import { format }          from 'date-fns'
import { Sparkles, ChevronRight, Calendar, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

function dateLabel(briefDate: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yest  = new Date(Date.now() - 86400_000).toISOString().split('T')[0]
  if (briefDate === today) return 'Today'
  if (briefDate === yest)  return 'Yesterday'
  return format(new Date(briefDate + 'T12:00:00Z'), 'EEEE, d MMMM')
}

const CAT_LABELS: Record<string, string> = {
  NEW_FEATURE: 'New Feature', SYSTEM_UPDATE: 'System Update', POLICY: 'Policy',
  SUPPLIER: 'Supplier', IMPORTANT: 'Important', TRAINING: 'Training',
}

type ContentJson = {
  announcements?: { id: string; title: string; category: string; priority: string }[]
  urgentCount?: number
}

export default async function BriefHistoryPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const briefs = await prisma.jadeDailyBrief.findMany({
    orderBy: { briefDate: 'desc' },
    take:    30,
  })

  return (
    <div className="max-w-2xl space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#C9A84C]" />
          Jade Daily Brief
        </h1>
        <p className="text-white/40 text-sm mt-1">History of daily staff briefings</p>
      </div>

      {briefs.length === 0 ? (
        <div className="bg-[#112240] rounded-2xl p-12 text-center">
          <Sparkles className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No briefs generated yet.</p>
          <p className="text-white/25 text-xs mt-1">The daily brief generates automatically at 07:00.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map(brief => {
            const content = brief.contentJson as ContentJson
            const anns    = content?.announcements ?? []
            const urgent  = content?.urgentCount ?? 0

            return (
              <div key={brief.id} className="bg-[#112240] rounded-2xl ring-1 ring-white/5 hover:ring-[#C9A84C]/20 transition-all">
                <div className="p-5">
                  {/* Date + badges */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[#C9A84C] text-sm font-bold">{dateLabel(brief.briefDate)}</span>
                        <span className="text-white/20 text-xs">{brief.briefDate}</span>
                        {urgent > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 font-bold border border-red-500/20">
                            {urgent} URGENT
                          </span>
                        )}
                      </div>
                      {/* Motivation preview */}
                      <p className="text-white/80 text-sm italic leading-relaxed">
                        &ldquo;{brief.motivation.length > 120 ? brief.motivation.slice(0, 120) + '…' : brief.motivation}&rdquo;
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0 mt-1" />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 text-[11px] text-white/30">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {brief.staffReached} staff reached
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(brief.generatedAt, 'HH:mm')}
                    </span>
                    {anns.length > 0 && (
                      <span>{anns.length} announcement{anns.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {/* Announcement titles */}
                  {anns.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {anns.slice(0, 3).map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-xs text-white/50">
                          <span className="text-[#C9A84C]/60 text-[10px] font-medium">
                            {CAT_LABELS[a.category] ?? a.category}
                          </span>
                          <span>·</span>
                          <span>{a.title}</span>
                        </div>
                      ))}
                      {anns.length > 3 && (
                        <p className="text-xs text-white/30">+{anns.length - 3} more</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
