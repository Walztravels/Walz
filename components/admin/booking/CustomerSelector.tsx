'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, User, Plus, X, Loader2, Phone, Mail, AlertTriangle } from 'lucide-react'
import { DoNotBookWarning } from '@/components/admin/DoNotBookWarning'

export interface AdminCustomer {
  id:          string
  name:        string
  email:       string
  phone?:      string | null
  nationality?: string | null
  doNotBook?:       boolean
  doNotBookReason?: string | null
}

interface NewCustomerForm {
  name:  string
  email: string
  phone: string
}

interface CustomerSelectorProps {
  value:     AdminCustomer | null
  onChange:  (customer: AdminCustomer | null) => void
  className?: string
  required?:  boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export default function CustomerSelector({ value, onChange, className, required }: CustomerSelectorProps) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<AdminCustomer[]>([])
  const [loading,   setLoading]   = useState(false)
  const [open,      setOpen]      = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [newForm,   setNewForm]   = useState<NewCustomerForm>({ name: '', email: '', phone: '' })
  const [error,     setError]     = useState<string | null>(null)
  // Do-Not-Book: a flagged client selection is held here until the staff
  // member explicitly acknowledges the warning (logged server-side).
  const [dnbPending, setDnbPending] = useState<AdminCustomer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) { setResults([]); return }
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/clients?search=${encodeURIComponent(q)}&page=1`)
        const data = await res.json()
        setResults((data.users ?? data.clients ?? []).slice(0, 8))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300) as unknown as (q: string) => void,
    [],
  )

  useEffect(() => { search(query) }, [query, search])

  function completeSelect(c: AdminCustomer) {
    onChange(c)
    setOpen(false)
    setQuery('')
    setCreating(false)
    setError(null)
    setDnbPending(null)
  }

  async function select(c: AdminCustomer) {
    // Fast path: search results already carry the flag
    if (c.doNotBook) {
      setDnbPending(c)
      setOpen(false)
      return
    }
    // Definitive check on selection (covers stale search data / other entry paths)
    try {
      const res  = await fetch(`/api/admin/clients/do-not-book?userId=${encodeURIComponent(c.id)}`)
      const data = await res.json() as { doNotBook?: boolean; reason?: string | null }
      if (data.doNotBook) {
        setDnbPending({ ...c, doNotBook: true, doNotBookReason: data.reason ?? null })
        setOpen(false)
        return
      }
    } catch { /* check failure never blocks a normal client */ }
    completeSelect(c)
  }

  async function createCustomer() {
    if (!newForm.name.trim() || !newForm.email.trim()) {
      setError('Name and email are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/clients', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(newForm),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create client'); return }
      const created: AdminCustomer = {
        id:    data.user?.id ?? data.id,
        name:  data.user?.name ?? data.name ?? newForm.name,
        email: data.user?.email ?? data.email ?? newForm.email,
        phone: (data.user?.phone ?? data.phone ?? newForm.phone) || null,
      }
      select(created)
      setNewForm({ name: '', email: '', phone: '' })
      setCreating(false)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (value) {
    return (
      <div className={`rounded-xl border ${value.doNotBook ? 'border-red-500/60' : 'border-[#2a3f5f]'} bg-[#0d2035] p-4 ${className ?? ''}`}>
        {value.doNotBook && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-600/15 border border-red-500/40 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">
              <span className="font-bold">DO NOT BOOK — override recorded.</span>{' '}
              {value.doNotBookReason ?? 'No reason recorded.'}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm truncate">{value.name}</p>
              <p className="text-xs text-gray-400 truncate">{value.email}</p>
              {value.phone && (
                <p className="text-xs text-gray-400">{value.phone}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-500 hover:text-white transition-colors flex-shrink-0 mt-0.5"
            aria-label="Remove client"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {dnbPending && (
        <DoNotBookWarning
          clientName={dnbPending.name}
          reason={dnbPending.doNotBookReason ?? null}
          userId={dnbPending.id}
          email={dnbPending.email}
          context="booking client selection"
          onCancel={() => setDnbPending(null)}
          onOverride={() => completeSelect(dnbPending)}
        />
      )}
      {!creating ? (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name, email or phone…"
              aria-label="Search clients"
              required={required}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-4 py-2.5
                text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]
                transition-colors"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-[#2a3f5f]
              bg-[#0a1929] shadow-2xl overflow-hidden">
              {results.length > 0 ? (
                <ul role="listbox" className="max-h-64 overflow-y-auto divide-y divide-[#1a2f4a]">
                  {results.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        onClick={() => select(c)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#0d2035]
                          text-left transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-[#C9A84C]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{c.name}</p>
                            {c.doNotBook && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white flex-shrink-0">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                DO NOT BOOK
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Mail className="w-3 h-3" />{c.email}
                            </span>
                            {c.phone && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Phone className="w-3 h-3" />{c.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : query.length >= 2 && !loading ? (
                <p className="px-4 py-3 text-sm text-gray-400">No clients found for &quot;{query}&quot;</p>
              ) : null}

              {/* New client button always in dropdown */}
              <div className="border-t border-[#1a2f4a] px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setCreating(true); setOpen(false); setQuery('') }}
                  className="flex items-center gap-2 text-sm text-[#C9A84C] hover:text-[#e0b85c]
                    font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New client
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Create new client form */
        <div className="rounded-xl border border-[#2a3f5f] bg-[#0d2035] p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-white">New client</p>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-gray-500 hover:text-white transition-colors"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 block mb-1">Full name *</label>
              <input
                type="text"
                value={newForm.name}
                onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                placeholder="John Smith"
                className="w-full bg-[#0a1929] border border-[#2a3f5f] rounded-lg px-3 py-2
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 block mb-1">Phone</label>
              <input
                type="tel"
                value={newForm.phone}
                onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 416 555 0100"
                className="w-full bg-[#0a1929] border border-[#2a3f5f] rounded-lg px-3 py-2
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Email *</label>
              <input
                type="email"
                value={newForm.email}
                onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                placeholder="john@example.com"
                className="w-full bg-[#0a1929] border border-[#2a3f5f] rounded-lg px-3 py-2
                  text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="flex-1 py-2 rounded-lg border border-[#2a3f5f] text-sm text-gray-400
                hover:text-white hover:border-[#3a4f6f] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createCustomer}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold
                hover:bg-[#e0b85c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
