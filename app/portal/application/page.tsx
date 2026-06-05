'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  FileText, Clock, CheckCircle, Loader2, ChevronRight,
  MessageCircle, AlertCircle, Globe, Plus,
} from 'lucide-react'
import { STATUS_CONFIG, VISA_CONFIGS, ISO2_TO_SLUG } from '@/lib/visa-config'

// ─── Legacy portal application type ─────────────────────────────────────────
type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface PortalApp {
  id: string; refNumber: string; title: string; type: string; stage: Stage
  destination: string | null; travelDate: string | null
  amount: number | null; currency: string; amountPaid: number
  createdAt: string; updatedAt: string
  documents: { id: string; status: string }[]
  payments: { id: string; amount: number; currency: string; status: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

// ─── Visa application type ───────────────────────────────────────────────────
interface VisaApp {
  id: string; referenceNumber: string; destinationIso2: string; visaType: string
  firstName: string | null; lastName: string | null
  status: string; isDraft: boolean; serviceFeePaid: boolean
  createdAt: string; updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STAGE_ORDER: Stage[] = [
  'ENQUIRY','DOCUMENTS_PENDING','DOCUMENTS_RECEIVED',
  'PROCESSING','SUBMITTED','APPROVED','COMPLETED',
]

const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
  DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', COMPLETED: 'Completed',
}

const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-100 text-blue-700',
  DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
}

function stageProgress(stage: Stage): number {
  if (stage === 'REJECTED') return 100
  const idx = STAGE_ORDER.indexOf(stage)
  return idx === -1 ? 0 : Math.round(((idx + 1) / STAGE_ORDER.length) * 100)
}

function VisaStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.received
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default function ApplicationsPage() {
  const [portalApps, setPortalApps] = useState<PortalApp[]>([])
  const [visaApps, setVisaApps] = useState<VisaApp[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'visa' | 'travel'>('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/applications').then(r => r.json()).catch(() => ({ applications: [] })),
      fetch('/api/visa-application').then(r => r.json()).catch(() => ({ applications: [] })),
    ]).then(([portalData, visaData]) => {
      setPortalApps(portalData.applications ?? [])
      setVisaApps((visaData.applications ?? []).filter((a: VisaApp) => !a.isDraft))
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  const total = portalApps.length + visaApps.length
  const showVisaApps  = tab === 'all' || tab === 'visa'
  const showPortalApps = tab === 'all' || tab === 'travel'

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 lg:px-8 py-5">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">My Applications</h1>
            <p className="text-sm text-gray-400 mt-0.5">{total} application{total !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/visa" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
            <Plus className="w-4 h-4" />
            New Visa Application
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 lg:px-8 py-6 pb-24 space-y-4">

        {/* Tabs */}
        {total > 0 && (
          <div className="flex gap-2">
            {([
              { key: 'all',    label: `All (${total})` },
              { key: 'visa',   label: `Visa (${visaApps.length})` },
              { key: 'travel', label: `Travel (${portalApps.length})` },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {total === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#0B1F3A] mb-2">No applications yet</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
              Apply for a visa directly on Walz Travels or contact our team for help.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/visa" className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
                <Globe className="w-4 h-4" /> Apply for a Visa
              </Link>
              <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2040] transition-colors">
                <MessageCircle className="w-4 h-4" /> Chat with Jade
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* ── Visa Applications ─────────────────────────────────────────── */}
            {showVisaApps && visaApps.length > 0 && (
              <div className="space-y-3">
                {tab === 'all' && (
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-[#C9A84C]" />
                    <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide">Visa Applications</h2>
                  </div>
                )}
                {visaApps.map(app => {
                  const cfg = VISA_CONFIGS[app.destinationIso2]
                  const slug = ISO2_TO_SLUG[app.destinationIso2] ?? app.destinationIso2.toLowerCase()
                  const name = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'
                  return (
                    <div key={app.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#C9A84C]/30 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-3xl leading-none mt-0.5">{cfg?.flag ?? '🌍'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <VisaStatusBadge status={app.status} />
                              <span className="text-xs text-[#C9A84C] font-mono">{app.referenceNumber}</span>
                              {app.serviceFeePaid && <span className="text-xs text-green-600 font-semibold">💰 Paid</span>}
                            </div>
                            <h3 className="font-bold text-[#0B1F3A] text-base leading-tight">{cfg?.name ?? app.destinationIso2} — {app.visaType}</h3>
                            <p className="text-sm text-gray-400 mt-0.5">{name}</p>
                          </div>
                        </div>
                        <Link href={`/portal/visa-application/${app.id}`}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs font-medium text-[#0B1F3A] rounded-xl hover:bg-gray-50 transition-colors">
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(app.createdAt), 'd MMM yyyy')}
                        </span>
                        <span className="text-gray-200">·</span>
                        <span>Last updated {format(new Date(app.updatedAt), 'd MMM')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Legacy Travel Applications ─────────────────────────────────── */}
            {showPortalApps && portalApps.length > 0 && (
              <div className="space-y-3">
                {tab === 'all' && (
                  <div className="flex items-center gap-2 mb-1 mt-4">
                    <FileText className="w-4 h-4 text-[#C9A84C]" />
                    <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide">Travel Applications</h2>
                  </div>
                )}
                {portalApps.map(app => {
                  const progress   = stageProgress(app.stage)
                  const docsNeeded = app.stage === 'DOCUMENTS_PENDING'
                  const totalCL    = app.checklist.length
                  const doneCL     = app.checklist.filter(c => c.completedAt).length

                  return (
                    <div key={app.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-[#C9A84C]/30 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[app.stage]}`}>
                              {STAGE_LABELS[app.stage]}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">{app.refNumber}</span>
                          </div>
                          <h3 className="font-bold text-[#0B1F3A] text-base leading-tight">{app.title}</h3>
                          {app.destination && (
                            <p className="text-sm text-gray-400 mt-0.5">
                              {app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}
                            </p>
                          )}
                        </div>
                        <Link href={`/portal/application/${app.id}`}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs font-medium text-[#0B1F3A] rounded-xl hover:bg-gray-50 transition-colors">
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>

                      {app.stage !== 'REJECTED' && (
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Progress</span><span>{progress}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`}
                              style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {app.documents.length} doc{app.documents.length !== 1 ? 's' : ''}
                        </span>
                        {totalCL > 0 && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {doneCL}/{totalCL} checklist
                          </span>
                        )}
                        {app.amount && (
                          <span className="font-medium text-[#0B1F3A]">
                            {app.currency} {app.amountPaid.toFixed(0)} / {app.amount.toFixed(0)} paid
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(app.createdAt), 'd MMM yyyy')}
                        </span>
                      </div>

                      {docsNeeded && (
                        <div className="mt-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>Documents required — please upload via the Documents tab.</span>
                          <Link href="/portal/documents" className="ml-auto font-semibold hover:underline whitespace-nowrap text-amber-800">
                            Upload →
                          </Link>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Help card */}
        <div className="bg-[#0B1F3A] rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Need help with your application?</h3>
              <p className="text-white/50 text-xs mt-0.5">WhatsApp Jade — our visa coordinator is available Mon–Sat.</p>
            </div>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
              Chat Now
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
