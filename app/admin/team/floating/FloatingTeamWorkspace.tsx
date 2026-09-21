'use client'

/**
 * Admin-wide Floating Team Hub — the floating window's own responsive
 * conversation-nav + conversation-pane layout. Reuses the EXACT same
 * presentational components the full-page Desktop/Tablet workspaces use
 * (ConversationList, ConversationPane, ThreadPanel) — no new messaging UI,
 * no second implementation — just a different arrangement driven by the
 * floating window's OWN width (useFloatingWidthTier, a ResizeObserver on
 * this component's own root) rather than the browser's width, per the
 * product spec's "wide floating width shows nav + pane side by side;
 * narrower floating width collapses nav behind a toggle" requirement.
 *
 * The client-side name filter below is a lightweight header-search
 * affordance scoped to the already-fetched conversation list (no new
 * network calls, so it can't add a second poller) — it does not call
 * /api/admin/team/search; that endpoint remains exclusively the full
 * page's to wire up if/when it grows a global message-content search UI.
 */
import { useMemo, useRef, useState } from 'react'
import { PanelLeftOpen, MessageSquareText } from 'lucide-react'
import { ConversationList } from '../components/ConversationList'
import { ConversationPane } from '../components/ConversationPane'
import { ThreadPanel } from '../components/ThreadPanel'
import { useFloatingWidthTier } from './useFloatingWidthTier'
import type { TeamWorkspaceSharedProps } from '../sharedProps'
import type { TeamConversationSummary } from '../types'

export interface FloatingTeamWorkspaceProps extends TeamWorkspaceSharedProps {
  searchTerm: string
}

function matches(c: TeamConversationSummary, term: string): boolean {
  if (!term.trim()) return true
  return (c.name ?? '').toLowerCase().includes(term.trim().toLowerCase())
}

export function FloatingTeamWorkspace(props: FloatingTeamWorkspaceProps) {
  const {
    conversations, selectedId, selectConversation, joinChannel, selected,
    threadRootId, threadRootMessage, closeThread, openThread,
    currentStaff, inboxLink, onLinkChanged, activeInboxConversationId,
    onOpenDirectory, onOpenCreate, onOpenMembers, onOpenCallHistory, searchTerm,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const tier = useFloatingWidthTier(rootRef, 720)
  const [railOpenOnNarrow, setRailOpenOnNarrow] = useState(!selectedId)

  const filteredJoined = useMemo(() => conversations.joined.filter(c => matches(c, searchTerm)), [conversations.joined, searchTerm])
  const filteredDiscoverable = useMemo(() => conversations.discoverablePublic.filter(c => matches(c, searchTerm)), [conversations.discoverablePublic, searchTerm])

  const showRail = tier === 'wide' || railOpenOnNarrow || !selectedId
  const railWidthClass = tier === 'wide' ? 'w-[240px]' : 'w-full'

  function handleSelect(id: string) {
    selectConversation(id)
    if (tier === 'narrow') setRailOpenOnNarrow(false)
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 relative">
      {showRail && (
        <div className={`${railWidthClass} flex-shrink-0 h-full ${tier === 'narrow' ? 'absolute inset-0 z-10 bg-white' : ''}`}>
          <ConversationList
            joined={filteredJoined}
            discoverablePublic={filteredDiscoverable}
            selectedId={selectedId}
            loading={conversations.loading}
            error={conversations.error}
            onRetry={conversations.refetch}
            onSelect={handleSelect}
            onJoinChannel={id => { joinChannel(id); if (tier === 'narrow') setRailOpenOnNarrow(false) }}
            onOpenDirectory={onOpenDirectory}
            onOpenCreate={onOpenCreate}
          />
        </div>
      )}

      {(tier === 'wide' || !showRail) && (
        selectedId ? (
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {tier === 'narrow' && (
              <button
                type="button"
                onClick={() => setRailOpenOnNarrow(true)}
                aria-label="Show conversation list"
                title="Show conversation list"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-walz-navy hover:bg-walz-navy/5 border-b border-walz-border min-h-[36px]"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" /> Conversations
              </button>
            )}
            <ConversationPane
              currentStaff={currentStaff}
              selected={selected}
              inboxLink={inboxLink}
              onLinkChanged={onLinkChanged}
              activeInboxConversationId={activeInboxConversationId}
              openThread={openThread}
              onOpenMembers={onOpenMembers}
              onOpenCallHistory={onOpenCallHistory}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center bg-walz-off-white p-4">
            <MessageSquareText className="w-6 h-6 text-walz-muted-strong/50" />
            <p className="text-xs text-walz-muted-strong">Select a conversation, or start a new one.</p>
          </div>
        )
      )}

      {threadRootId && threadRootMessage && selected.conversation && (
        <ThreadPanel
          open
          asSidePanel={tier === 'wide'}
          onClose={closeThread}
          conversationId={selected.conversation.id}
          conversationType={selected.conversation.type}
          rootMessage={threadRootMessage}
          currentStaffId={currentStaff?.id}
          currentStaffName={currentStaff?.name}
        />
      )}
    </div>
  )
}
