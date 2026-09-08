'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Briefcase, Loader2, ArrowRight } from 'lucide-react'

interface JobRow { id: string; status: string }

// Recruitment Hub landing. Links appear here only as their features ship —
// no placeholder navigation.
export default function RecruitmentHubPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null)

  useEffect(() => {
    fetch('/api/admin/recruitment/jobs').then(r => r.json()).then(d => setJobs(d.jobs ?? [])).catch(() => setJobs([]))
  }, [])

  const count = (s: string) => jobs?.filter(j => j.status === s).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Recruitment Hub</h1>
        <p className="text-gray-400 text-sm mt-0.5">Hiring for Walz Travels — jobs, candidates and interviews</p>
      </div>

      {jobs === null ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([['published', 'Published'], ['draft', 'Drafts'], ['paused', 'Paused'], ['closed', 'Closed']] as const).map(([key, lbl]) => (
              <div key={key} className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-2xl font-bold text-[#0B1F3A]">{count(key)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{lbl} jobs</p>
              </div>
            ))}
          </div>

          <Link href="/admin/recruitment/jobs"
            className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-5 hover:shadow transition-shadow group">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <div>
                <p className="font-bold text-[#0B1F3A] text-sm">Job Openings</p>
                <p className="text-xs text-gray-400">Create, publish, pause and reorder roles shown on /careers</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#C9A84C]" />
          </Link>

          <p className="text-xs text-gray-300">
            Candidates, pipeline, interviews and analytics arrive in the next Recruitment Hub releases.
          </p>
        </>
      )}
    </div>
  )
}
