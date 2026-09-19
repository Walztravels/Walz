'use client'

// CompleteClientProfile — Client Action Centre shared layer.
//
// Embeddable "profile completeness" gate reused by PaymentRequestDrawer,
// CreateQuoteDrawer, and VisaFormDrawer whenever the server reports the
// client's profile (not their identity — a VERIFIED/LINKED client can
// still have an incomplete profile) is missing data an action needs.
//
// Renders the compact pattern:
//   Client details required
//   Name ✓ / Email — Missing / Phone — Missing
//   [ Complete client profile ]
// which expands to an inline form with ONLY the missing fields — no
// separate drawer/modal, so the CALLING drawer's own in-progress form
// state (quote draft, visa case fields, payment amount/provider) is never
// touched by mounting/unmounting this component.
//
// On save: POSTs to the shared client-profile route (conversationId comes
// from the URL only — no id field is ever sent from here) and calls
// onComplete() so the caller re-resolves context and re-checks
// completeness. A CONTACT_CONFLICT response is shown inline (existing vs
// attempted) rather than silently failing or overwriting.

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ProfileField } from '@/lib/inbox/client-profile'

export interface ProfileConflictDTO { field: ProfileField; existing: string; attempted: string }

export interface CompleteClientProfileProps {
  conversationId: number
  missingFields: ProfileField[]
  availableFields: Partial<Record<ProfileField, string>>
  /** QA gap fix: fields where the shared layer (lib/inbox/client-profile.ts's
   *  resolveCanonicalContact) found two linked records structurally
   *  disagreeing on the same value — a genuine data-integrity conflict, NOT
   *  an ordinarily-missing field. Optional/defaults to [] so this is purely
   *  additive for the overwhelmingly common empty case. */
  crossRecordConflicts?: ProfileField[]
  onComplete: () => void
}

const FIELD_LABEL: Record<ProfileField, string> = { name: 'Name', email: 'Email', phone: 'Phone' }
const DISPLAY_ORDER: ProfileField[] = ['name', 'email', 'phone']

export function CompleteClientProfile({
  conversationId, missingFields, availableFields, crossRecordConflicts = [], onComplete,
}: CompleteClientProfileProps) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState<Partial<Record<ProfileField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<ProfileConflictDTO[] | null>(null)

  // Accessibility fix: this component is freshly mounted every time a
  // drawer swaps its normal form for this gate (see e.g.
  // PaymentRequestDrawer.tsx's `profileGate ? <CompleteClientProfile .../> :
  // ...` — a different element at that position, so React mounts a fresh
  // instance rather than re-rendering an existing one). Moving focus to the
  // gate's own heading on mount — once, here — gives every one of the four
  // consuming drawers this fix for free, with no per-drawer wiring.
  const headingRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const labelCls = 'block text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1'
  const inputCls = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-walz-border bg-white text-sm text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold/60'

  async function handleSave() {
    if (saving) return
    const body: Record<string, string> = {}
    for (const f of missingFields) {
      const v = (values[f] ?? '').trim()
      if (v) body[f] = v
    }
    if (Object.keys(body).length === 0) {
      setError('Enter at least one missing detail.')
      return
    }
    setSaving(true)
    setError(null)
    setConflicts(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/client-profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'CONTACT_CONFLICT' && Array.isArray(data?.conflicts)) {
          setConflicts(data.conflicts as ProfileConflictDTO[])
          return
        }
        setError(data?.error ?? 'Could not save these details. Try again.')
        return
      }
      onComplete()
    } catch {
      setError('Could not save these details. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    // Collapse back to the compact summary. Deliberately does NOT clear
    // `values` — staff may re-expand and pick up where they left off — and
    // never touches the parent drawer's own form state (this component has
    // no access to it; conversationId/missingFields/availableFields are the
    // only things it reads from the parent, all read-only props).
    setExpanded(false)
    setError(null)
    setConflicts(null)
  }

  return (
    <div className="rounded-xl border border-walz-border bg-walz-off-white p-3 space-y-3">
      <p
        ref={headingRef}
        tabIndex={-1}
        className="text-xs font-bold text-walz-deep-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-walz-gold/60 rounded"
      >
        Client details required
      </p>
      <ul className="space-y-1">
        {DISPLAY_ORDER.map(f => {
          const conflicted = crossRecordConflicts.includes(f)
          return (
            <li key={f} className="text-xs flex items-center justify-between">
              <span className="text-walz-muted-strong">{FIELD_LABEL[f]}</span>
              {conflicted
                ? <span className="text-amber-700 font-medium">⚠ Conflicting records</span>
                : availableFields[f]
                  ? <span className="text-walz-deep-navy font-medium">✓ {availableFields[f]}</span>
                  : <span className="text-red-700">— Missing</span>}
            </li>
          )
        })}
      </ul>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
        >
          Complete client profile
        </button>
      ) : (
        <div className="space-y-2">
          {missingFields.map(f => {
            const conflicted = crossRecordConflicts.includes(f)
            return (
              <div key={f}>
                <label htmlFor={`ccp-${f}`} className={labelCls}>{FIELD_LABEL[f]}</label>
                {conflicted ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-2">
                    This client has conflicting records on file — resolve via Client Identity before completing this field.
                  </p>
                ) : (
                  <input
                    id={`ccp-${f}`}
                    type={f === 'email' ? 'email' : 'text'}
                    value={values[f] ?? ''}
                    onChange={e => setValues(prev => ({ ...prev, [f]: e.target.value }))}
                    className={inputCls}
                  />
                )}
              </div>
            )
          })}
          {conflicts && conflicts.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 space-y-1">
              <p className="text-xs font-semibold text-red-800">This does not match what is already on file</p>
              {conflicts.map(c => (
                <p key={c.field} className="text-[11px] text-red-700">
                  {FIELD_LABEL[c.field]}: on file &ldquo;{c.existing}&rdquo; vs entered &ldquo;{c.attempted}&rdquo;
                </p>
              ))}
            </div>
          )}
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
            >
              {saving ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Saving…</>) : 'Save details'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="min-h-[44px] px-3 text-xs font-semibold text-walz-muted-strong hover:text-walz-deep-navy transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
