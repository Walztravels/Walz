'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CampaignRow {
  id: string
  status: string
  objective: string
  destination: string
  platforms: string[]
  tokensUsed: number
  costUsd: string
  generatedAt: string | null
  approvedBy: string | null
  publishedAt: string | null
  createdAt: string
  createdBy: string | null
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  review: 'bg-yellow-900 text-yellow-300',
  approved: 'bg-blue-900 text-blue-300',
  published: 'bg-green-900 text-green-300',
  rejected: 'bg-red-900 text-red-300',
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/orbit/campaigns')
      .then(r => r.json())
      .then(d => { if (d.campaigns) setCampaigns(d.campaigns) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaign Studio</h1>
          <p className="text-sm text-gray-400 mt-1">Generate and manage marketing campaigns across all platforms</p>
        </div>
        <Link
          href="/admin/orbit/campaigns/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          New Campaign
        </Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-gray-400 text-sm">No campaigns yet.</p>
            <Link href="/admin/orbit/campaigns/new" className="text-indigo-400 underline text-sm">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Objective</th>
                <th className="px-5 py-3 font-medium">Destination</th>
                <th className="px-5 py-3 font-medium">Platforms</th>
                <th className="px-5 py-3 font-medium">Cost</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[c.status] ?? 'bg-gray-700 text-gray-300'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-200 max-w-[200px] truncate">{c.objective}</td>
                  <td className="px-5 py-3 text-gray-400">{c.destination || '—'}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{c.platforms.join(', ') || '—'}</td>
                  <td className="px-5 py-3 tabular-nums text-gray-400 text-xs">
                    {c.tokensUsed > 0 ? (
                      <>
                        <span>${Number(c.costUsd).toFixed(4)}</span>
                        <span className="text-gray-600 ml-1">({c.tokensUsed.toLocaleString()} tok)</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/orbit/campaigns/${c.id}`} className="text-indigo-400 hover:underline text-xs">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
