import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import prisma from '@/lib/db'
import { Phone, Mail, MessageCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'

const BASE_URL = 'https://walztravels.com'

interface TimelineEntry {
  status:  string
  date:    string
  message: string
}

const STATUS_STEPS = [
  { key: 'received',             label: 'Application Received',   short: 'Received'   },
  { key: 'documents_pending',    label: 'Documents Under Review',  short: 'Documents'  },
  { key: 'under_review',         label: 'Under Review',           short: 'Review'     },
  { key: 'submitted_to_embassy', label: 'Submitted to Embassy',   short: 'Submitted'  },
  { key: 'decision_pending',     label: 'Decision Pending',       short: 'Decision'   },
]

const FINAL_STATES  = ['approved', 'refused']
const STATUS_ORDER  = STATUS_STEPS.map(s => s.key)

function stepIndex(status: string): number {
  if (status === 'approved' || status === 'refused') return STATUS_STEPS.length
  return STATUS_ORDER.indexOf(status)
}

function statusColour(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'received':             return { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'   }
    case 'documents_pending':    return { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  }
    case 'under_review':         return { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' }
    case 'ready_to_submit':      return { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200'   }
    case 'submitted_to_embassy': return { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' }
    case 'decision_pending':     return { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' }
    case 'approved':             return { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200'  }
    case 'refused':              return { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'    }
    default:                     return { bg: 'bg-gray-50',    text: 'text-gray-700',    border: 'border-gray-200'   }
  }
}

type Params = { params: Promise<{ reference: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { reference } = await params
  return {
    title:       `Track ${reference} | Walz Travels`,
    description: 'Track your visa application status in real time.',
    robots:      { index: false },
  }
}

export default async function TrackPage({ params }: Params) {
  const { reference } = await params

  const app = await prisma.visaApplication.findFirst({
    where: { referenceNumber: reference.toUpperCase() },
    select: {
      id:              true,
      referenceNumber: true,
      destinationIso2: true,
      visaType:        true,
      status:          true,
      statusMessage:   true,
      timeline:        true,
      appointmentDate: true,
      firstName:       true,
      lastName:        true,
      createdAt:       true,
      updatedAt:       true,
    },
  })

  if (!app) notFound()

  const clientName  = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'
  const currentIdx  = stepIndex(app.status)
  const isApproved  = app.status === 'approved'
  const isRefused   = app.status === 'refused'
  const timeline    = Array.isArray(app.timeline) ? (app.timeline as unknown as TimelineEntry[]) : []

  const statusColors = statusColour(app.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0B1F3A] py-4 px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_URL}/walz-logo.png`} alt="Walz Travels" className="h-8 w-auto" />
        </Link>
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest">Visa Tracker</p>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Reference card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-[#0B1F3A] px-6 py-5">
            <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-1">Reference</p>
            <p className="text-white text-2xl font-bold tracking-widest">{app.referenceNumber}</p>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Applicant</p>
              <p className="font-semibold text-[#0B1F3A]">{clientName}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Destination</p>
              <p className="font-semibold text-[#0B1F3A]">{app.destinationIso2}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Visa Type</p>
              <p className="font-semibold text-[#0B1F3A] capitalize">{app.visaType}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Submitted</p>
              <p className="font-semibold text-[#0B1F3A]">
                {app.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Progress steps */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">Progress</p>
          <div className="space-y-3">
            {STATUS_STEPS.map((step, idx) => {
              const done    = idx < currentIdx
              const current = idx === currentIdx && !FINAL_STATES.includes(app.status)
              const future  = idx > currentIdx && !FINAL_STATES.includes(app.status)
              const entry   = timeline.find(t => t.status === step.key)

              return (
                <div key={step.key} className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done    ? 'bg-green-100'  :
                    current ? 'bg-amber-100'  :
                              'bg-gray-100'
                  }`}>
                    {done    && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    {current && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
                    {future  && <Clock className="w-4 h-4 text-gray-300" />}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      done    ? 'text-green-700'  :
                      current ? 'text-amber-700'  :
                                'text-gray-400'
                    }`}>{step.label}</p>
                    {entry && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Final state */}
            {(isApproved || isRefused) && (
              <div className="flex items-start gap-3 pt-1">
                <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isApproved ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isApproved
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <XCircle     className="w-4 h-4 text-red-500"   />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isApproved ? 'text-green-700' : 'text-red-700'}`}>
                    {isApproved ? 'Visa Approved ✅' : 'Application Refused'}
                  </p>
                  {timeline.find(t => t.status === app.status) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(timeline.find(t => t.status === app.status)!.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current status box */}
        <div className={`rounded-2xl border p-5 ${statusColors.bg} ${statusColors.border}`}>
          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${statusColors.text}`}>Current Status</p>
          <p className={`text-base font-bold mb-1 ${statusColors.text}`}>
            {app.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </p>
          {app.statusMessage && (
            <p className={`text-sm ${statusColors.text} opacity-80`}>{app.statusMessage}</p>
          )}
        </div>

        {/* Appointment date */}
        {app.appointmentDate && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Next Appointment</p>
            <p className="text-[#0B1F3A] font-semibold">
              {app.appointmentDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Questions?</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://wa.me/12317902336"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#20ba5a] transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp us
            </a>
            <a
              href="tel:+19843880110"
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold hover:bg-[#162d52] transition-colors"
            >
              <Phone className="w-4 h-4" /> +1 984-388-0110
            </a>
            <a
              href="mailto:contact@walztravels.com"
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl border border-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#C9A84C]/10 transition-colors"
            >
              <Mail className="w-4 h-4 text-[#C9A84C]" /> Email us
            </a>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">
            Or chat with <button onClick={undefined} className="text-[#C9A84C] font-semibold">Jade</button> on our website
          </p>
        </div>

        {/* My account link */}
        <p className="text-center text-sm text-gray-500">
          Manage all your applications at{' '}
          <Link href="/my-account" className="text-[#C9A84C] font-semibold hover:underline">
            My Account →
          </Link>
        </p>
      </main>
    </div>
  )
}
