import type { Metadata } from 'next'
import Link from 'next/link'
import prisma from '@/lib/db'
import { hashToken, candidateSafeStatus } from '@/lib/recruitment/applications'
import { privateMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

// Static, generic metadata — the candidate's name, reference and token must
// never appear in the document head, and the page is never indexed.
export const metadata: Metadata = privateMetadata('Application Status')

// Candidate-safe status page. Requires the signed, time-limited token from
// the confirmation email. Exposes ONLY coarse candidate-safe statuses —
// never internal stages, scores, notes or other candidates.
export default async function ApplicationStatusPage({ params, searchParams }: {
  params: { reference: string }
  searchParams: { t?: string }
}) {
  const token = searchParams.t ?? ''
  let view: { title: string; status: string; submitted: string } | null = null

  if (token && /^WALZ-CAREERS-/.test(params.reference)) {
    try {
      const app = await prisma.jobApplication.findUnique({
        where:  { reference: params.reference },
        select: {
          stageKey: true, status: true, createdAt: true, jobId: true,
          statusTokenHash: true, statusTokenExpiresAt: true,
        },
      })
      if (
        app?.statusTokenHash &&
        app.statusTokenHash === hashToken(token) &&
        app.statusTokenExpiresAt && app.statusTokenExpiresAt.getTime() > Date.now()
      ) {
        const job = await prisma.jobOpening.findUnique({ where: { id: app.jobId }, select: { title: true } })
        view = {
          title:     job?.title ?? 'your application',
          status:    candidateSafeStatus(app.stageKey, app.status),
          submitted: app.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        }
      }
    } catch { /* fall through to the safe not-found view */ }
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE] flex items-center justify-center px-5 py-16">
      <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 max-w-md w-full text-center">
        {view ? (
          <>
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Application Status</p>
            <h1 className="font-display text-xl font-bold text-[#0B1F3A] mb-1">{view.title}</h1>
            <p className="text-xs text-[#0B1F3A]/40 mb-6 font-mono">{params.reference}</p>
            <div className="bg-[#F5F2EE] rounded-xl py-5 px-4 mb-6">
              <p className="font-display text-lg font-bold text-[#0B1F3A]">{view.status}</p>
              <p className="text-xs text-[#0B1F3A]/45 mt-1">Submitted {view.submitted}</p>
            </div>
            <p className="text-xs text-[#0B1F3A]/45 leading-relaxed">
              We&apos;ll email you whenever your application progresses. Questions? Write to{' '}
              <a href="mailto:careers@walztravels.com" className="text-[#C9A84C] hover:underline">careers@walztravels.com</a>.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-bold text-[#0B1F3A] mb-2">Link not valid</h1>
            <p className="text-sm text-[#0B1F3A]/55 leading-relaxed mb-5">
              This status link is invalid or has expired. Please use the link from your
              confirmation email, or contact{' '}
              <a href="mailto:careers@walztravels.com" className="text-[#C9A84C] hover:underline">careers@walztravels.com</a>{' '}
              quoting your application reference.
            </p>
            <Link href="/careers" className="text-sm font-semibold text-[#C9A84C] hover:underline">View open positions</Link>
          </>
        )}
      </div>
    </div>
  )
}
