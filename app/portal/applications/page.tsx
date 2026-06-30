'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Plane, Clock, CheckCircle, XCircle, AlertCircle, ChevronRight, Loader2, Plus } from 'lucide-react'

interface VisaApp {
  id: string
  referenceNumber: string
  destinationIso2: string
  visaType: string
  firstName: string | null
  lastName: string | null
  status: string
  isDraft: boolean
  serviceFeePaid: boolean
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  draft:                  { label: 'Draft',             color: 'text-gray-500',   bg: 'bg-gray-100',    Icon: Clock          },
  received:               { label: 'Received',          color: 'text-blue-700',   bg: 'bg-blue-50',     Icon: Clock          },
  documents_pending:      { label: 'Docs Needed',       color: 'text-amber-700',  bg: 'bg-amber-50',    Icon: AlertCircle    },
  under_review:           { label: 'Under Review',      color: 'text-purple-700', bg: 'bg-purple-50',   Icon: AlertCircle    },
  ready_to_submit:        { label: 'Ready to Submit',   color: 'text-indigo-700', bg: 'bg-indigo-50',   Icon: CheckCircle    },
  submitted_to_embassy:   { label: 'At Embassy',        color: 'text-cyan-700',   bg: 'bg-cyan-50',     Icon: Plane          },
  decision_pending:       { label: 'Decision Pending',  color: 'text-orange-700', bg: 'bg-orange-50',   Icon: Clock          },
  approved:               { label: 'Approved ✓',        color: 'text-green-700',  bg: 'bg-green-50',    Icon: CheckCircle    },
  refused:                { label: 'Refused',           color: 'text-red-700',    bg: 'bg-red-50',      Icon: XCircle        },
}

function statusCfg(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, color: 'text-gray-600', bg: 'bg-gray-100', Icon: Clock }
}

function flagEmoji(iso2: string) {
  try {
    return iso2.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0)))
  } catch { return '🌍' }
}

export default function PortalApplicationsPage() {
  const [apps, setApps]     = useState<VisaApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch('/api/visa-application')
      .then(r => r.json())
      .then((d: { applications?: VisaApp[]; error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setApps((d.applications ?? []).filter(a => !a.isDraft))
        setLoading(false)
      })
      .catch(() => { setError('Failed to load applications'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 lg:px-8 py-5">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">My Applications</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {apps.length} visa application{apps.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href="/visa"
            className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors"
          >
            <Plus className="w-4 h-4" /> New Application
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 lg:px-8 py-6 pb-24">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-5">
            {error}
          </div>
        )}

        {apps.length === 0 && !error ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-4" />
            <p className="font-semibold text-gray-600">No applications yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-6">
              Your visa applications will appear here once submitted
            </p>
            <Link href="/visa"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
              Start a Visa Application →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => {
              const cfg = statusCfg(app.status)
              const { Icon } = cfg
              const name = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'
              return (
                <Link
                  key={app.id}
                  href={`/portal/visa-application/${app.id}`}
                  className="block bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center flex-shrink-0 text-xl">
                        {flagEmoji(app.destinationIso2)}
                      </div>
                      <div>
                        <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">
                          {app.visaType.charAt(0).toUpperCase() + app.visaType.slice(1)} Visa — {app.destinationIso2.toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Ref: <span className="font-medium text-gray-600">{app.referenceNumber}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color} whitespace-nowrap`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      {!app.serviceFeePaid && app.status !== 'draft' && (
                        <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                          Fee pending
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-50">
                    <span className="text-xs text-[#C9A84C] font-medium group-hover:underline flex items-center gap-1">
                      View details <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* WhatsApp help */}
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <p className="text-sm font-medium text-green-800">Need an update on your application?</p>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-600 hover:underline">
              WhatsApp us: +44 7398 753797 →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
