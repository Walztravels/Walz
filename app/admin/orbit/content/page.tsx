'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Brief {
  id: string
  title: string
  status: string
  contentType: string
  primaryKeyword: string | null
  targetUrl: string | null
  createdAt: string
  _count: { drafts: number }
}

const STATUS_COLORS: Record<string, string> = {
  draft:       'bg-gray-700 text-gray-300',
  in_progress: 'bg-blue-900/60 text-blue-300',
  review:      'bg-yellow-900/60 text-yellow-300',
  approved:    'bg-green-900/60 text-green-300',
  published:   'bg-indigo-900/60 text-indigo-300',
  rejected:    'bg-red-900/60 text-red-300',
}

const TYPE_LABELS: Record<string, string> = {
  destination_guide:    'Destination Guide',
  itinerary:            'Itinerary',
  flight_content:       'Flight Content',
  hotel_content:        'Hotel Content',
  visa_draft:           'Visa Draft',
  travel_tips:          'Travel Tips',
  comparison:           'Comparison',
  faq:                  'FAQ',
  promotional_landing:  'Promo Landing',
  refresh:              'Refresh',
}

export default function ContentPage() {
  const [briefs, setBriefs]       = useState<Brief[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterType)   params.set('contentType', filterType)
    const res = await fetch(`/api/admin/orbit/briefs?${params}`)
    const data = await res.json()
    if (data.briefs) setBriefs(data.briefs)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterStatus, filterType])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content</h1>
          <p className="text-sm text-gray-400 mt-1">AI-generated briefs and drafts</p>
        </div>
        <Link href="/admin/orbit/content/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Brief
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : briefs.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-gray-400">No briefs yet.</p>
          <p className="text-gray-600 text-sm">Create your first content brief to get started.</p>
          <Link href="/admin/orbit/content/new"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors mt-2">
            Create brief
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {briefs.map(b => (
            <Link key={b.id} href={`/admin/orbit/content/${b.id}`}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 flex items-center gap-4 group transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[b.status] ?? 'bg-gray-700 text-gray-400'}`}>
                    {b.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-500">{TYPE_LABELS[b.contentType] ?? b.contentType}</span>
                </div>
                <p className="text-white font-medium text-sm truncate group-hover:text-indigo-300 transition-colors">{b.title}</p>
                {b.primaryKeyword && (
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{b.primaryKeyword}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500">{b._count.drafts} draft{b._count.drafts !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-600 mt-0.5">{new Date(b.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="text-gray-600 group-hover:text-gray-400 transition-colors">→</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
