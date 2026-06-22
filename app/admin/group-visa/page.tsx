import prisma from '@/lib/db'
import { ShieldCheck, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

const VISA_STATUS_COLOURS: Record<string, string> = {
  pending:     'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  complete:    'bg-green-100 text-green-700',
}

export default async function GroupVisaPage() {
  let sessions: {
    id:          string
    name:        string
    destination: string | null
    visaStatus:  string
    createdAt:   Date
    _count:      { members: number }
  }[] = []

  let fetchError: string | null = null

  try {
    sessions = await prisma.groupSession.findMany({
      where:   { NOT: { visaStatus: 'pending' } },
      orderBy: { createdAt: 'desc' },
      take:    200,
      select: {
        id:          true,
        name:        true,
        destination: true,
        visaStatus:  true,
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
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Group Visa Assessments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Group sessions with active visa analysis (in progress or complete)
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0B1F3A]/5 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-[#0B1F3A]/50" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-[#0B1F3A]">
            {sessions.length} assessed
          </span>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Error loading assessments: {fetchError}
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
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Visa Status</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sessions.length === 0 && !fetchError && (
              <tr>
                <td colSpan={5} className="text-center py-16 text-gray-400 text-sm">
                  No assessed group visa sessions yet
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
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${VISA_STATUS_COLOURS[s.visaStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                    {s.visaStatus.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">
                  {s.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
