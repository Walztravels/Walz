'use client'

/**
 * Walz Team Hub V1 — @mention autocomplete dropdown for the composer.
 * Candidates ALWAYS come from GET .../conversations/[id]/members?q=, scoped
 * to the CURRENT conversation only — never a global staff search — per the
 * security audit's "mention autocomplete must never leak private-channel
 * membership" requirement (see that route's own header comment).
 * Keyboard-navigable: ArrowUp/ArrowDown moves, Enter/Tab selects, Escape
 * closes (handled by the parent Composer, which owns the trigger state).
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { teamFetch } from '../lib/teamFetch'
import type { TeamConversationMemberSummary } from '../types'

export interface MentionAutocompleteProps {
  conversationId: string
  query: string
  activeIndex: number
  onResults: (count: number) => void
  onSelect: (member: TeamConversationMemberSummary) => void
}

export function MentionAutocomplete({ conversationId, query, activeIndex, onResults, onSelect }: MentionAutocompleteProps) {
  const [results, setResults] = useState<TeamConversationMemberSummary[]>([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const onResultsRef = useRef(onResults)
  onResultsRef.current = onResults

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      teamFetch(`/api/admin/team/conversations/${conversationId}/members?q=${encodeURIComponent(query)}`)
        .then(res => (res.ok ? res.json() : { members: [] }))
        .then((data: { members?: TeamConversationMemberSummary[] }) => {
          if (cancelled) return
          const members = Array.isArray(data.members) ? data.members : []
          setResults(members)
          onResultsRef.current(members.length)
        })
        .catch(() => { if (!cancelled) { setResults([]); onResultsRef.current(0) } })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [conversationId, query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!loading && results.length === 0) {
    return (
      <div className="absolute z-20 bottom-full mb-1 left-0 w-64 rounded-xl bg-white border border-walz-border shadow-xl p-3 text-xs text-walz-muted-strong">
        No matching members.
      </div>
    )
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label="Mention a member"
      className="absolute z-20 bottom-full mb-1 left-0 w-64 max-h-56 overflow-y-auto rounded-xl bg-white border border-walz-border shadow-xl py-1"
    >
      {loading && results.length === 0 ? (
        <li className="px-3 py-2 text-xs text-walz-muted-strong flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Searching…
        </li>
      ) : (
        results.map((m, i) => (
          <li key={m.staffId} data-idx={i} role="option" aria-selected={i === activeIndex}>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(m) }}
              className={`w-full text-left px-3 py-2 text-sm flex flex-col ${i === activeIndex ? 'bg-walz-off-white' : 'hover:bg-walz-off-white'}`}
            >
              <span className="font-semibold text-walz-deep-navy">{m.name}</span>
              <span className="text-[11px] text-walz-muted-strong">{[m.roleTitle, m.department].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))
      )}
    </ul>
  )
}
