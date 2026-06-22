import prisma from '@/lib/db'
import Link   from 'next/link'
import { Users, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_COLOURS: Record<string, string> = {
  collecting: 'bg-blue-100 text-blue-700',
  voting:     'bg-amber-100 text-amber-700',
  locked:     'bg-green-100 text-green-700',
}

export default async function GroupSessionsPage() {
  let sessions: {
    id:          string
    name:        string
    status:      string
    destination: string | null
    createdAt:   Date
    _count:      { members: number }
  }[] = []

  let fetchError: string | null = null

  try {
    sessions = await prisma.groupSession.findMany({
      orderBy: { createdAt: 'desc' },
      take:    200,
      select: {
        id:          true,
        name:        true,
        status:      true,
        destination: true,
        createdAt:   true,
        _count:      { select: { members: true } },
      },
    })
  } catch (e) {
    fetchError = e instanceof Error ? e.message : 'Unknown error'
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Group Planning Sessions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Active group trip sessions across the platform
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0B1F3A]/5 rounded-lg">
          <Users className="w-4 h-4 text-[#0B1F3A]/50" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-[#0B1F3A]">
            {sessions.length} sessions
          </span>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Error loading sessions: {fetchError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Session Name</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Members</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sessions.length === 0 && !fetchError && (
              <tr>
                <td colSpan={6} className="text-center py-16 text-gray-400 text-sm">
                  No group sessions yet
                </td>
              </tr>
            )}
            {sessions.map(s => (
              <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-[#0B1F3A]">{s.name}</span>
                </td>
                <td className="px-4 py-3.5 text-gray-600">
                  {s.destination ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                    <Users className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
                    {s._count.members}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLOURS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">
                  {s.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <Link
                    href={`/group/${s.id}/itinerary`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#C9A84C] hover:text-[#b8952e] text-xs font-medium transition-colors"
                  >
                    Open <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
