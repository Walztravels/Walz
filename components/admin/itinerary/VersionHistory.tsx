'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ItineraryVersion {
  id: string
  versionNumber: number
  savedBy: string
  note?: string | null
  createdAt: string // ISO string
  snapshot: Record<string, unknown>
}

interface Props {
  itinId: string
  onRestore?: (snapshot: Record<string, unknown>) => void
}

// ── Relative time ──────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return 'just now'
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
    const months = Math.floor(days / 30)
    return `${months} month${months !== 1 ? 's' : ''} ago`
  } catch {
    return iso
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Restore confirmation modal ─────────────────────────────────────────────────
function RestoreModal({
  version,
  onConfirm,
  onCancel,
}: {
  version: ItineraryVersion
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0B1F3A] border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-5">
          <span className="text-amber-400 text-2xl mt-0.5">⚠️</span>
          <div>
            <h3 className="text-white font-bold text-lg">Restore this version?</h3>
            <p className="text-white/60 text-sm mt-1">
              You are about to restore{' '}
              <span className="text-amber-400 font-semibold">Version {version.versionNumber}</span>{' '}
              saved {relativeTime(version.createdAt)} by{' '}
              <span className="text-white font-medium">{version.savedBy}</span>.
            </p>
          </div>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5">
          <p className="text-red-300 text-sm font-medium">
            This will overwrite all current itinerary data. This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            Yes, Restore
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save version controls ──────────────────────────────────────────────────────
function SaveVersionForm({
  itinId,
  onSaved,
}: {
  itinId: string
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/itineraries/${itinId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setNote('')
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [itinId, note, onSaved])

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-4">
      <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
        Save Current Version
      </p>
      <div className="flex gap-3">
        <input
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-400/60 transition-colors"
          placeholder="Optional note (e.g. 'Before price update')"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          maxLength={200}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VersionHistory({ itinId, onRestore }: Props) {
  const [versions, setVersions] = useState<ItineraryVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<ItineraryVersion | null>(null)
  const fetchedRef = useRef(false)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/itineraries/${itinId}/versions`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load versions')
      setVersions((data.versions ?? []).slice(0, 20))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [itinId])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchVersions()
  }, [fetchVersions])

  const handleConfirmRestore = useCallback(() => {
    if (!restoreTarget) return
    onRestore?.(restoreTarget.snapshot)
    setRestoreTarget(null)
  }, [restoreTarget, onRestore])

  return (
    <>
      {/* Restore modal */}
      {restoreTarget && (
        <RestoreModal
          version={restoreTarget}
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}

      <div className="space-y-4">
        {/* Save controls */}
        <SaveVersionForm itinId={itinId} onSaved={fetchVersions} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white/70 text-sm font-semibold uppercase tracking-wider">
            Version History
          </h3>
          <button
            type="button"
            onClick={fetchVersions}
            className="text-white/40 hover:text-white/70 text-xs transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 rounded-xl p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-white/10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/10 rounded w-1/3" />
                    <div className="h-3 bg-white/10 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-300 text-sm">
            {error}
            <button
              type="button"
              onClick={fetchVersions}
              className="ml-3 text-red-400 hover:text-red-300 underline text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && versions.length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">🕐</div>
            <p className="text-white/40 text-sm">No versions saved yet.</p>
            <p className="text-white/25 text-xs mt-1">
              Save a version above to create a restore point.
            </p>
          </div>
        )}

        {/* Timeline */}
        {!loading && !error && versions.length > 0 && (
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-4 top-5 bottom-5 w-px bg-white/10" />

            <div className="space-y-2">
              {versions.map((v, idx) => {
                const isLatest = idx === 0
                return (
                  <div key={v.id} className="relative flex gap-4 pl-11">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-2.5 top-4 w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        isLatest
                          ? 'bg-amber-400 border-amber-400'
                          : 'bg-[#0B1F3A] border-white/30'
                      }`}
                    />

                    {/* Card */}
                    <div
                      className={`flex-1 rounded-xl p-4 border transition-colors ${
                        isLatest
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Version + badge */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-semibold text-sm">
                              Version {v.versionNumber}
                            </span>
                            {isLatest && (
                              <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
                                Latest
                              </span>
                            )}
                          </div>

                          {/* Meta */}
                          <p className="text-white/50 text-xs">
                            Saved by{' '}
                            <span className="text-white/70 font-medium">{v.savedBy}</span>
                            {' · '}
                            <span title={fmtDate(v.createdAt)}>{relativeTime(v.createdAt)}</span>
                          </p>

                          {/* Note */}
                          {v.note && (
                            <p className="text-white/60 text-xs mt-1.5 italic">"{v.note}"</p>
                          )}
                        </div>

                        {/* Restore button (not for latest) */}
                        {!isLatest && onRestore && (
                          <button
                            type="button"
                            onClick={() => setRestoreTarget(v)}
                            className="flex-shrink-0 bg-white/10 hover:bg-white/15 border border-white/20 text-white/70 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
