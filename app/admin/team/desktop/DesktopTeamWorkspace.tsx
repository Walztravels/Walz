'use client'

/**
 * Walz Team Hub V1 — desktop workspace (>=1024px, this codebase's `lg`
 * convention). Three columns: conversation rail, active conversation, and
 * (only while a thread is open) a persistent thread side panel — per the
 * architecture audit's explicit desktop-vs-mobile thread treatment.
 */
import { MessageSquareText } from 'lucide-react'
import { ConversationList } from '../components/ConversationList'
import { ConversationPane } from '../components/ConversationPane'
import { ThreadPanel } from '../components/ThreadPanel'
import type { TeamWorkspaceSharedProps } from '../sharedProps'

export function DesktopTeamWorkspace(props: TeamWorkspaceSharedProps) {
  const {
    conversations, selectedId, selectConversation, joinChannel, selected,
    threadRootId, threadRootMessage, closeThread, openThread,
    currentStaff, inboxLink, onLinkChanged, activeInboxConversationId,
    onOpenDirectory, onOpenCreate, onOpenMembers, onOpenCallHistory,
  } = props

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[280px] flex-shrink-0 h-full">
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
          asSidePanel
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
