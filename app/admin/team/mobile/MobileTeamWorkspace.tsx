'use client'

/**
 * Walz Team Hub V1 — mobile workspace (<768px). Forward-navigating
 * list -> chat screens (useTeamMobileScreens.ts), with an open thread as a
 * SECOND, independent overlay flag — never a third screen — mirroring
 * app/admin/inbox/useInboxScreens.ts's own screen/detailsOpen separation.
 */
import { useEffect, useRef } from 'react'
import { ConversationList } from '../components/ConversationList'
import { ConversationPane } from '../components/ConversationPane'
import { ThreadPanel } from '../components/ThreadPanel'
import { useTeamMobileScreens } from './useTeamMobileScreens'
import type { TeamWorkspaceSharedProps } from '../sharedProps'

export function MobileTeamWorkspace(props: TeamWorkspaceSharedProps) {
  const {
    conversations, selectedId, selectConversation, joinChannel, selected,
    threadRootId, threadRootMessage, closeThread, openThread,
    currentStaff, inboxLink, onLinkChanged, activeInboxConversationId,
    onOpenDirectory, onOpenCreate, onOpenMembers, onOpenCallHistory,
  } = props

  const screens = useTeamMobileScreens()
  const hasNavigatedForInitialSelection = useRef(false)

  // A deep link (?c=) or a hand-off from elsewhere pre-selects a
  // conversation before this component ever mounts — jump straight to the
  // chat screen for it once, the same way the Inbox's own deep-link
  // handling opens directly into the conversation rather than the list.
  useEffect(() => {
    if (hasNavigatedForInitialSelection.current) return
    if (selectedId) {
      hasNavigatedForInitialSelection.current = true
      screens.goToChat()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  function handleSelect(id: string) {
    selectConversation(id)
    screens.goToChat()
  }

  return (
    <div className="h-full min-h-0 relative overflow-hidden">
      <div className={`absolute inset-0 transition-transform duration-200 ${screens.screen === 'list' ? 'translate-x-0' : '-translate-x-full'}`}>
        <ConversationList
          joined={conversations.joined}
          discoverablePublic={conversations.discoverablePublic}
          selectedId={selectedId}
          loading={conversations.loading}
          error={conversations.error}
          onRetry={conversations.refetch}
          onSelect={handleSelect}
          onJoinChannel={id => { joinChannel(id); screens.goToChat() }}
          onOpenDirectory={onOpenDirectory}
          onOpenCreate={onOpenCreate}
        />
      </div>

      <div className={`absolute inset-0 flex flex-col transition-transform duration-200 ${screens.screen === 'chat' ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedId && (
          <ConversationPane
            currentStaff={currentStaff}
            selected={selected}
            inboxLink={inboxLink}
            onLinkChanged={onLinkChanged}
            activeInboxConversationId={activeInboxConversationId}
            openThread={id => { openThread(id); screens.openThread(id) }}
            onOpenMembers={onOpenMembers}
            onOpenCallHistory={onOpenCallHistory}
            onBack={screens.goToList}
          />
        )}
      </div>

      {screens.threadOpen && threadRootId && threadRootMessage && selected.conversation && (
        <ThreadPanel
          open
          onClose={() => { closeThread(); screens.closeThread() }}
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
