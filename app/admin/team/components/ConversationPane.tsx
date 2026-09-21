'use client'

/**
 * Walz Team Hub V1 — the assembled conversation view (header + message list
 * + composer), shared by the Desktop/Tablet trees and Mobile's 'chat'
 * screen so this assembly exists exactly once. Handles every state the QA
 * matrix requires: nothing selected, loading, forbidden (a normal "you're
 * not a member" case — see lib/team/authz.ts's header comment, never
 * treated as a bug), not found, a load error with retry, and the happy
 * path.
 */
import { Loader2 } from 'lucide-react'
import { ConversationHeader } from './ConversationHeader'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { GroupCallBanner } from '../calls/GroupCallBanner'
import { useActiveGroupCall } from '../hooks/useActiveGroupCall'
import type { TeamWorkspaceSharedProps } from '../sharedProps'

export interface ConversationPaneProps extends Pick<
  TeamWorkspaceSharedProps,
  'currentStaff' | 'selected' | 'inboxLink' | 'onLinkChanged' | 'activeInboxConversationId' | 'openThread' | 'onOpenMembers' | 'onOpenCallHistory'
> {
  onBack?: () => void
  /**
   * Floating Ask Team Workspace ONLY — passed straight through to Composer
   * (see that component's own header comment for the safety rationale).
   * Undefined for every existing standalone Team Hub call site, which keeps
   * their exact original Composer behavior.
   */
  linkedClientName?: string | null
  isViewingLinkedInbox?: boolean
  onGoToLinkedConversation?: () => void
}

export function ConversationPane({
  currentStaff, selected, inboxLink, onLinkChanged, activeInboxConversationId, openThread, onOpenMembers, onOpenCallHistory, onBack,
  linkedClientName, isViewingLinkedInbox, onGoToLinkedConversation,
}: ConversationPaneProps) {
  // Called unconditionally (hooks rule) even during the loading/forbidden/
  // not-found/error branches below — the hook itself is a no-op until both
  // a conversationId and a GROUP/CHANNEL type are known.
  const { call: activeGroupCall } = useActiveGroupCall(selected.conversation?.id ?? null, selected.conversation?.type)

  if (selected.detailLoading && !selected.conversation) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading conversation">
        <Loader2 className="w-5 h-5 animate-spin text-walz-muted-strong" />
      </div>
    )
  }

  if (selected.forbidden) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm text-walz-muted-strong max-w-xs">
          You don't have access to this conversation — you may have left it, or it may be private.
        </p>
      </div>
    )
  }

  if (selected.notFound) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm text-walz-muted-strong">This conversation could not be found.</p>
      </div>
    )
  }

  if (selected.detailError || !selected.conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-walz-error">Could not load this conversation.</p>
        <button onClick={selected.refetchDetail} className="px-3 py-1.5 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors">
          Retry
        </button>
      </div>
    )
  }

  const conversation = selected.conversation
  const isMember = conversation.members.some(m => m.staffId === currentStaff?.id)

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <ConversationHeader
        conversation={conversation}
        currentStaffId={currentStaff?.id}
        activeLink={inboxLink}
        onLinkChanged={onLinkChanged}
        activeGroupCall={activeGroupCall}
        onBack={onBack}
        onOpenMembers={onOpenMembers}
        onOpenCallHistory={onOpenCallHistory}
      />
      {(conversation.type === 'GROUP' || conversation.type === 'CHANNEL') && (
        <GroupCallBanner conversationId={conversation.id} activeCall={activeGroupCall} />
      )}
      <MessageList
        conversationId={conversation.id}
        conversationType={conversation.type}
        messages={selected.messages.messages}
        currentStaffId={currentStaff?.id}
        loading={selected.messages.loading}
        loadError={selected.messages.loadError}
        onRetryLoad={selected.messages.retryLoad}
        hasMore={selected.messages.hasMore}
        loadingOlder={selected.messages.loadingOlder}
        olderError={selected.messages.olderError}
        onLoadOlder={selected.messages.loadOlder}
        onReact={selected.messages.toggleReaction}
        onEdit={selected.messages.editMessage}
        onDelete={selected.messages.deleteMessage}
        onOpenThread={openThread}
        onMarkRead={selected.messages.markRead}
        emptyHint={conversation.type === 'DM' ? 'Say hello 👋' : 'No messages yet — say hello.'}
      />
      <Composer
        conversationId={conversation.id}
        disabled={conversation.archived || !isMember}
        disabledReason={conversation.archived ? 'This conversation is archived.' : !isMember ? 'You are not a member of this conversation.' : undefined}
        onSend={selected.messages.sendMessage}
        onUploadAttachment={selected.messages.uploadAttachment}
        activeInboxConversationId={activeInboxConversationId}
        linkedClientName={linkedClientName}
        isViewingLinkedInbox={isViewingLinkedInbox}
        onGoToLinkedConversation={onGoToLinkedConversation}
      />
    </div>
  )
}
