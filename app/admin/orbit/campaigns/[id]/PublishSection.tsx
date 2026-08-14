'use client'

import { useEffect, useState } from 'react'

interface PublishLog {
  id: string
  platform: string
  bufferUpdateId: string | null
  status: string
  error: string | null
  sentAt: string
  createdBy: string
}

interface Props {
  campaignId: string
  platforms: string[]
  campaignStatus: string
  onPublished: () => void
}

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸',
  facebook:  '👍',
  linkedin:  '💼',
  twitter:   '🐦',
}

const STATUS_STYLE: Record<string, string> = {
  sent:    'bg-green-900 text-green-300',
  skipped: 'bg-gray-700 text-gray-400',
  error:   'bg-red-900 text-red-300',
}

export function PublishSection({ campaignId, platforms, campaignStatus, onPublished }: Props) {
  const [logs, setLogs]           = useState<PublishLog[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [selected, setSelected]   = useState<string[]>(platforms.filter(p => ['instagram','facebook','linkedin','twitter'].includes(p)))
  const [publishing, setPublishing] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [result, setResult]       = useState<string | null>(null)

  const canPublish = campaignStatus === 'approved' || campaignStatus === 'published'

  useEffect(() => {
    fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`)
      .then(r => r.json())
      .then(d => { if (d.logs) setLogs(d.logs) })
      .catch(() => {})
      .finally(() => setLogsLoaded(true))
  }, [campaignId])

  function togglePlatform(p: string) {
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function publish() {
    setPublishing(true); setError(null); setResult(null)
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: selected }),
      })
      const data = await res.json() as { results?: Array<{ platform: string; status: string; error?: string }>; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')

      const sent    = data.results?.filter(r => r.status === 'sent').map(r => r.platform) ?? []
      const skipped = data.results?.filter(r => r.status === 'skipped').length ?? 0
      const errors  = data.results?.filter(r => r.status === 'error').length ?? 0

      if (sent.length > 0) {
        setResult(`Queued on Buffer: ${sent.join(', ')}${errors > 0 ? ` · ${errors} error(s)` : ''}`)
        onPublished()
      } else if (errors > 0) {
        setError(`All ${errors} platforms failed — check Buffer configuration`)
      } else {
        setResult(`${skipped} platform(s) skipped — check channel IDs in settings`)
      }

      // Refresh log
      const logsRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`)
      const logsData = await logsRes.json() as { logs?: PublishLog[] }
      if (logsData.logs) setLogs(logsData.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white text-sm">Publish to Buffer</h2>
          <p className="text-xs text-gray-500 mt-0.5">Queue approved content directly to your social channels</p>
        </div>
        {canPublish && selected.length > 0 && (
          <button
            onClick={publish}
            disabled={publishing}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {publishing ? 'Queuing…' : `Queue to ${selected.length} platform${selected.length !== 1 ? 's' : ''} →`}
          </button>
        )}
      </div>

      {!canPublish && (
        <p className="text-xs text-yellow-500/80 bg-yellow-950/30 border border-yellow-800/30 rounded-lg px-3 py-2">
          Campaign must be approved before publishing to Buffer.
        </p>
      )}

      {canPublish && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Select platforms to queue:</p>
          <div className="flex flex-wrap gap-2">
            {platforms.filter(p => PLATFORM_ICON[p]).map(p => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                  selected.includes(p)
                    ? 'bg-indigo-900/60 border-indigo-600 text-indigo-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span>{PLATFORM_ICON[p]}</span> {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">{error}</div>
      )}
      {result && (
        <div className="bg-green-950 border border-green-800 text-green-300 text-xs rounded-lg px-3 py-2">{result}</div>
      )}

      {/* Publish log */}
      {logsLoaded && logs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Publish History</p>
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-2 bg-gray-950 rounded-lg px-3 py-2 text-xs">
                <span className="w-4 text-center">{PLATFORM_ICON[log.platform] ?? '📢'}</span>
                <span className="text-gray-300 capitalize w-20 flex-shrink-0">{log.platform}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[log.status] ?? 'bg-gray-700 text-gray-400'}`}>
                  {log.status}
                </span>
                {log.bufferUpdateId && (
                  <span className="text-gray-600 font-mono text-[10px]">{log.bufferUpdateId.slice(0, 10)}</span>
                )}
                {log.error && <span className="text-red-400 truncate max-w-[180px]" title={log.error}>{log.error}</span>}
                <span className="text-gray-600 ml-auto flex-shrink-0">
                  {new Date(log.sentAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {logsLoaded && logs.length === 0 && (
        <p className="text-xs text-gray-600">No publish history. Queue a platform above.</p>
      )}
    </div>
  )
}
