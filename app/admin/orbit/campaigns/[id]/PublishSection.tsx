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
  attempt?: number
  channelId?: string | null
  mediaIds?: string[]
  providerStatus?: string | null
}

interface PreflightEntry { platform: string; channelId: string | null; blockers: string[] }

interface Props {
  campaignId: string
  platforms: string[]
  campaignStatus: string
  content: Record<string, unknown>
  onPublished: () => void
}

// Maps DB platform names (long form from the campaign form) → Buffer keys
const TO_KEY: Record<string, string> = {
  'Instagram':          'instagram',
  'Meta (Facebook)':    'facebook',
  'LinkedIn':           'linkedin',
  'X (Twitter)':        'twitter',
  'TikTok':             'tiktok',
  'Google Business':    'googlebusiness',
  'Google My Business': 'googlebusiness',
  instagram:      'instagram',
  facebook:       'facebook',
  linkedin:       'linkedin',
  twitter:        'twitter',
  tiktok:         'tiktok',
  googlebusiness: 'googlebusiness',
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram:      'Instagram',
  facebook:       'Meta (Facebook)',
  linkedin:       'LinkedIn',
  twitter:        'X (Twitter)',
  tiktok:         'TikTok',
  googlebusiness: 'Google Business',
}

const PLATFORM_ICON: Record<string, string> = {
  instagram:      '📸',
  facebook:       '👍',
  linkedin:       '💼',
  twitter:        '🐦',
  tiktok:         '🎵',
  googlebusiness: '🏢',
}

// Per-channel status chips. 'sent' is a legacy value — it meant the post
// was accepted into Buffer's queue, which is NOT proof of publication, so
// it is displayed as queued (unconfirmed), never as Published.
const STATUS_STYLE: Record<string, string> = {
  sent:              'bg-blue-900 text-blue-300',
  queued_buffer:     'bg-blue-900 text-blue-300',
  published:         'bg-green-900 text-green-300',
  submitting:        'bg-indigo-900 text-indigo-300',
  skipped:           'bg-gray-700 text-gray-400',
  error:             'bg-red-900 text-red-300',
  failed:            'bg-red-900 text-red-300',
  unknown:           'bg-amber-900 text-amber-300',
  validation_failed: 'bg-amber-900 text-amber-300',
}

const STATUS_LABEL: Record<string, string> = {
  sent:              'queued on Buffer (unconfirmed)',
  queued_buffer:     'queued on Buffer (unconfirmed)',
  published:         'published',
  submitting:        'submitting…',
  skipped:           'skipped',
  error:             'failed',
  failed:            'failed',
  unknown:           'unknown — reconcile',
  validation_failed: 'blocked by validation',
}

// Twitter-safe truncation (Buffer counts chars differently)
const TWITTER_SAFE = 252

function toBufferKeys(platforms: string[]): string[] {
  return [...new Set(platforms.map(p => TO_KEY[p]).filter(Boolean))]
}

// Extract the current posted text for a given platform from the content JSON.
// Mirrors the server-side EXTRACT map so we can pre-fill the edit textarea.
function extractForPlatform(platform: string, content: Record<string, unknown>): string {
  if (platform === 'instagram') {
    return ((content.instagram_captions as string[] | undefined)?.[0]) ?? ''
  }
  if (platform === 'facebook') {
    const ads = content.meta_ads as Array<{ headline: string; body: string }> | undefined
    const ad = ads?.[0]
    return ad ? `${ad.headline}\n\n${ad.body}` : ''
  }
  if (platform === 'linkedin') return String(content.linkedin_post ?? '')
  if (platform === 'twitter') {
    const t = String(content.x_post ?? '')
    return t.length > TWITTER_SAFE ? t.slice(0, TWITTER_SAFE - 1) + '…' : t
  }
  if (platform === 'tiktok') {
    return String(content.tiktok_caption ?? (content.instagram_captions as string[] | undefined)?.[0] ?? '')
  }
  if (platform === 'googlebusiness') {
    if (content.google_business_post) return String(content.google_business_post)
    const ads = content.meta_ads as Array<{ headline: string; body: string }> | undefined
    return ads?.[0] ? `${ads[0].headline}\n\n${ads[0].body}` : ''
  }
  return ''
}

