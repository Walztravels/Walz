'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'

interface FlaggedClaim { text: string; reason: string; sourceDate?: string }
interface Version { id: string; version: number; createdAt: string }
interface Draft {
  id: string; status: string; version: number; content: string | null
  flaggedClaims: FlaggedClaim[]; scheduledAt: string | null
  versions: Version[]; approvedBy: string | null; approvedAt: string | null
}
interface Brief {
  id: string; title: string; status: string; contentType: string
  primaryKeyword: string | null; supportingKeywords: string[]; intent: string
  targetUrl: string | null; metaTitle: string | null; metaDescription: string | null
  outline: unknown; faqs: unknown; internalLinks: unknown
  externalSources: unknown; structuredData: unknown
  drafts: Draft[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:       'bg-gray-700 text-gray-300',
  in_progress: 'bg-blue-900/60 text-blue-300',
  review:      'bg-yellow-900/60 text-yellow-300',
  approved:    'bg-green-900/60 text-green-300',
  published:   'bg-indigo-900/60 text-indigo-300',
  rejected:    'bg-red-900/60 text-red-300',
}

const DRAFT_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:       ['review'],
  review:      ['approved', 'rejected', 'draft'],
  approved:    ['review'],
  rejected:    ['draft'],
  published:   [],
}

export default function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [brief, setBrief]         = useState<Brief | null>(null)
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState<'outline' | 'draft' | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'outline' | 'draft'>('outline')
  const [activeDraft, setActiveDraft] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function load() {
    const res = await fetch(`/api/admin/orbit/briefs/${id}`)
    const data = await res.json()
    if (data.brief) {
      setBrief(data.brief)
      if (data.brief.drafts?.length && !activeDraft) {
        const d = data.brief.drafts[0]
        setActiveDraft(d.id)
        setEditContent(d.content ?? '')
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  function currentDraft(): Draft | null {
    return brief?.drafts.find(d => d.id === activeDraft) ?? null
  }

  async function generateOutline() {
    setGenerating('outline'); setError('')
    try {
      const res = await fetch(`/api/admin/orbit/briefs/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
      setActiveTab('outline')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setGenerating(null) }
  }

  async function generateDraft() {
    setGenerating('draft'); setError('')
    try {
      const res = await fetch(`/api/admin/orbit/briefs/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
      setActiveTab('draft')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setGenerating(null) }
  }

  async function saveDraft() {
    if (!activeDraft) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/orbit/drafts/${activeDraft}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  async function moveDraftStatus(newStatus: string) {
    if (!activeDraft) return
    setError('')
    try {
      const res = await fetch(`/api/admin/orbit/drafts/${activeDraft}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function publishDraft() {
    if (!activeDraft) return
    setPublishingId(activeDraft); setError('')
    try {
      const res = await fetch(`/api/admin/orbit/drafts/${activeDraft}/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setPublishingId(null) }
  }

  if (loading) return <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
  if (!brief)  return <div className="py-12 text-center text-red-400 text-sm">Brief not found.</div>

  const draft = currentDraft()
  const allowedTransitions = draft ? (DRAFT_STATUS_TRANSITIONS[draft.status] ?? []) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/admin/orbit/content')}
          className="text-gray-500 hover:text-gray-300 text-sm mt-0.5 transition-colors shrink-0">← Back</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[brief.status] ?? 'bg-gray-700 text-gray-400'}`}>
              {brief.status.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-500">{brief.contentType.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="text-xl font-bold text-white">{brief.title}</h1>
          {brief.primaryKeyword && (
            <p className="text-xs text-gray-500 font-mono mt-1">{brief.primaryKeyword}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={generateOutline} disabled={!!generating}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
            {generating === 'outline' ? 'Generating…' : 'Regenerate Outline'}
          </button>
          <button onClick={generateDraft} disabled={!!generating}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
            {generating === 'draft' ? 'Writing draft…' : '+ Generate Draft'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Main panel */}
        <div className="col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
            {(['outline', 'draft'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 text-sm rounded-md font-medium capitalize transition-colors ${activeTab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {t}
                {t === 'draft' && brief.drafts.length > 0 && (
                  <span className="ml-1.5 text-xs bg-gray-700 rounded-full px-1.5 py-0.5">{brief.drafts.length}</span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'outline' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
              {!brief.outline ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-gray-400 text-sm">No outline yet.</p>
                  <button onClick={generateOutline} disabled={!!generating}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    {generating === 'outline' ? 'Generating…' : 'Generate Outline'}
                  </button>
                </div>
              ) : (
                <>
                  {brief.metaDescription && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Meta Description</p>
                      <p className="text-sm text-gray-300 bg-gray-800 rounded-lg px-3 py-2">{brief.metaDescription}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Outline</p>
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{JSON.stringify(brief.outline, null, 2)}</pre>
                  </div>
                  {Array.isArray(brief.faqs) && (brief.faqs as unknown[]).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">FAQs</p>
                      <div className="space-y-2">
                        {(brief.faqs as {q: string; a: string}[]).map((faq, i) => (
                          <div key={i} className="bg-gray-800 rounded-lg p-3">
                            <p className="text-xs font-medium text-white mb-1">{faq.q}</p>
                            <p className="text-xs text-gray-400">{faq.a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(brief.internalLinks) && (brief.internalLinks as unknown[]).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Internal Links</p>
                      <div className="flex flex-wrap gap-2">
                        {(brief.internalLinks as {url: string; anchor: string}[]).map((l, i) => (
                          <span key={i} className="bg-gray-800 text-xs text-indigo-300 rounded px-2 py-1">{l.anchor} → {l.url}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'draft' && (
            <div className="space-y-3">
              {brief.drafts.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-2">
                  <p className="text-gray-400 text-sm">No draft yet.</p>
                  <button onClick={generateDraft} disabled={!!generating}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    {generating === 'draft' ? 'Writing…' : 'Generate Draft'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Draft selector */}
                  {brief.drafts.length > 1 && (
                    <div className="flex gap-2">
                      {brief.drafts.map(d => (
                        <button key={d.id} onClick={() => { setActiveDraft(d.id); setEditContent(d.content ?? '') }}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${activeDraft === d.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          v{d.version}
                        </button>
                      ))}
                    </div>
                  )}

                  {draft && (
                    <>
                      {/* Flagged claims */}
                      {draft.flaggedClaims.length > 0 && (
                        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4">
                          <p className="text-xs font-semibold text-yellow-300 mb-2">⚠ Flagged Claims — require human verification before publishing</p>
                          <div className="space-y-2">
                            {draft.flaggedClaims.map((c, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-yellow-200 font-mono">"{c.text}"</span>
                                <span className="text-yellow-600 ml-2">— {c.reason}</span>
                                {c.sourceDate && <span className="text-yellow-700 ml-2">({c.sourceDate})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content editor */}
                      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[draft.status] ?? 'bg-gray-700 text-gray-300'}`}>
                              {draft.status}
                            </span>
                            <span className="text-xs text-gray-500">v{draft.version}</span>
                            {draft.approvedBy && (
                              <span className="text-xs text-green-500">Approved by {draft.approvedBy}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {allowedTransitions.map(s => (
                              <button key={s} onClick={() => moveDraftStatus(s)}
                                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition-colors capitalize">
                                → {s}
                              </button>
                            ))}
                            {draft.status === 'approved' && (
                              <button onClick={publishDraft} disabled={publishingId === draft.id}
                                className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors">
                                {publishingId === draft.id ? 'Publishing…' : 'Publish to Blog'}
                              </button>
                            )}
                          </div>
                        </div>
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={24}
                          className="w-full bg-transparent px-5 py-4 text-sm text-gray-300 font-mono resize-none focus:outline-none"
                        />
                        <div className="flex justify-end border-t border-gray-800 px-4 py-2">
                          <button onClick={saveDraft} disabled={saving}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Brief Details</p>
            {brief.targetUrl && (
              <div>
                <p className="text-xs text-gray-500">Target URL</p>
                <p className="text-sm text-indigo-300 font-mono">{brief.targetUrl}</p>
              </div>
            )}
            {brief.primaryKeyword && (
              <div>
                <p className="text-xs text-gray-500">Primary Keyword</p>
                <p className="text-sm text-white font-mono">{brief.primaryKeyword}</p>
              </div>
            )}
            {brief.supportingKeywords.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Supporting Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {brief.supportingKeywords.map((k, i) => (
                    <span key={i} className="bg-gray-800 text-xs text-gray-300 rounded px-2 py-0.5 font-mono">{k}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Intent</p>
              <p className="text-sm text-white capitalize">{brief.intent}</p>
            </div>
          </div>

          {/* Version history */}
          {draft && draft.versions.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Version History</p>
              <div className="space-y-1.5">
                {draft.versions.map(v => (
                  <div key={v.id} className="flex justify-between text-xs">
                    <span className="text-gray-400">v{v.version}</span>
                    <span className="text-gray-600">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
