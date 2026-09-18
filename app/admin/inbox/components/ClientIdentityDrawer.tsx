'use client'

// ClientIdentityDrawer — INBOX UX-4.1C (first-time + legacy client identity).
//
// Same interaction language as PaymentRequestDrawer/CreateQuoteDrawer:
// right sheet, scrim + Esc close, focus in on open / restore on close,
// Tab trapped inside (:disabled-aware), safe-area padding, motion-safe
// slide. Extends the SAME ConversationClientLink identity surface as
// UX-4.1A's Application Lookup drawer — this is not a second identity
// system, just two more staff-initiated ways to populate the same link:
//
//  - FIND: explicit staff search (name/email/phone/reference) across
//    User/ClientAccount/Lead/VisaApplication/Booking. Staff reviews the
//    list and picks exactly one — nothing is auto-selected, ever.
//  - CREATE: for a genuinely first-time customer. The server runs its own
//    duplicate check before creating anything (never trusts a client
//    claim of "no duplicates"); on an ambiguous or found match, staff is
//    directed to link that record instead of creating a new one.
//
// Both mutations POST to the EXISTING /client-context endpoint with a
// `mode` field — one identity-mutation endpoint, not a new one per action.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Search, UserPlus, Link2 } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface ClientIdentityDrawerProps {
  open: boolean
  initialMode: 'find' | 'create'
  onClose: () => void
  conversationId: number
  /** Called after a successful link/create so the page can refresh the status panel. */
  onLinked: () => void
}

interface Candidate {
  type: 'user' | 'clientAccount' | 'lead' | 'application' | 'booking'
  id: string
  name: string | null
  email: string | null
  phone: string | null
  reference: string | null
  detail: string | null
}

const TYPE_LABEL: Record<Candidate['type'], string> = {
  user: 'Registered client', clientAccount: 'Visa portal account',
  lead: 'Lead', application: 'Visa application', booking: 'Booking',
}

