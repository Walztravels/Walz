import { getAdminSession }    from '@/lib/admin-auth'
import { redirect }           from 'next/navigation'
import prisma                 from '@/lib/db'
import Link                   from 'next/link'
import { format }             from 'date-fns'
import { JadeEmailActions }   from '@/components/admin/JadeEmailActions'
import {
  Sparkles, Users, Bell, FileText, CheckCircle2, Clock,
  TrendingUp, Plus,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function StatTile({
  label, value, sub, icon: Icon, color = 'text-[#C9A84C]',
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="bg-[#0d1e35] rounded-2xl p-5 ring-1 ring-white/5 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
        <Icon className={`w-5 h-5 ${color}`} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className="text-white text-2xl font-semibold leading-none">{value}</p>
        {sub && <p className="text-xs mt-1 text-white/30">{sub}</p>}
      </div>
    </div>
  )
}

export default async function StaffIntelligencePage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')
  if (!['super_admin','admin'].includes(session.role)) redirect('/admin/dashboard')

  const today = new Date().toISOString().split('T')[0]

  const [
    todayBrief,
    totalBriefs,
    pendingAnn,
    publishedAnn,
    totalStaff,
    unreadCount,
  ] = await Promise.all([
    prisma.jadeDailyBrief.findUnique({ where: { briefDate: today } }),
    prisma.jadeDailyBrief.count(),
    prisma.staffAnnouncement.count({ where: { status: { in: ['DRAFT','APPROVED'] } } }),
    prisma.staffAnnouncement.count({ where: { status: 'PUBLISHED' } }),
    prisma.staff.count({ where: { isActive: true } }),
    prisma.staffNotification.count({ where: { read: false, archived: false } }),
  ])

  const recentBriefs = await prisma.jadeDailyBrief.findMany({
    orderBy: { briefDate: 'desc' },
    take: 5,
  })

  const pendingAnns = await prisma.staffAnnouncement.findMany({
    where: { status: { in: ['DRAFT','APPROVED'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, title: true, category: true, status: true,
      priority: true, createdAt: true,
      author: { select: { name: true } },
    },
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#C9A84C]" />
            Jade Staff Intelligence
          </h1>
          <p className="text-white/40 text-sm mt-1">Super Admin Control Centre</p>
        </div>
        <Link
          href="/admin/staff-updates/new"
          className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile
          label="Daily Brief"
          value={todayBrief ? 'Generated' : 'Pending'}
          sub={todayBrief ? `${todayBrief.staffReached} staff reached` : 'Runs at 07:00 UTC'}
          icon={todayBrief ? CheckCircle2 : Clock}
          color={todayBrief ? 'text-emerald-400' : 'text-amber-400'}
        />
        <StatTile
          label="Active Staff"
          value={totalStaff}
          sub={`${todayBrief?.staffReached ?? 0} reached today`}
          icon={Users}
        />
        <StatTile
          label="Pending Approval"
          value={pendingAnn}
          sub="Drafts + Approved"
          icon={Clock}
          color={pendingAnn > 0 ? 'text-amber-400' : 'text-white/40'}
        />
        <StatTile
          label="Published"
          value={publishedAnn}
          sub="Active announcements"
          icon={FileText}
          color="text-emerald-400"
        />
        <StatTile
          label="Total Briefs"
          value={totalBriefs}
          sub="All time"
          icon={TrendingUp}
        />
        <StatTile
          label="Unread Notifications"
          value={unreadCount}
          sub="Across all staff"
          icon={Bell}
          color={unreadCount > 20 ? 'text-amber-400' : 'text-[#C9A84C]'}
        />
      </div>

      {/* Email actions */}
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Email Delivery</h2>
          {todayBrief && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold">Brief Ready</span>
          )}
        </div>
        <p className="text-xs text-white/30">
          Staff receive the brief at 08:00 in their local timezone. Use these tools to preview or test the email template.
        </p>
        <JadeEmailActions hasBrief={!!todayBrief} briefDate={today} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* System status */}
        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">System Status</h2>
          <div className="space-y-3">
            {[
              { label: 'Daily Brief Cron',    ok: true, note: '07:00 UTC · weekdays' },
              { label: 'Staff Notifications', ok: true, note: 'In-app delivery active' },
              { label: 'Email Delivery',      ok: true, note: '08:00 local time · weekdays' },
              { label: 'WhatsApp Delivery',   ok: true, note: '08:00 local time · weekdays' },
              { label: 'Travel Intelligence', ok: true, note: 'AI-generated · 3 items daily' },
              { label: 'Visa Intelligence',   ok: true, note: 'AI-generated · 5 destinations' },
            ].map(({ label, ok, note }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-white/15'}`} />
                  <span className="text-sm text-white">{label}</span>
                </div>
                <span className="text-xs text-white/30">{note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent briefs */}
        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Recent Briefs</h2>
            <Link href="/admin/jade/briefs" className="text-xs text-[#C9A84C] hover:text-[#b8943d] transition-colors">
              View all →
            </Link>
          </div>
          {recentBriefs.length === 0 ? (
            <p className="text-white/30 text-sm">No briefs yet</p>
          ) : (
            <div className="space-y-2">
              {recentBriefs.map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm text-white font-medium">{b.briefDate}</p>
                    <p className="text-xs text-white/30 mt-0.5 line-clamp-1 italic">
                      &ldquo;{b.motivation.slice(0, 60)}{b.motivation.length > 60 ? '…' : ''}&rdquo;
                    </p>
                  </div>
                  <span className="text-xs text-white/30">{b.staffReached} staff</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Pending announcements */}
      {pendingAnns.length > 0 && (
        <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Pending Approval</h2>
            <Link href="/admin/staff-updates?status=DRAFT" className="text-xs text-[#C9A84C] hover:text-[#b8943d] transition-colors">
              Review all →
            </Link>
          </div>
          <div className="space-y-2">
            {pendingAnns.map(ann => (
              <Link
                key={ann.id}
                href={`/admin/staff-updates/${ann.id}`}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 hover:opacity-80 transition-opacity"
              >
                <div>
                  <p className="text-sm text-white">{ann.title}</p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {ann.status} · by {ann.author.name} · {format(new Date(ann.createdAt), 'd MMM')}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  ann.priority === 'URGENT' ? 'bg-red-500/10 text-red-300' :
                  ann.priority === 'HIGH'   ? 'bg-amber-500/10 text-amber-300' :
                  'bg-blue-500/10 text-blue-300'
                }`}>
                  {ann.priority}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
