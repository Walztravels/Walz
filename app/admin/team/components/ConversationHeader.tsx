'use client'

/**
 * Walz Team Hub V1 — conversation header: name/type/member-count, the
 * 1:1-only call button (see TeamCallButton.tsx's own header comment —
 * DM conversations only, resolved from `members`), and the inbox-link
 * banner/chip when this conversation has an active client-conversation
 * clarification link (see the new GET .../inbox-links list endpoint —
 * app/api/admin/team/conversations/[id]/inbox-links/route.ts).
 */
import { useState } from 'react'
import { ArrowLeft, Hash, History, Lock, Users, ExternalLink, Loader2 } from 'lucide-react'
import { TeamCallButton } from '../calls/TeamCallButton'
import { GroupCallButton } from '../calls/GroupCallButton'
import { teamFetch } from '../lib/teamFetch'
import type { ActiveGroupCall, TeamConversationDetail, TeamInboxLink } from '../types'

export interface ConversationHeaderProps {
  conversation: TeamConversationDetail
  currentStaffId?: string | null
  activeLink: TeamInboxLink | null
  onLinkChanged: (link: TeamInboxLink) => void
  activeGroupCall?: ActiveGroupCall | null
  onBack?: () => void
  onOpenMembers?: () => void
  onOpenCallHistory?: () => void
}

function conversationDisplayName(conversation: TeamConversationDetail, currentStaffId?: string | null): string {
  if (conversation.type === 'DM') {
    const other = conversation.members.find(m => m.staffId !== currentStaffId)
    return other?.name ?? conversation.name ?? 'Direct message'
  }
  return conversation.name ?? 'Conversation'
}

export function ConversationHeader({ conversation, currentStaffId, activeLink, onLinkChanged, activeGroupCall, onBack, onOpenMembers, onOpenCallHistory }: ConversationHeaderProps) {
  const [resolving, setResolving] = useState(false)
  const displayName = conversationDisplayName(conversation, currentStaffId)
  const other = conversation.type === 'DM' ? conversation.members.find(m => m.staffId !== currentStaffId) : null

  async function markResolved() {
    if (!activeLink) return
    setResolving(true)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversation.id}/inbox-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: activeLink.messageId, status: 'RESOLVED' }),
      })
      if (res.ok) {
        const data = (await res.json()) as { link: TeamInboxLink }
        onLinkChanged(data.link)
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex-shrink-0 border-b border-walz-border bg-white">
      <div className="flex items-center justify-between px-3 py-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to conversations"
              className="lg:hidden flex-shrink-0 min-w-[44px] min-h-[44px] -ml-2.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-walz-navy flex items-center justify-center text-walz-gold flex-shrink-0">
            {conversation.type === 'CHANNEL' ? (
              conversation.visibility === 'PRIVATE' ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />
            ) : (
              <Users className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-walz-deep-navy truncate">{displayName}</p>
            <button onClick={onOpenMembers} className="text-[10px] text-walz-muted-strong truncate hover:underline">
              {conversation.type === 'DM' ? (other?.roleTitle ?? 'Direct message') : `${conversation.members.length} member${conversation.members.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onOpenCallHistory && (
            <button
              onClick={onOpenCallHistory}
              aria-label="Call history"
              title="Call history"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          {conversation.type === 'DM' && other && (
            <TeamCallButton conversationId={conversation.id} calleeStaffId={other.staffId} calleeName={other.name} />
          )}
          {(conversation.type === 'GROUP' || conversation.type === 'CHANNEL') && (
            <GroupCallButton conversationId={conversation.id} activeCall={activeGroupCall ?? null} />
          )}
        </div>
      </div>

      {activeLink && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-walz-gold/10 border-t border-walz-gold/30 text-xs">
          <span className="text-walz-deep-navy">
            Linked to client conversation ·{' '}
            <span className="font-semibold">
              {activeLink.status === 'OPEN' ? 'Open' : activeLink.status === 'ANSWERED' ? 'Answered' : 'Resolved'}
            </span>
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`/admin/inbox?c=${activeLink.inboxConversationId}`}
              className="flex items-center gap-1 font-semibold text-walz-navy hover:underline"
            >
              Open Client Conversation <ExternalLink className="w-3 h-3" />
            </a>
            {activeLink.status !== 'RESOLVED' && (
              <button onClick={() => void markResolved()} disabled={resolving} className="font-semibold text-walz-muted-strong hover:text-walz-navy disabled:opacity-50">
                {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark resolved'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