export function ClientIdentityDrawer({ open, initialMode, onClose, conversationId, onLinked }: ClientIdentityDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)
  const [mode, setMode] = useState<'find' | 'create'>(initialMode)

  // Find state
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  const searchSeqRef = useRef(0)
  const [linkingId, setLinkingId] = useState<string | null>(null)

  // Create state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [duplicateMatches, setDuplicateMatches] = useState<Candidate[] | null>(null)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setEntered(false); return }
    setMode(initialMode)
    setQuery(''); setCandidates([]); setLinkingId(null)
    setFirstName(''); setLastName(''); setEmail(''); setPhone('')
    setDuplicateMatches(null); setError(null)
    restoreRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, initialMode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (active == null || !panel.contains(active)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeqRef.current
    if (q.trim().length < 2) { setCandidates([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/client-search?q=${encodeURIComponent(q)}`)
      if (seq !== searchSeqRef.current) return
      const data = await res.json().catch(() => ({}))
      setCandidates(Array.isArray(data?.candidates) ? data.candidates : [])
    } catch {
      if (seq === searchSeqRef.current) setCandidates([])
    } finally {
      if (seq === searchSeqRef.current) setSearching(false)
    }
  }, [conversationId])

  // Debounce the search-as-you-type.
  useEffect(() => {
    if (mode !== 'find') return
    const t = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, mode, runSearch])

  if (!open) return null

  async function linkCandidate(c: Candidate) {
    if (linkingId) return
    setLinkingId(c.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/client-context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'link_existing', targetType: c.type, targetId: c.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Could not link this client. Retry.')
        return
      }
      onLinked()
      onClose()
    } catch {
      setError('Could not link this client. Retry.')
    } finally {
      setLinkingId(null)
    }
  }

  async function handleCreate() {
    if (creating) return
    if (!firstName.trim() || !lastName.trim()) { setError('Enter a first and last name.'); return }
    if (!email.trim() && !phone.trim()) { setError('Enter an email or phone number.'); return }
    setCreating(true)
    setError(null)
    setDuplicateMatches(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/client-context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create_new',
          firstName: firstName.trim(), lastName: lastName.trim(),
          email: email.trim() || undefined, phone: phone.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'DUPLICATE_FOUND') { setDuplicateMatches([data.candidate]); return }
        if (data?.code === 'DUPLICATE_AMBIGUOUS') { setDuplicateMatches(data.candidates ?? []); return }
        setError(data?.error ?? 'Could not create the client. Retry.')
        return
      }
      onLinked()
      onClose()
    } catch {
      setError('Could not create the client. Retry.')
    } finally {
      setCreating(false)
    }
  }

  const inputCls = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-walz-border bg-white text-sm text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold/60'
  const labelCls = 'block text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1'

  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Client identity"
        className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col
          motion-safe:transition-transform motion-safe:duration-200
          ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className="text-sm font-bold text-walz-deep-navy">Client identity</p>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -m-1.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-shrink-0 flex border-b border-walz-border">
          <button
            onClick={() => { setMode('find'); setError(null); setDuplicateMatches(null) }}
            className={`flex-1 min-h-[44px] text-xs font-semibold transition-colors ${mode === 'find' ? 'text-walz-navy border-b-2 border-walz-gold' : 'text-walz-muted-strong'}`}
          >
            Find existing
          </button>
          <button
            onClick={() => { setMode('create'); setError(null); setDuplicateMatches(null) }}
            className={`flex-1 min-h-[44px] text-xs font-semibold transition-colors ${mode === 'create' ? 'text-walz-navy border-b-2 border-walz-gold' : 'text-walz-muted-strong'}`}
          >
            Create new
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

          {mode === 'find' ? (
            <>
              <div>
                <label htmlFor="ci-search" className={labelCls}>Name, email, phone or reference</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-walz-muted-strong" />
                  <input id="ci-search" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Search…" className={`${inputCls} pl-9`} />
                </div>
              </div>
              {searching && (
                <p className="text-xs text-walz-muted-strong" role="status">Searching…</p>
              )}
              {!searching && query.trim().length >= 2 && candidates.length === 0 && (
                <p className="text-xs text-walz-muted-strong">No matches. Try Create new instead.</p>
              )}
              <ul className="space-y-2">
                {candidates.map(c => (
                  <li key={`${c.type}-${c.id}`} className="rounded-lg border border-walz-border p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-walz-deep-navy truncate">{c.name ?? c.email ?? 'Client'}</p>
                      <p className="text-[10px] text-walz-muted-strong truncate">
                        {TYPE_LABEL[c.type]}{c.reference ? ` · ${c.reference}` : ''}{c.detail ? ` · ${c.detail}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => void linkCandidate(c)}
                      disabled={linkingId === c.id}
                      className="flex-shrink-0 min-h-[44px] px-3 rounded-lg bg-walz-navy text-walz-gold text-[11px] font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60 flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" /> {linkingId === c.id ? 'Linking…' : 'Link'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <fieldset disabled={creating} className="space-y-3 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="ci-first" className={labelCls}>First name</label>
                  <input id="ci-first" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="ci-last" className={labelCls}>Last name</label>
                  <input id="ci-last" value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="ci-email" className={labelCls}>Email</label>
                <input id="ci-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ci-phone" className={labelCls}>Phone / WhatsApp</label>
                <input id="ci-phone" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
              </div>
              <p className="text-[10px] text-walz-muted-strong">Email or phone is required.</p>

              {duplicateMatches && duplicateMatches.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">
                    {duplicateMatches.length > 1 ? 'Multiple possible matches — link one instead:' : 'A matching record already exists — link it instead:'}
                  </p>
                  {duplicateMatches.map(c => (
                    <div key={`${c.type}-${c.id}`} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-walz-deep-navy truncate">{c.name ?? c.email} <span className="text-walz-muted-strong">· {TYPE_LABEL[c.type]}</span></p>
                      <button
                        onClick={() => void linkCandidate(c)}
                        disabled={linkingId === c.id}
                        className="flex-shrink-0 min-h-[44px] px-2.5 rounded-lg bg-walz-navy text-walz-gold text-[11px] font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
                      >
                        {linkingId === c.id ? 'Linking…' : 'Link'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => void handleCreate()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
              >
                <UserPlus className="w-4 h-4" /> {creating ? 'Creating…' : 'Create and link client'}
              </button>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  )
}
