'use client'
import { useState, useEffect } from 'react'
import { Search, Download, ToggleRight, ToggleLeft, Loader2 } from 'lucide-react'

interface Subscriber {
  id: string
  email: string
  subscribedAt: string
  source: string | null
  active: boolean
}

export default function NewsletterPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [stats,       setStats]       = useState({ total: 0, active: 0, thisMonth: 0 })

  async function load() {
    setLoading(true)
    const res  = await fetch(`/api/admin/newsletter?search=${encodeURIComponent(search)}`)
    const data = await res.json()
    setSubscribers(data.subscribers ?? [])
    setStats({ total: data.total ?? 0, active: data.active ?? 0, thisMonth: data.thisMonth ?? 0 })
    setLoading(false)
  }
  useEffect(() => { load() }, [search])  // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(sub: Subscriber) {
    await fetch('/api/admin/newsletter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, active: !sub.active }),
    })
    load()
  }

  function exportCSV() {
    const csv = [
      'Email,Date,Source,Active',
      ...subscribers.map(s =>
        `${s.email},${new Date(s.subscribedAt).toLocaleDateString('en-GB')},${s.source ?? 'homepage'},${s.active}`
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Newsletter Subscribers</h1>
          <p className="text-gray-400 text-sm mt-0.5">Clients who opted in from the homepage</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',      value: stats.total,      color: 'border-blue-400'   },
          { label: 'Active',     value: stats.active,     color: 'border-green-400'  },
          { label: 'This Month', value: stats.thisMonth,  color: 'border-[#C9A84C]'  },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-2xl p-4 border-l-4 ${s.color} shadow-sm`}>
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold text-[#0B1F3A] mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search email…"
          className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Source</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Active</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map(sub => (
                <tr key={sub.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-[#0B1F3A] font-medium">{sub.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {new Date(sub.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell capitalize">{sub.source ?? 'homepage'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggle(sub)}>
                      {sub.active
                        ? <ToggleRight className="w-5 h-5 text-green-500 mx-auto" />
                        : <ToggleLeft  className="w-5 h-5 text-gray-300 mx-auto" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {subscribers.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm">No subscribers found</div>
          )}
        </div>
      )}
    </div>
  )
}
