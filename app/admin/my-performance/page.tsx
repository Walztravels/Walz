'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Notice {
  id: string
  warningType: string
  status: string
  reviewDate: string
  deliveredAt: string | null
  openedAt: string | null
  acknowledgedAt: string | null
  employeeResponseAt: string | null
  createdAt: string
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default function MyPerformancePage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/performance/my-notices')
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setError(json.error ?? 'Failed to load your notices.'); return }
        setNotices(json.documents ?? [])
      } catch {
        setError('Network error — please try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">My Performance Notices</h1>
      <p className="text-sm text-gray-500 mb-6">Confidential documents issued to you by Walz Travels management. Only you and authorized Super Admins can see these.</p>

      {loading ? (
        <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : notices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-sm text-gray-400">
          You have no performance notices on record.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {notices.map((n) => (
            <Link key={n.id} href={`/admin/my-performance/${n.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <div>
                <div className="font-semibold text-sm text-[#0B1F3A]">{n.warningType.replace(/_/g, ' ')}</div>
                <div className="text-xs text-gray-400">Issued {fmt(n.createdAt)} · Review date {fmt(n.reviewDate)}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${n.acknowledgedAt ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {n.acknowledgedAt ? 'Acknowledged' : 'Action needed'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
