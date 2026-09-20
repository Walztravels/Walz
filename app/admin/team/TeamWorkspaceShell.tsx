'use client'

/**
 * Walz Team Hub V1 — top-level responsive shell. Computes every piece of
 * cross-cutting state ONCE (current staff identity, the conversation list,
 * the selected conversation's detail+messages, its inbox-link status, and
 * every overlay's open/close flag) and forwards the bundle to whichever of
 * Desktop/Tablet/Mobile is active per useBreakpoint() — the exact
 * architectural shape used by the Quote Builder's own
 * QuoteWorkspaceShell -> Desktop/Tablet/MobileWorkspace split.
 */
import { useState } from 'react'
import { useBreakpoint } from './useBreakpoint'
import { useCurrentStaff } from './hooks/useCurrentStaff'
import { useTeamConversations } from './hooks/useTeamConversations'
import { useSelectedConversation } from './hooks/useSelectedConversation'
import { useInboxLinks } from './hooks/useInboxLinks'
import { DesktopTeamWorkspace } from './desktop/DesktopTeamWorkspace'
import { TabletTeamWorkspace } from './tablet/TabletTeamWorkspace'
import { MobileTeamWorkspace } from './mobile/MobileTeamWorkspace'
import { StaffDirectoryPanel } from './components/StaffDirectoryPanel'
import { CreateConversationModal } from './components/CreateConversationModal'
import { MemberManagementPanel } from './components/MemberManagementPanel'
import { CallHistoryList } from './components/CallHistoryList'
import { teamFetch, extractErrorMessage, isSessionExpiredError } from './lib/teamFetch'
import type { TeamWorkspaceSharedProps } from './sharedProps'

export interface TeamWorkspaceShellProps {
  initialConversationId: string | null
}

export function TeamWorkspaceShell({ initialConversationId }: TeamWorkspaceShellProps) {
  const breakpoint = useBreakpoint()
  const { staff } = useCurrentStaff()
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId)
  const conversations = useTeamConversations(staff?.id)
  const selected = useSelectedConversation(selectedId, staff?.id, staff?.name)
  const inboxLinks = useInboxLinks(selectedId)

  const [threadRootId, setThreadRootId] = useState<string | null>(null)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [callHistoryOpen, setCallHistoryOpen] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  function selectConversation(id: string) {
    setSelectedId(id)
    setThreadRootId(null)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('c', id)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {
      /* URL bookkeeping is best-effort — selection still works */
    }
  }

  // QA finding (FAIL, fixed): this previously ignored res.ok entirely and
  // always proceeded to select/refetch as if the join had succeeded, even
  // on a 403/429/etc — a staff member could be shown an empty "joined"
  // conversation they never actually joined, with zero feedback.
  function joinChannel(id: string) {
    setJoinError(null)
    void teamFetch(`/api/admin/team/conversations/${id}/join`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          setJoinError(await extractErrorMessage(res, 'Could not join that channel.'))
          return
        }
        conversations.refetch()
        selectConversation(id)
      })
      .catch((e) => {
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
    <div className="h-full min-h-0">
      {breakpoint === 'desktop' && <DesktopTeamWorkspace {...shared} />}
      {breakpoint === 'tablet' && <TabletTeamWorkspace {...shared} />}
      {breakpoint === 'mobile' && <MobileTeamWorkspace {...shared} />}

      {joinError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[110] max-w-sm rounded-lg bg-red-600 text-white text-sm px-4 py-3 shadow-lg flex items-center gap-3"
        >
          <span>{joinError}</span>
          <button onClick={() => setJoinError(null)} aria-label="Dismiss" className="ml-auto text-white/80 hover:text-white min-h-[24px] min-w-[24px]">×</button>
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