export function PublishSection({ campaignId, platforms, campaignStatus, content, onPublished }: Props) {
  const [logs, setLogs]             = useState<PublishLog[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [selected, setSelected]     = useState<string[]>(toBufferKeys(platforms))
  const [channelIds, setChannelIds] = useState<Record<string, string>>({})
  const [publishing, setPublishing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<string | null>(null)
  const [resultTone, setResultTone] = useState<'success' | 'partial' | 'failure'>('success')
  const [blockers, setBlockers]     = useState<PreflightEntry[]>([])
  const [validating, setValidating] = useState(false)
  const [retrying, setRetrying]     = useState(false)

  // Edit & Re-send state
  const [editOpen, setEditOpen]         = useState(false)
  const [editPlatform, setEditPlatform] = useState('')
  const [editText, setEditText]         = useState('')
  const [editSending, setEditSending]   = useState(false)
  const [editError, setEditError]       = useState<string | null>(null)
  const [editResult, setEditResult]     = useState<string | null>(null)

  const canPublish = campaignStatus === 'approved' || campaignStatus === 'published'

  // Latest state per channel — drives the Retry-failed-only affordance
  const latestByChannel = new Map<string, PublishLog>()
  for (const log of logs) if (!latestByChannel.has(log.platform)) latestByChannel.set(log.platform, log)
  const hasRetryableFailures = [...latestByChannel.values()].some(l => l.status === 'failed' || l.status === 'error' || l.status === 'validation_failed')

  // Load configured Buffer channel IDs so we can show all connected platforms
  useEffect(() => {
    fetch('/api/admin/orbit/settings')
      .then(r => r.json())
      .then(d => {
        const ch = (d.settings?.bufferChannels ?? {}) as Record<string, string>
        setChannelIds(ch)
        setSelected(prev => {
          const fromChannels = Object.keys(ch).filter(k => ch[k] && PLATFORM_LABEL[k])
          return [...new Set([...prev, ...fromChannels])]
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Platforms to show: campaign's original platforms + any platform with a configured channel ID
  function availablePlatforms(): string[] {
    const fromCampaign = toBufferKeys(platforms)
    const fromChannels = Object.keys(channelIds).filter(k => channelIds[k] && PLATFORM_LABEL[k])
    return [...new Set([...fromCampaign, ...fromChannels])]
  }

  function loadLogs() {
    fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`)
      .then(r => r.json())
      .then(d => { if (d.logs) setLogs(d.logs) })
      .catch(() => {})
      .finally(() => setLogsLoaded(true))
  }

  useEffect(() => { loadLogs() }, [campaignId, campaignStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePlatform(p: string) {
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function openEdit() {
    const available = availablePlatforms()
    const first = available[0] ?? ''
    setEditPlatform(first)
    setEditText(first ? extractForPlatform(first, content) : '')
    setEditError(null)
    setEditResult(null)
    setEditOpen(true)
  }

  function onEditPlatformChange(p: string) {
    setEditPlatform(p)
    setEditText(extractForPlatform(p, content))
    setEditError(null)
    setEditResult(null)
  }

  interface PublishResponse {
    results?: Array<{ platform: string; status: string; error?: string }>
    error?: string
    summary?: string
    tone?: 'success' | 'partial' | 'failure'
    preflight?: PreflightEntry[]
    skippedProtected?: Array<{ platform: string; reason: string }>
    counts?: { queued: number; failed: number; skipped: number; unknown: number }
  }

  async function runPublish(bodyExtra: Record<string, unknown>) {
    setError(null); setResult(null); setBlockers([])
    const res  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms: selected, ...bodyExtra }),
    })
    const data = await res.json() as PublishResponse
    if (res.status === 422 && data.preflight) {
      // Blockers are shown BEFORE anything is sent — never silently skipped
      setBlockers(data.preflight.filter(p => p.blockers.length > 0))
      setError(data.error ?? 'Validation blockers found — nothing was sent.')
      return null
    }
    if (!res.ok) throw new Error(data.error ?? 'Publish failed')
    return data
  }

  async function validateOnly() {
    setValidating(true)
    try {
      const data = await runPublish({ dryRun: true })
      if (data?.preflight) {
        const withBlockers = data.preflight.filter(p => p.blockers.length > 0)
        setBlockers(withBlockers)
        if (withBlockers.length === 0) {
          setResultTone('success')
          setResult('Validation passed for every selected channel.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed')
    } finally { setValidating(false) }
  }

  async function publish() {
    setPublishing(true)
    try {
      const data = await runPublish({})
      if (data) {
        setResultTone(data.tone ?? 'partial')
        setResult(data.summary ?? 'Done')
        if ((data.counts?.queued ?? 0) > 0) onPublished()
      }
      loadLogs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setPublishing(false)
    }
  }

  async function retryFailedOnly() {
    setRetrying(true)
    try {
      const data = await runPublish({ retryFailedOnly: true })
      if (data) {
        setResultTone(data.tone ?? 'partial')
        const protectedNote = (data.skippedProtected?.length ?? 0) > 0
          ? ` Protected (not resubmitted): ${data.skippedProtected!.map(sp => `${sp.platform} — ${sp.reason}`).join('; ')}`
          : ''
        setResult(`${data.summary ?? 'Done'}${protectedNote}`)
        if ((data.counts?.queued ?? 0) > 0) onPublished()
      }
      loadLogs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed')
    } finally { setRetrying(false) }
  }

  // Provider-first reconciliation: rows WITH a Buffer post id are checked
  // against Buffer itself (its 'sent' is the only path to Published); rows
  // without one require written evidence of what was checked.
  async function reconcileWithBuffer(logId: string) {
    setError(null)
    const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Reconciliation failed')
    }
    loadLogs()
  }

  async function resolveManually(logId: string, resolvedStatus: 'failed' | 'queued_buffer') {
    const evidence = prompt(
      `Manual override requires evidence. Describe exactly what you checked in Buffer, e.g.\n"Checked Buffer queue for Instagram at 14:32 — post not present."`,
    )
    if (!evidence || evidence.trim().length < 15) {
      if (evidence !== null) setError('Evidence must be at least 15 characters — say what you checked and when.')
      return
    }
    // Marking failed enables a resend that could DUPLICATE a post that
    // actually went out — evidence alone is insufficient; the risk must be
    // explicitly acknowledged, and the override is audited.
    let riskAcknowledgement: string | undefined
    if (resolvedStatus === 'failed') {
      const typed = prompt(
        'Marking failed makes this channel retryable. If the post actually went out, retrying will DUPLICATE it.\n\nType exactly: ACCEPT DUPLICATE RISK',
      )
      if (typed !== 'ACCEPT DUPLICATE RISK') {
        if (typed !== null) setError('Override cancelled — the duplicate-post risk was not acknowledged.')
        return
      }
      riskAcknowledgement = typed
    }
    setError(null)
    const res = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId, resolvedStatus, evidence, riskAcknowledgement }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Override failed')
    }
    loadLogs()
  }

  async function sendEdit() {
    if (!editPlatform || !editText.trim()) return
    setEditSending(true); setEditError(null); setEditResult(null)
    try {
      // Save the edited text back to the campaign content so it's the new default
      const saveRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_content', platform: editPlatform, text: editText }),
      })
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Failed to save edit')
      }

      // Publish to Buffer with the custom text
      const pubRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: [editPlatform], customText: editText }),
      })
      const pubData = await pubRes.json() as { results?: Array<{ platform: string; status: string; error?: string }>; error?: string }
      if (!pubRes.ok) throw new Error(pubData.error ?? 'Publish failed')

      const sent = pubData.results?.filter(r => r.status === 'sent' || r.status === 'queued_buffer') ?? []
      const err  = pubData.results?.find(r => r.status === 'error' || r.status === 'failed' || r.status === 'unknown')

      if (sent.length > 0) {
        setEditResult(`Queued on Buffer for ${PLATFORM_LABEL[editPlatform]} ✓ (delivery not yet confirmed)`)
        onPublished()
        loadLogs()
      } else if (err) {
        throw new Error(err.error ?? 'Buffer rejected the post')
      } else {
        throw new Error('Post was skipped — check channel ID in settings')
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setEditSending(false)
    }
  }

  const twitterOverLimit = editPlatform === 'twitter' && editText.length > TWITTER_SAFE

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white text-sm">Publish to Buffer</h2>
          <p className="text-xs text-gray-500 mt-0.5">Queue approved content directly to your social channels</p>
        </div>
        {canPublish && selected.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={validateOnly}
              disabled={validating || publishing || retrying}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {validating ? 'Checking…' : 'Validate'}
            </button>
            {hasRetryableFailures && (
              <button
                onClick={retryFailedOnly}
                disabled={retrying || publishing || validating}
                className="bg-amber-800 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {retrying ? 'Retrying…' : 'Retry failed channels only'}
              </button>
            )}
            <button
              onClick={publish}
              disabled={publishing || validating || retrying}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {publishing ? 'Queuing…' : `Queue to ${selected.length} platform${selected.length !== 1 ? 's' : ''} →`}
            </button>
          </div>
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
            {availablePlatforms().map(key => (
              <button
                key={key}
                onClick={() => togglePlatform(key)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  selected.includes(key)
                    ? 'bg-indigo-900/60 border-indigo-600 text-indigo-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span>{PLATFORM_ICON[key]}</span> {PLATFORM_LABEL[key]}
              </button>
            ))}
          </div>
          {availablePlatforms().length === 0 && (
            <p className="text-xs text-gray-600">No platforms configured. Add Buffer channel IDs in Orbit → Settings → Integrations.</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">{error}</div>
      )}
      {result && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${
          resultTone === 'success' ? 'bg-green-950 border-green-800 text-green-300'
          : resultTone === 'partial' ? 'bg-amber-950 border-amber-800 text-amber-300'
          : 'bg-red-950 border-red-800 text-red-300'
        }`}>{result}</div>
      )}

      {blockers.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-amber-300">Blockers — nothing was sent:</p>
          {blockers.map(b => (
            <div key={b.platform} className="text-xs text-amber-200/90">
              <span className="font-medium capitalize">{PLATFORM_LABEL[b.platform] ?? b.platform}:</span>
              <ul className="list-disc pl-5">
                {b.blockers.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit & Re-send ───────────────────────────────────────────── */}
      {canPublish && availablePlatforms().length > 0 && (
        <div className="border-t border-gray-800 pt-4">
          {!editOpen ? (
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-300 transition-colors"
            >
              <span>✏️</span> Edit post text &amp; re-send to a specific channel
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-white">Edit &amp; Re-send</p>
                <button onClick={() => setEditOpen(false)} className="text-xs text-gray-600 hover:text-gray-400">✕ Close</button>
              </div>

              {/* Platform picker */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Platform</label>
                <div className="flex flex-wrap gap-1.5">
                  {availablePlatforms().map(key => (
                    <button
                      key={key}
                      onClick={() => onEditPlatformChange(key)}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        editPlatform === key
                          ? 'bg-indigo-900/60 border-indigo-600 text-indigo-200'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <span>{PLATFORM_ICON[key]}</span> {PLATFORM_LABEL[key]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text editor */}
              {editPlatform && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Post text</label>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={6}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  {editPlatform === 'twitter' && (
                    <p className={`text-xs mt-1 ${twitterOverLimit ? 'text-red-400' : 'text-gray-600'}`}>
                      {editText.length} / {TWITTER_SAFE} chars{twitterOverLimit ? ' — too long for X/Twitter' : ''}
                    </p>
                  )}
                </div>
              )}

              {editError && (
                <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">{editError}</div>
              )}
              {editResult && (
                <div className="bg-green-950 border border-green-800 text-green-300 text-xs rounded-lg px-3 py-2">{editResult}</div>
              )}

              <button
                onClick={sendEdit}
                disabled={editSending || !editPlatform || !editText.trim() || twitterOverLimit}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {editSending ? 'Sending…' : `Save &amp; send to ${editPlatform ? PLATFORM_LABEL[editPlatform] : 'platform'} →`}
              </button>
              <p className="text-xs text-gray-600">Saves your edit to this campaign and queues the post on Buffer.</p>
            </div>
          )}
        </div>
      )}

      {/* Publish log */}
      {logsLoaded && logs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Publish History</p>
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-2 bg-gray-950 rounded-lg px-3 py-2 text-xs flex-wrap">
                <span className="w-4 text-center">{PLATFORM_ICON[log.platform] ?? '📢'}</span>
                <span className="text-gray-300 capitalize w-20 flex-shrink-0">{log.platform}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[log.status] ?? 'bg-gray-700 text-gray-400'}`}
                  title={log.channelId ? `Channel ${log.channelId}` : undefined}>
                  {STATUS_LABEL[log.status] ?? log.status}
                </span>
                {(log.attempt ?? 1) > 1 && <span className="text-gray-600">attempt {log.attempt}</span>}
                {log.bufferUpdateId && (
                  <span className="text-gray-600 font-mono text-[10px]" title="Buffer post ID">{log.bufferUpdateId.slice(0, 12)}</span>
                )}
                {(log.mediaIds?.length ?? 0) > 0 && (
                  <span className="text-gray-600" title={log.mediaIds!.join(', ')}>{log.mediaIds!.length} media</span>
                )}
                {log.error && <span className="text-red-400 truncate max-w-[220px]" title={log.error}>{log.error}</span>}
                {(log.status === 'unknown' || log.status === 'queued_buffer' || log.status === 'sent') && log.bufferUpdateId && (
                  <button onClick={() => void reconcileWithBuffer(log.id)}
                    className="text-[10px] text-indigo-300 hover:text-indigo-100 underline"
                    title="Query Buffer for this post's real status — its 'sent' is the only path to Published">
                    Check Buffer status
                  </button>
                )}
                {log.status === 'unknown' && (!log.bufferUpdateId || log.providerStatus === 'not_found' || log.providerStatus === 'lookup_failed') && (
                  <span className="flex gap-1">
                    <button onClick={() => void resolveManually(log.id, 'failed')}
                      className="text-[10px] text-amber-300 hover:text-amber-100 underline"
                      title="Requires written evidence of what you checked in Buffer">Mark failed (evidence)</button>
                    <button onClick={() => void resolveManually(log.id, 'queued_buffer')}
                      className="text-[10px] text-amber-300 hover:text-amber-100 underline"
                      title="Requires written evidence of what you checked in Buffer">Mark queued (evidence)</button>
                  </span>
                )}
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
