'use client'

import { useState, useEffect } from 'react'
import { CheckSquare, CheckCircle, Loader2, ChevronDown } from 'lucide-react'

interface Application {
  id: string
  title: string
  refNumber: string
}

interface ChecklistItem {
  id: string
  label: string
  description: string | null
  required: boolean
  completedAt: string | null
  order: number
}

export default function PortalChecklistPage() {
  const [applications, setApps]     = useState<Application[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([])
  const [appTitle, setAppTitle]     = useState('')
  const [loading, setLoading]       = useState(true)
  const [listLoading, setListLoad]  = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/applications')
      .then(r => r.json())
      .then(d => {
        const apps = d.applications ?? []
        setApps(apps)
        if (apps.length) { setSelectedId(apps[0].id); loadChecklist(apps[0].id, apps[0].title) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadChecklist = (id: string, title: string) => {
    setListLoad(true)
    setAppTitle(title)
    fetch(`/api/portal/checklist/${id}`)
      .then(r => r.json())
      .then(d => { setChecklist(d.checklist ?? []); setListLoad(false) })
      .catch(() => setListLoad(false))
  }

  const handleSelectApp = (id: string) => {
    const app = applications.find(a => a.id === id)
    if (!app) return
    setSelectedId(id)
    loadChecklist(id, app.title)
  }

  const toggleItem = async (itemId: string) => {
    setToggling(itemId)
    const res = await fetch(`/api/portal/checklist/${itemId}/complete`, { method: 'PATCH' })
    const data = await res.json() as { item: { id: string; completedAt: string | null } }
    if (data.item) {
      setChecklist(prev => prev.map(c => c.id === itemId ? { ...c, completedAt: data.item.completedAt } : c))
    }
    setToggling(null)
  }

  const done  = checklist.filter(c => c.completedAt).length
  const total = checklist.length
  const pct   = total ? Math.round((done / total) * 100) : 0

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Checklist</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track what needs to be done for each application</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-2xl">
        {applications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No applications found</p>
          </div>
        ) : (
          <>
            {/* Application selector */}
            <div className="relative mb-6">
              <select
                value={selectedId}
                onChange={e => handleSelectApp(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] appearance-none pr-10"
              >
                {applications.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({a.refNumber})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Progress summary */}
            {total > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-[#0B1F3A]">{appTitle}</span>
                  <span className="text-sm font-bold text-[#C9A84C]">{done}/{total} complete</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-[#C9A84C]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {pct === 100 && (
                  <p className="text-xs text-green-600 font-semibold mt-2 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> All items complete!
                  </p>
                )}
              </div>
            )}

            {/* Checklist items */}
            {listLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
              </div>
            ) : checklist.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No checklist items for this application yet</p>
                <p className="text-xs text-gray-400 mt-1">Our team will add items once your application is active</p>
              </div>
            ) : (
              <div className="space-y-2">
                {checklist.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    disabled={toggling === item.id}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${item.completedAt ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-[#C9A84C]/40'}`}
                  >
                    {toggling === item.id ? (
                      <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin flex-shrink-0 mt-0.5" />
                    ) : item.completedAt ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${item.completedAt ? 'text-green-700 line-through' : 'text-[#0B1F3A]'}`}>
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                      )}
                      {item.required && !item.completedAt && (
                        <span className="text-[10px] text-amber-600 font-semibold mt-0.5 inline-block">Required</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
