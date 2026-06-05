'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  FileText, Clock, CheckCircle, XCircle, Loader2,
  ChevronRight, Plus, MessageCircle, AlertCircle,
} from 'lucide-react'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface Application {
  id: string
  refNumber: string
  title: string
  type: string
  stage: Stage
  destination: string | null
  travelDate: string | null
  amount: number | null
  currency: string
  amountPaid: number
  createdAt: string
  documents: { id: string; status: string }[]
  payments: { id: string; amount: number; currency: string; status: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

const STAGE_ORDER: Stage[] = [
  'ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED',
  'PROCESSING', 'SUBMITTED', 'APPROVED', 'COMPLETED',
]

const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY:             'Enquiry Received',
  DOCUMENTS_PENDING:   'Documents Pending',
  DOCUMENTS_RECEIVED:  'Documents Received',
  PROCESSING:          'Processing',
  SUBMITTED:           'Submitted',
  APPROVED:            'Approved',
  REJECTED:            'Rejected',
  COMPLETED:           'Completed',
}

const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY:             'bg-blue-100 text-blue-700',
  DOCUMENTS_PENDING:   'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED:  'bg-yellow-100 text-yellow-700',
  PROCESSING:          'bg-purple-100 text-purple-700',
  SUBMITTED:           'bg-indigo-100 text-indigo-700',
  APPROVED:            'bg-green-100 text-green-700',
  REJECTED:            'bg-red-100 text-red-700',
  COMPLETED:           'bg-gray-100 text-gray-600',
}

function stageProgress(stage: Stage): number {
  if (stage === 'REJECTED') return 100
  const idx = STAGE_ORDER.indexOf(stage)
  return idx === -1 ? 0 : Math.round(((idx + 1) / STAGE_ORDER.length) * 100)
}

export default function PortalDashboard() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portal/applications')
      .then(r => r.json())
      .then(d => { setApplications(d.applications ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">My Applications</h1>
            <p className="text-sm text-gray-500 mt-0.5">{applications.length} active application{applications.length !== 1 ? 's' : ''}</p>
          </div>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp Support
          </a>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 space-y-4 max-w-4xl">
        {applications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#0B1F3A] mb-2">No applications yet</h3>
            <p className="text-gray-500 text-sm mb-6">
              Your visa, flight, and travel applications will appear here once our team creates them.
            </p>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2040] transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Start a new application
            </a>
          </div>
        ) : (
          applications.map(app => {
            const progress = stageProgress(app.stage)
            const docsNeeded = app.stage === 'DOCUMENTS_PENDING'
            const totalChecklist = app.checklist.length
            const doneChecklist = app.checklist.filter(c => c.completedAt).length

            return (
              <div key={app.id} className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-[#C9A84C]/40 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STAGE_COLOR[app.stage]}`}>
                        {STAGE_LABELS[app.stage]}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{app.refNumber}</span>
                    </div>
                    <h3 className="font-bold text-[#0B1F3A] text-lg leading-tight">{app.title}</h3>
                    {app.destination && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/portal/application/${app.id}`}
                    className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium text-[#0B1F3A] rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Details <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Progress bar */}
                {app.stage !== 'REJECTED' && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <FileText className="w-3.5 h-3.5" />
                    {app.documents.length} document{app.documents.length !== 1 ? 's' : ''}
                  </div>
                  {totalChecklist > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {doneChecklist}/{totalChecklist} checklist
                    </div>
                  )}
                  {app.amount && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="font-medium text-[#0B1F3A]">
                        {app.currency} {app.amountPaid.toFixed(0)} / {app.amount.toFixed(0)} paid
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {format(new Date(app.createdAt), 'd MMM yyyy')}
                  </div>
                </div>

                {/* Alert if docs needed */}
                {docsNeeded && (
                  <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Documents required — please upload via the Documents tab.</span>
                    <Link href="/portal/documents" className="ml-auto text-amber-800 font-semibold hover:underline whitespace-nowrap">
                      Upload now →
                    </Link>
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Help card */}
        <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Need help with your application?</h3>
              <p className="text-white/60 text-sm">Our team is available on WhatsApp for any questions about documents, timelines, or status updates.</p>
            </div>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              Chat Now
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
