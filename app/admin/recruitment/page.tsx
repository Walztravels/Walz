'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Briefcase, Loader2, ArrowRight, Users, Star, Mail, ShieldCheck } from 'lucide-react'

interface Analytics {
  totals: { applications: number; candidates: number; applications30d: number; hired: number; talentPool: number }
  stages: Array<{ key: string; label: string; count: number }>
  sources: Array<{ source: string; count: number }>
  offers: Array<{ status: string; count: number }>
  funnels: Array<{ jobId: string; title: string; status: string; total: number; stages: Array<{ key: string; label: string; count: number }> }>
  avgTimeToHireDays: number | null
  hiresMeasured: number
}
interface JobRow { id: string; status: string }

// Recruitment Hub overview: live analytics + navigation to every shipped area.
export default function RecruitmentHubPage() {
  const [jobs,      setJobs]      = useState<JobRow[] | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [error,     setError]     = useState('')

  useEffect(() => {
    fetch('/api/admin/recruitment/jobs').then(r => r.json()).then(d => setJobs(d.jobs ?? [])).catch(() => setJobs([]))
    fetch('/api/admin/recruitment/analytics').then(async r => {
      const d = await r.json()
      if (r.ok) setAnalytics(d)
      else setError(d.error ?? 'Analytics unavailable')
    }).catch(() => setError('Analytics unavailable'))
  }, [])

  const jobCount = (s: string) => jobs?.filter(j => j.status === s).length ?? 0

  const links = [
    { href: '/admin/recruitment/jobs',        icon: Briefcase,  title: 'Job Openings',          desc: 'Create, publish, pause and reorder roles shown on /careers' },
    { href: '/admin/recruitment/templates',   icon: Mail,       title: 'Email Templates',       desc: 'Candidate communication templates — sent only by staff, never automatically' },
    { href: '/admin/recruitment/talent-pool', icon: Star,       title: 'Talent Pool',           desc: 'Candidates kept in view for future roles' },
    { href: '/admin/recruitment/compliance',  icon: ShieldCheck, title: 'Retention & Compliance', desc: 'Retention report and per-candidate data erasure (explicit staff action)' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Recruitment Hub</h1>
        <p className="text-gray-400 text-sm mt-0.5">Hiring for Walz Travels — jobs, candidates, interviews, offers</p>
      </div>

      {jobs === null ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-2xl font-bold text-[#0B1F3A]">{jobCount('published')}</p>
              <p className="text-xs text-gray-400 mt-0.5">Published jobs</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-2xl font-bold text-[#0B1F3A]">{analytics?.totals.applications ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Applications ({analytics?.totals.applications30d ?? 0} in 30d)</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-2xl font-bold text-[#0B1F3A]">{analytics?.totals.candidates ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Candidates</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-2xl font-bold text-[#0B1F3A]">{analytics?.totals.hired ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Hired{analytics?.avgTimeToHireDays != null ? ` · ~${analytics.avgTimeToHireDays}d to hire` : ''}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-2xl font-bold text-[#0B1F3A]">{analytics?.totals.talentPool ?? '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">In talent pool</p>
            </div>
          </div>

          {error && <p className="text-xs text-gray-400">{error}</p>}

          {/* Per-job funnels */}
          {analytics && analytics.funnels.filter(f => f.total > 0).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-[#0B1F3A] mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#C9A84C]" /> Pipeline by job
              </h2>
              <div className="space-y-3">
                {analytics.funnels.filter(f => f.total > 0).map(f => (
                  <div key={f.jobId}>
                    <div className="flex items-center justify-between">
                      <Link href={`/admin/recruitment/jobs/${f.jobId}/pipeline`}
                        className="text-sm font-semibold text-[#0B1F3A] hover:underline">{f.title}</Link>
                      <span className="text-xs text-gray-400">{f.total} application{f.total !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {f.stages.map(s => (
                        <span key={s.key} className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {s.label}: {s.count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources + offers */}
          {analytics && (analytics.sources.length > 0 || analytics.offers.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {analytics.sources.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h2 className="text-sm font-bold text-[#0B1F3A] mb-2">Where candidates heard of us</h2>
                  {analytics.sources.map(s => (
                    <p key={s.source} className="text-xs text-gray-500 flex justify-between py-0.5">
                      <span>{s.source}</span><span className="font-semibold">{s.count}</span>
                    </p>
                  ))}
                </div>
              )}
              {analytics.offers.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h2 className="text-sm font-bold text-[#0B1F3A] mb-2">Offers</h2>
                  {analytics.offers.map(o => (
                    <p key={o.status} className="text-xs text-gray-500 flex justify-between py-0.5">
                      <span className="capitalize">{o.status}</span><span className="font-semibold">{o.count}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="grid sm:grid-cols-2 gap-3">
            {links.map(l => (
              <Link key={l.href} href={l.href}
                className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-5 hover:shadow transition-shadow group">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                    <l.icon className="w-5 h-5 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="font-bold text-[#0B1F3A] text-sm">{l.title}</p>
                    <p className="text-xs text-gray-400">{l.desc}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#C9A84C] flex-shrink-0" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
