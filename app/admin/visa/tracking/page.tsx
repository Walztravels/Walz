'use client'

import { useState, useEffect } from 'react'
import { Send, Eye, FileText, CreditCard, ChevronRight } from 'lucide-react'

interface VTrack {
  id: string; clientEmail: string; clientName?: string; destination: string
  visaType: string; sentAt?: string; openedAt?: string; startedAt?: string
  submittedAt?: string; paymentStatus: string; viewCount: number
  serviceFeeAmount?: string; serviceFeeCurrency?: string
}

function stepStatus(a: VTrack) {
  if (a.submittedAt && a.paymentStatus === 'PAID') return { label: 'Complete',    color: 'bg-green-100 text-green-700' }
  if (a.submittedAt)                               return { label: 'Submitted',   color: 'bg-blue-100 text-blue-700' }
  if (a.startedAt)                                 return { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' }
  if (a.openedAt)                                  return { label: 'Opened',      color: 'bg-purple-100 text-purple-700' }
  if (a.sentAt)                                    return { label: 'Sent',        color: 'bg-gray-100 text-gray-600' }
  return                                                  { label: 'Draft',       color: 'bg-gray-100 text-gray-400' }
}

export default function VisaTrackingPage() {
  const [apps, setApps] = useState<VTrack[]>([])

  useEffect(() => {
    fetch('/api/admin/visa/tracking').then(r => r.json()).then(d => setApps(d.applications ?? []))
  }, [])

  const fmt = (d?: string) => d
    ? new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : '—'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Visa Form Tracking</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {apps.length} forms · {apps.filter(a => a.openedAt).length} opened · {apps.filter(a => a.submittedAt).length} submitted
        </p>
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { icon: Send,       label: 'Sent',        count: apps.filter(a => a.sentAt).length,                    bg: 'bg-gray-50' },
          { icon: Eye,        label: 'Opened',      count: apps.filter(a => a.openedAt).length,                  bg: 'bg-purple-50' },
          { icon: FileText,   label: 'In Progress', count: apps.filter(a => a.startedAt).length,                 bg: 'bg-yellow-50' },
          { icon: FileText,   label: 'Submitted',   count: apps.filter(a => a.submittedAt).length,               bg: 'bg-blue-50' },
          { icon: CreditCard, label: 'Paid',        count: apps.filter(a => a.paymentStatus === 'PAID').length,  bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <s.icon className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-[#0B1F3A]">{s.count}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Client','Destination','Status','Sent','Opened','Submitted','Views','Fee',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr><td colSpan={9} className="text-center py-16 text-gray-400 text-sm">No visa applications found</td></tr>
            )}
            {apps.map(a => {
              const s = stepStatus(a)
              return (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#0B1F3A]">{a.clientName || a.clientEmail.split('@')[0]}</p>
                    <p className="text-xs text-gray-400">{a.clientEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 uppercase text-xs font-medium">
                    {a.destination} · {a.visaType}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmt(a.sentAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmt(a.openedAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmt(a.submittedAt)}</td>
                  <td className="px-4 py-3 text-center text-sm font-semibold text-[#0B1F3A]">{a.viewCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {a.serviceFeeAmount ? `${a.serviceFeeCurrency} ${Number(a.serviceFeeAmount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/admin/visa-applications`} className="text-[#C9A84C] hover:text-[#0B1F3A] transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
