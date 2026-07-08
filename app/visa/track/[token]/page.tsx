import { notFound } from 'next/navigation'
import { CheckCircle, Clock, Download } from 'lucide-react'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const STAGES = [
  { key: 'ENQUIRY',            label: 'Received',          emoji: '📋' },
  { key: 'DOCUMENTS_PENDING',  label: 'Docs Requested',    emoji: '📄' },
  { key: 'DOCUMENTS_RECEIVED', label: 'Docs Received',     emoji: '✅' },
  { key: 'PROCESSING',         label: 'Processing',        emoji: '🔄' },
  { key: 'SUBMITTED',          label: 'At Embassy',        emoji: '📮' },
  { key: 'AWAITING_DECISION',  label: 'Awaiting Decision', emoji: '⏳' },
  { key: 'APPROVED',           label: 'Approved',          emoji: '🎉' },
]

export default async function TrackApplicationPage({ params }: { params: { token: string } }) {
  const app = await prisma.portalApplication.findFirst({
    where: {
      OR: [{ trackingToken: params.token }, { id: params.token }],
    },
    include: {
      user:    { select: { name: true, email: true } },
      updates: {
        where:   { isClientVisible: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!app) notFound()

  const stageIdx    = STAGES.findIndex(s => s.key === app.stage)
  const isApproved  = app.stage === 'APPROVED'
  const isRejected  = app.stage === 'REJECTED'
  const isCompleted = app.stage === 'COMPLETED'
  const lastUpdate  = app.updates[0]

  return (
    <div className="min-h-screen bg-[#F5F0E8]">

      {/* Header */}
      <div className="bg-[#0B1F3A] py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[#C9A84C] text-xs uppercase tracking-[3px] mb-2">
            Visa Application Tracker
          </p>
          <h1 className="text-white font-bold text-2xl">
            {app.destination ? `${app.destination} Visa` : app.title}
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {app.user?.name ?? app.user?.email ?? 'Your application'} · {app.refNumber}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Current status card */}
        <div className={`rounded-2xl p-6 text-center shadow-sm ${
          isApproved  ? 'bg-green-50 border-2 border-green-200'
          : isRejected ? 'bg-red-50 border-2 border-red-200'
          : 'bg-white border border-gray-100'
        }`}>
          <p className="text-4xl mb-3">
            {isApproved  ? '🎉'
            : isRejected  ? '😔'
            : (STAGES[stageIdx]?.emoji ?? '📋')}
          </p>
          <p className={`font-bold text-lg ${
            isApproved  ? 'text-green-700'
            : isRejected ? 'text-red-700'
            : 'text-[#0B1F3A]'
          }`}>
            {isApproved  ? 'Your Visa Has Been Approved!'
            : isRejected  ? 'Application Was Refused'
            : isCompleted ? 'Application Completed'
            : (STAGES[stageIdx]?.label ?? 'Processing')}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {lastUpdate
              ? `Last updated: ${new Date(lastUpdate.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'Pending first update from our team'}
          </p>
        </div>

        {/* Progress bar — hidden if rejected */}
        {!isRejected && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                    ${i < stageIdx  ? 'bg-[#C9A84C]'
                    : i === stageIdx ? 'bg-[#0B1F3A]'
                    :                  'bg-gray-100'}`}>
                    {i < stageIdx
                      ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                      : i === stageIdx
                        ? <Clock className="w-3 h-3 text-white" />
                        : null}
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < stageIdx ? 'bg-[#C9A84C]' : 'bg-gray-100'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {STAGES.map((s, i) => (
                <p key={s.key} className={`text-[9px] text-center flex-1 last:flex-none leading-tight
                  ${i === stageIdx ? 'text-[#0B1F3A] font-semibold' : 'text-gray-300'}`}>
                  {s.label}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Updates timeline */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-5">Application Updates</h2>

          {app.updates.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              Your application is being reviewed. Updates will appear here shortly.
            </p>
          ) : (
            <div className="space-y-6">
              {app.updates.map((u, i) => (
                <div key={u.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-[#F5F0E8] flex items-center justify-center text-base flex-shrink-0">
                      {u.documentUrl ? '📎'
                       : u.newStatus === 'APPROVED' ? '🎉'
                       : u.newStatus === 'REJECTED' ? '😔'
                       : u.newStatus ? (STAGES.find(s => s.key === u.newStatus)?.emoji ?? '🔄')
                       : '💬'}
                    </div>
                    {i < app.updates.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gray-100 mt-2 min-h-[24px]" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-semibold text-[#0B1F3A] text-sm">{u.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(u.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })} · Walz Travels Team
                    </p>
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{u.message}</p>
                    {u.documentUrl && (
                      <a href={u.documentUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 mt-3 bg-[#F5F0E8] text-[#0B1F3A] text-xs font-semibold px-4 py-2 rounded-full hover:bg-[#C9A84C]/20 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                        {u.documentName ?? 'Download Document'}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="bg-[#0B1F3A] rounded-2xl p-6 text-center">
          <p className="text-white/60 text-sm mb-4">Have questions about your application?</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://wa.me/12317902336" target="_blank" rel="noreferrer"
              className="bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-2.5 rounded-full text-sm hover:bg-white transition-colors">
              WhatsApp Us
            </a>
            <a href="mailto:visa@walztravels.com"
              className="border border-white/20 text-white/70 px-6 py-2.5 rounded-full text-sm hover:border-white hover:text-white transition-colors">
              Email Us
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Walz Travels · visa@walztravels.com · +12317902336
        </p>
      </div>
    </div>
  )
}
