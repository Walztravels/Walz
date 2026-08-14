import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500 text-sm">—</span>
  const color = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-2xl font-bold tabular-nums ${color}`}>{score}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-300',
    running: 'bg-blue-900 text-blue-300 animate-pulse',
    complete: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  )
}

export default async function OrbitDashboard() {
  await getAdminSession() // already gated by layout

  const [settings, audits, integrations] = await Promise.all([
    prisma.orbitSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.orbitAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, siteUrl: true, status: true, score: true,
        pagesTotal: true, pagesDone: true,
        issuesCritical: true, issuesHigh: true,
        createdAt: true, completedAt: true,
      },
    }),
    prisma.orbitIntegration.findMany(),
  ])

  const latest = audits[0] ?? null
  const connectedCount = integrations.filter((i) => i.connected).length

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Orbit Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            {settings?.siteUrl ?? 'https://www.walztravels.com'}
          </p>
        </div>
        <Link
          href="/admin/orbit/audit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Run New Audit
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Latest Score</p>
          <ScoreBadge score={latest?.score ?? null} />
          {latest && <p className="text-xs text-gray-600 mt-1">/100</p>}
          {!latest && <p className="text-xs text-gray-600 mt-1">No audits yet</p>}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Critical Issues</p>
          <span className="text-2xl font-bold tabular-nums text-red-400">
            {latest?.issuesCritical ?? '—'}
          </span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">High Issues</p>
          <span className="text-2xl font-bold tabular-nums text-orange-400">
            {latest?.issuesHigh ?? '—'}
          </span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Integrations</p>
          <span className="text-2xl font-bold tabular-nums text-indigo-400">{connectedCount}</span>
          <p className="text-xs text-gray-600 mt-1">connected</p>
        </div>
      </div>

      {/* Recent audits */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Recent Audits</h2>
          <Link href="/admin/orbit/audit" className="text-xs text-indigo-400 hover:underline">
            View all
          </Link>
        </div>
        {audits.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-500 text-sm">
            No audits have been run yet.{' '}
            <Link href="/admin/orbit/audit" className="text-indigo-400 underline">
              Run your first audit
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium">Pages</th>
                <th className="px-5 py-3 font-medium">Critical</th>
                <th className="px-5 py-3 font-medium">High</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {audits.map((a) => (
                <tr key={a.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-5 py-3">
                    <ScoreBadge score={a.score} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-gray-400">
                    {a.pagesDone}/{a.pagesTotal ?? '?'}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-red-400">{a.issuesCritical}</td>
                  <td className="px-5 py-3 tabular-nums text-orange-400">{a.issuesHigh}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/orbit/audit/${a.id}`}
                      className="text-indigo-400 hover:underline text-xs"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings quick-view */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-white mb-3">Site Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">Site URL</p>
            <p className="text-gray-200 break-all">{settings?.siteUrl ?? 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Brand Name</p>
            <p className="text-gray-200">{settings?.brandName ?? 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Title Suffix</p>
            <p className="text-gray-200">{settings?.brandSuffix ?? 'Not configured'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
