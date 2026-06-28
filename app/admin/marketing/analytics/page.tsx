'use client'

import { useState, useEffect } from 'react'
import { BarChart2, Loader2, Instagram, Facebook, CheckCircle, XCircle, Clock, FileText, RefreshCw } from 'lucide-react'

type Post = {
  id:          string
  caption:     string
  platform:    string
  postType:    string
  publishedAt: string | null
  metaPostId:  string | null
  imageUrls:   unknown
  status:      string
}

type Analytics = {
  period:   string
  days:     number
  since:    string
  internal: {
    published:   number
    failed:      number
    scheduled:   number
    draft:       number
    igCount:     number
    fbCount:     number
    recentPosts: Post[]
  }
  meta: {
    facebook?:  unknown[] | null
    instagram?: unknown[] | null
    fbError?:   string | null
    igError?:   string | null
    error?:     string
  } | null
}

type MetricRow = { name?: string; values?: { value: number }[] }

function sumMetric(rows: unknown[] | null | undefined, name: string): number {
  if (!rows) return 0
  const row = (rows as MetricRow[]).find(r => r.name === name)
  if (!row?.values) return 0
  return row.values.reduce((s, v) => s + (v.value ?? 0), 0)
}

const PERIOD_LABELS: Record<string, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function AnalyticsPage() {
  const [period,   setPeriod]   = useState('30d')
  const [data,     setData]     = useState<Analytics | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  function load(p: string) {
    setLoading(true)
    setError('')
    fetch(`/api/admin/marketing/analytics?period=${p}`)
      .then(r => r.json())
      .then((d: Analytics) => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load analytics'); setLoading(false) })
  }

  useEffect(() => { load(period) }, [period])

  const fbReach       = sumMetric(data?.meta?.facebook as unknown[], 'page_reach')
  const fbImpressions = sumMetric(data?.meta?.facebook as unknown[], 'page_impressions')
  const fbEngaged     = sumMetric(data?.meta?.facebook as unknown[], 'page_engaged_users')
  const igReach       = sumMetric(data?.meta?.instagram as unknown[], 'reach')
  const igImpressions = sumMetric(data?.meta?.instagram as unknown[], 'impressions')
  const metaAvailable = data?.meta && !data.meta.error

  return (
    <div className="space-y-6 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Marketing Analytics</h1>
            <p className="text-sm text-gray-500">Social Studio performance overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(PERIOD_LABELS).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                period === p ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-400'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => load(period)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading
        ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          </div>
        )
        : error
        ? <p className="text-red-500 text-sm">{error}</p>
        : data && (
          <div className="space-y-6">

            {/* Internal stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Published',  value: data.internal.published,  icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                { label: 'Failed',     value: data.internal.failed,     icon: XCircle,     color: 'text-red-500',     bg: 'bg-red-50'     },
                { label: 'Scheduled',  value: data.internal.scheduled,  icon: Clock,       color: 'text-blue-500',    bg: 'bg-blue-50'    },
                { label: 'Drafts',     value: data.internal.draft,      icon: FileText,    color: 'text-gray-500',    bg: 'bg-gray-50'    },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-1">{label} · {PERIOD_LABELS[period]}</p>
                </div>
              ))}
            </div>

            {/* Platform breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{data.internal.igCount}</p>
                  <p className="text-xs text-gray-500">Instagram posts published</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Facebook className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{data.internal.fbCount}</p>
                  <p className="text-xs text-gray-500">Facebook posts published</p>
                </div>
              </div>
            </div>

            {/* Meta Graph stats */}
            {metaAvailable
              ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 text-sm">Meta Performance · Last {data.days} days</h2>
                    {data.meta?.fbError && <p className="text-xs text-red-500 mt-1">Facebook: {data.meta.fbError}</p>}
                    {data.meta?.igError && <p className="text-xs text-red-500 mt-1">Instagram: {data.meta.igError}</p>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-gray-100">
                    {[
                      { label: 'FB Reach',        value: fbReach.toLocaleString()       },
                      { label: 'FB Impressions',   value: fbImpressions.toLocaleString() },
                      { label: 'FB Engaged',       value: fbEngaged.toLocaleString()     },
                      { label: 'IG Reach',         value: igReach.toLocaleString()       },
                      { label: 'IG Impressions',   value: igImpressions.toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="px-5 py-4">
                        <p className="text-xs text-gray-400 font-medium">{label}</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
              : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <p className="text-sm font-semibold text-amber-700">Meta data not connected</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Add <code className="bg-amber-100 px-1 rounded">META_PAGE_ACCESS_TOKEN</code>,{' '}
                    <code className="bg-amber-100 px-1 rounded">META_PAGE_ID</code>, and{' '}
                    <code className="bg-amber-100 px-1 rounded">META_INSTAGRAM_ACCOUNT_ID</code> to Vercel env vars to see reach and impressions.
                  </p>
                </div>
              )
            }

            {/* Published posts list */}
            {data.internal.recentPosts.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900 text-sm">Published Posts · Last {data.days} days</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {data.internal.recentPosts.map(post => (
                    <div key={post.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        post.platform === 'instagram' ? 'bg-pink-50 text-pink-600'
                        : post.platform === 'facebook' ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                      }`}>
                        {post.platform === 'both' ? 'IG+FB' : post.platform.slice(0,2).toUpperCase()}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase bg-gray-50 px-1.5 py-0.5 rounded">
                        {post.postType}
                      </span>
                      <p className="flex-1 text-xs text-gray-700 truncate">{post.caption.slice(0, 80)}</p>
                      <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(post.publishedAt)}</span>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      }
    </div>
  )
}
