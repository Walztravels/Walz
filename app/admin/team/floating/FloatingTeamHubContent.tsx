'use client'

/**
 * Admin-wide Floating Team Hub — the floating window's content root.
 * Deliberately a NEW sibling file rather than an edit to
 * ../TeamWorkspaceShell.tsx: it duplicates that file's ~20 lines of thin
 * "compute state once, wire the overlays" composition glue (not any
 * business logic — every hook and every rendered component below is the
 * exact same one TeamWorkspaceShell.tsx already uses) so the full-page Team
 * Hub file most likely to be structurally central to the codebase is never
 * touched by this floating-window feature at all — zero merge risk with
 * anything else that might also read that file.
 *
 * Mounted ONLY while the floating window is actually open (see
 * FloatingTeamHubProvider.tsx) — closed/minimized unmounts this, so no
 * useTeamConversations/useSelectedConversation poller runs while the
 * window isn't visible. Minimized-state unread still updates live via the
 * separate, lightweight hooks/useTeamHubUnreadCount.ts (shared with the
 * sidebar badge), which needs no conversation-list fetch at all.
 *
 * Deliberately ignorant of Inbox context: it never reads the Inbox's
 * conversation/pathname, and useInboxLinks(selectedId) only ever displays
 * an ALREADY-EXISTING link for whatever conversation is selected — it does
 * not create one, so opening this from /admin/inbox can never auto-link to
 * whatever Inbox conversation happens to be visible.
 */
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useCurrentStaff } from '../hooks/useCurrentStaff'
import { useTeamConversations } from '../hooks/useTeamConversations'
import { useSelectedConversation } from '../hooks/useSelectedConversation'
import { useInboxLinks } from '../hooks/useInboxLinks'
import { FloatingTeamWorkspace } from './FloatingTeamWorkspace'
import { useFloatingTeamHub } from './FloatingTeamHubContext'
import { StaffDirectoryPanel } from '../components/StaffDirectoryPanel'
import { CreateConversationModal } from '../components/CreateConversationModal'
import { MemberManagementPanel } from '../components/MemberManagementPanel'
import { CallHistoryList } from '../components/CallHistoryList'
import { teamFetch, extractErrorMessage, isSessionExpiredError } from '../lib/teamFetch'
import type { TeamWorkspaceSharedProps } from '../sharedProps'

export function FloatingTeamHubContent() {
  const { selectedConversationId, selectConversation: setContextConversationId } = useFloatingTeamHub()
  const { staff } = useCurrentStaff()
  const [selectedId, setSelectedId] = useState<string | null>(selectedConversationId)
  const conversations = useTeamConversations(staff?.id)
  const selected = useSelectedConversation(selectedId, staff?.id, staff?.name)
  const inboxLinks = useInboxLinks(selectedId)

  const [searchTerm, setSearchTerm] = useState('')
  const [threadRootId, setThreadRootId] = useState<string | null>(null)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [callHistoryOpen, setCallHistoryOpen] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Keep the context's cross-navigation-persisted selection in sync so
  // minimize -> restore (which unmounts/remounts this component) comes back
  // to the same conversation.
  useEffect(() => { setContextConversationId(selectedId) }, [selectedId, setContextConversationId])

  function selectConversation(id: string) {
    setSelectedId(id)
    setThreadRootId(null)
  }

  function joinChannel(id: string) {
    setJoinError(null)
    void teamFetch(`/api/admin/team/conversations/${id}/join`, { method: 'POST' })
      .then(async res => {
        if (!res.ok) {
          setJoinError(await extractErrorMessage(res, 'Could not join that channel.'))
          return
        }
        conversations.refetch()
        selectConversation(id)
      })
      .catch(e => {
        if (isSessionExpiredError(e)) return
        setJoinError('Could not join that channel.')
      })
  }

  const threadRootMessage = threadRootId ? selected.messages.messages.find(m => m.id === threadRootId) ?? null : null
  const activeInboxConversationId =
    inboxLinks.activeLink && inboxLinks.activeLink.status !== 'RESOLVED' ? inboxLinks.activeLink.inboxConversationId : null

  const shared: TeamWorkspaceSharedProps = {
    currentStaff: staff,
    conversations,
    selectedId,
    selectConversation,
    joinChannel,
    selected,
    threadRootId,
    threadRootMessage,
    openThread: setThreadRootId,
    closeThread: () => setThreadRootId(null),
    inboxLink: inboxLinks.activeLink,
    onLinkChanged: inboxLinks.setActiveLink,
    activeInboxConversationId,
    onOpenDirectory: () => setDirectoryOpen(true),
    onOpenCreate: () => setCreateOpen(true),
    onOpenMembers: () => setMembersOpen(true),
    onOpenCallHistory: () => setCallHistoryOpen(true),
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-shrink-0 px-3 py-2 border-b border-walz-border">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-walz-muted-strong absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter conversations…"
            aria-label="Filter conversations"
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-walz-border bg-walz-off-white focus:outline-none focus:border-walz-navy/40"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <FloatingTeamWorkspace {...shared} searchTerm={searchTerm} />
      </div>

      {joinError && (
        <div role="alert" className="flex-shrink-0 m-2 rounded-lg bg-red-600 text-white text-xs px-3 py-2 flex items-center gap-2">
          <span className="flex-1">{joinError}</span>
          <button onClick={() => setJoinError(null)} aria-label="Dismiss" className="text-white/80 hover:text-white min-h-[24px] min-w-[24px]">×</button>
        </div>
      )}

      <StaffDirectoryPanel
        open={directoryOpen}
        onClose={() => setDirectoryOpen(false)}
        onOpenConversation={id => { selectConversation(id); conversations.refetch() }}
      />
      <CreateConversationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => { selectConversation(id); conversations.refetch() }}
      />
      {selected.conversation && (
        <MemberManagementPanel
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          conversation={selected.conversation}
          onChanged={() => selected.refetchDetail()}
        />
      )}
      {selected.conversation && (
        <CallHistoryList
          open={callHistoryOpen}
          onClose={() => setCallHistoryOpen(false)}
          conversationId={selected.conversation.id}
          members={selected.conversation.members}
        />
      )}
    </div>
  )
}
