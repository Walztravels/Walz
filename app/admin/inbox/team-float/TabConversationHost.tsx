'use client'

/**
 * Floating Ask Team Workspace — one open tab's live Team Hub state.
 *
 * Reuses the EXACT same per-conversation hook bundle Team Hub's own
 * TeamWorkspaceShell uses (useSelectedConversation = detail + messages +
 * the existing 25s poll-only realtime nudge, plus useInboxLinks), and
 * reuses ConversationPane (header + call banner + message list + composer)
 * unmodified in composition — this workspace is a presentation layer over
 * the SAME Team Hub data/business logic, never a second implementation.
 *
 * ONE instance of this component is mounted per OPEN tab (not per visible
 * tab) — see FloatingTeamWorkspace.tsx for why: every open tab needs its
 * own live poll to know about new messages for its unread badge even while
 * a different tab is focused, but the workspace deliberately does NOT call
 * useTeamConversations (the conversation-LIST hook) at all, since nothing
 * here needs the list — that's the "don't 3x the polling load" dedup this
 * feature was scoped to respect (see that hook's own header comment on its
 * pre-existing stray postgres_changes subscription, which this workspace
 * must not copy).
 */
import { useEffect, useState } from 'react'
import { useSelectedConversation } from '../../team/hooks/useSelectedConversation'
import { useInboxLinks } from '../../team/hooks/useInboxLinks'
import { ConversationPane } from '../../team/components/ConversationPane'
import { ThreadPanel } from '../../team/components/ThreadPanel'
import { MemberManagementPanel } from '../../team/components/MemberManagementPanel'
import { CallHistoryList } from '../../team/components/CallHistoryList'
import { computeUnreadCount, isReplySafeForCurrentComposer, type FloatTab } from '@/lib/team-float/state'
import type { CurrentStaff } from '../../team/types'

export interface TabConversationHostProps {
  tab: FloatTab
  active: boolean
  currentStaff: CurrentStaff | null
  /** The Inbox conversation id currently visible on screen (or null) — NEVER used to infer this tab's own linkage, only to compute the context-mismatch/safety state below. */
  viewingInboxConversationId: number | null
  onGoToLinkedConversation: (inboxConversationId: number) => void
  onReportUnread: (tabId: string, count: number) => void
}

export function TabConversationHost({
  tab, active, currentStaff, viewingInboxConversationId, onGoToLinkedConversation, onReportUnread,
}: TabConversationHostProps) {
  const selected = useSelectedConversation(tab.id, currentStaff?.id, currentStaff?.name)
  const inboxLinks = useInboxLinks(tab.id)
  const [threadRootId, setThreadRootId] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [callHistoryOpen, setCallHistoryOpen] = useState(false)

  const activeInboxConversationId =
    inboxLinks.activeLink && inboxLinks.activeLink.status !== 'RESOLVED' ? inboxLinks.activeLink.inboxConversationId : null

  useEffect(() => {
    const count = computeUnreadCount({
      messages: selected.messages.messages,
      lastReadAt: selected.conversation?.myMembership.lastReadAt ?? null,
      currentStaffId: currentStaff?.id ?? null,
    })
    onReportUnread(tab.id, count)
  }, [selected.messages.messages, selected.conversation?.myMembership.lastReadAt, currentStaff?.id, tab.id, onReportUnread])

  const threadRootMessage = threadRootId ? selected.messages.messages.find(m => m.id === threadRootId) ?? null : null
  const isViewingLinkedInbox = isReplySafeForCurrentComposer(activeInboxConversationId, viewingInboxConversationId)

  return (
    <div
      hidden={!active}
      role="tabpanel"
      id={`float-tabpanel-${tab.id}`}
      aria-labelledby={`float-tab-${tab.id}`}
      tabIndex={-1}
      className="flex-1 min-h-0 flex flex-col"
      data-float-tab-id={tab.id}
    >
      <ConversationPane
        currentStaff={currentStaff}
        selected={selected}
        inboxLink={inboxLinks.activeLink}
        onLinkChanged={inboxLinks.setActiveLink}
        activeInboxConversationId={activeInboxConversationId}
        openThread={setThreadRootId}
        onOpenMembers={() => setMembersOpen(true)}
        onOpenCallHistory={() => setCallHistoryOpen(true)}
        linkedClientName={tab.clientName}
        isViewingLinkedInbox={isViewingLinkedInbox}
        onGoToLinkedConversation={() => onGoToLinkedConversation(tab.inboxConversationId)}
      />

      {selected.conversation && (
        <ThreadPanel
          open={Boolean(threadRootId && threadRootMessage)}
          onClose={() => setThreadRootId(null)}
          conversationId={selected.conversation.id}
          conversationType={selected.conversation.type}
          rootMessage={threadRootMessage}
          currentStaffId={currentStaff?.id}
          currentStaffName={currentStaff?.name}
        />
      )}
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
