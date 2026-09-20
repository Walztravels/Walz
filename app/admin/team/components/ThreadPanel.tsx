'use client'

/**
 * Walz Team Hub V1 — a single message's thread (its replies), opened as an
 * overlay on mobile/tablet (per the mobile screen-state pattern's "an open
 * thread panel as a SECOND independent overlay flag") or a side panel on
 * desktop. Self-contained: owns its own useTeamMessages/useTeamRealtimeMessages
 * instance scoped by `parentMessageId`, entirely separate from the main
 * feed's instance.
 */
import { useEffect } from 'react'
import { MessageSquareText, X } from 'lucide-react'
import { useTeamMessages } from '../hooks/useTeamMessages'
import { useTeamRealtimeMessages } from '../hooks/useTeamRealtimeMessages'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { Overlay } from './Overlay'
import type { ConversationType, TeamMessage } from '../types'

export interface ThreadPanelProps {
  open: boolean
  onClose: () => void
  conversationId: string
  conversationType: ConversationType
  rootMessage: TeamMessage | null
  currentStaffId?: string | null
  currentStaffName?: string | null
  /** Desktop renders this as a static side column instead of a scrim overlay. */
  asSidePanel?: boolean
}

export function ThreadPanel({
  open, onClose, conversationId, conversationType, rootMessage, currentStaffId, currentStaffName, asSidePanel,
}: ThreadPanelProps) {
  const parentMessageId = rootMessage?.id ?? null
  const thread = useTeamMessages({
    conversationId: open ? conversationId : null,
    parentMessageId,
    currentStaffId,
    currentStaffName,
  })
  useTeamRealtimeMessages(open ? conversationId : null, thread.refreshNewest)

  // Accessibility finding (CONCERN, fixed): the asSidePanel variant bypasses
  // Overlay entirely (it's a persistent column, not a scrim modal), which
  // also meant it had no Escape-to-close at all — a keyboard user had to
  // find and click the small close button.
  useEffect(() => {
    if (!open || !asSidePanel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, asSidePanel, onClose])

  if (!open || !rootMessage) return null

  const body = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-walz-border bg-white">
        <p className="text-[10px] uppercase tracking-wide text-walz-muted-strong font-semibold flex items-center gap-1">
          <MessageSquareText className="w-3 h-3" /> Thread
        </p>
        <p className="text-sm font-semibold text-walz-deep-navy mt-0.5">{rootMessage.authorName}</p>
        <p className="text-sm text-walz-muted-strong truncate">{rootMessage.deleted ? 'Message deleted' : rootMessage.body}</p>
      </div>
      <MessageList
        conversationId={conversationId}
        conversationType={conversationType}
        messages={thread.messages}
        currentStaffId={currentStaffId}
        loading={thread.loading}
        loadError={thread.loadError}
        onRetryLoad={thread.retryLoad}
        hasMore={thread.hasMore}
        loadingOlder={thread.loadingOlder}
        olderError={thread.olderError}
        onLoadOlder={thread.loadOlder}
        onReact={thread.toggleReaction}
        onEdit={thread.editMessage}
        onDelete={thread.deleteMessage}
        onOpenThread={() => { /* no nested threads-of-threads in V1 */ }}
        onMarkRead={() => { /* thread replies don't drive the conversation read cursor */ }}
        emptyHint="No replies yet — start the thread."
      />
      <Composer
        conversationId={conversationId}
        parentMessageId={parentMessageId}
        placeholder="Reply in thread…"
        onSend={thread.sendMessage}
        onUploadAttachment={thread.uploadAttachment}
      />
    </div>
  )

  if (asSidePanel) {
    return (
      <div className="w-[340px] flex-shrink-0 border-l border-walz-border bg-white flex flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-end px-2 py-1.5 border-b border-walz-border">
          <button onClick={onClose} aria-label="Close thread" className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <X className="w-4 h-4" />
          </button>
        </div>
        {body}
      </div>
    )
  }

  return (
    <Overlay open={open} onClose={onClose} title="Thread" widthClassName="max-w-md" contentClassName="flex-1 min-h-0 flex flex-col">
      {body}
    </Overlay>
  )
}
