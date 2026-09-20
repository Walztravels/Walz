'use client'

/**
 * Walz Team Hub V1 — tablet workspace (768–1023px). Two panes (rail +
 * conversation), mirroring the Inbox's own tablet convention (see
 * ConversationList.tsx's own header comment: "768–1023px (tablet) the rail
 * sits at the page's fixed width beside the conversation — 2 panes") —
 * narrower than desktop's three-column layout, and a thread opens as an
 * overlay rather than a persistent third column (no room for it at this
 * width).
 */
import { MessageSquareText } from 'lucide-react'
import { ConversationList } from '../components/ConversationList'
import { ConversationPane } from '../components/ConversationPane'
import { ThreadPanel } from '../components/ThreadPanel'
import type { TeamWorkspaceSharedProps } from '../sharedProps'

export function TabletTeamWorkspace(props: TeamWorkspaceSharedProps) {
  const {
    conversations, selectedId, selectConversation, joinChannel, selected,
    threadRootId, threadRootMessage, closeThread, openThread,
    currentStaff, inboxLink, onLinkChanged, activeInboxConversationId,
    onOpenDirectory, onOpenCreate, onOpenMembers, onOpenCallHistory,
  } = props

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[240px] flex-shrink-0 h-full">
        <ConversationList
          joined={conversations.joined}
          discoverablePublic={conversations.discoverablePublic}
          selectedId={selectedId}
          loading={conversations.loading}
          error={conversations.error}
          onRetry={conversations.refetch}
          onSelect={selectConversation}
          onJoinChannel={joinChannel}
          onOpenDirectory={onOpenDirectory}
          onOpenCreate={onOpenCreate}
        />
      </div>

      {selectedId ? (
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
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center bg-walz-off-white">
          <MessageSquareText className="w-8 h-8 text-walz-muted-strong/50" />
          <p className="text-sm text-walz-muted-strong">Select a conversation, or start a new one.</p>
        </div>
      )}

      {threadRootId && threadRootMessage && selected.conversation && (
        <ThreadPanel
          open
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
