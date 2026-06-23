'use client'
import { MessageCircle, Instagram, Phone } from 'lucide-react'
import { CWConversation, timeAgo, initials } from '../types'
import { cn } from '@/lib/utils'

function ChannelIcon({ conv, size = 10 }: { conv: CWConversation; size?: number }) {
  const ch = (conv.channel ?? conv.meta?.channel ?? '').toLowerCase()
  if (ch.includes('whatsapp'))  return <MessageCircle size={size} className="text-green-400" />
  if (ch.includes('instagram')) return <Instagram size={size} className="text-pink-400" />
  if (ch.includes('voice') || ch.includes('phone')) return <Phone size={size} className="text-blue-400" />
  return <MessageCircle size={size} className="text-white/40" />
}

function channelLabel(conv: CWConversation): string {
  const ch = (conv.channel ?? conv.meta?.channel ?? '').toLowerCase()
  if (ch.includes('whatsapp'))  return 'WhatsApp'
  if (ch.includes('instagram')) return 'Instagram'
  if (ch.includes('voice'))     return 'Call'
  if (ch.includes('sms'))       return 'SMS'
  return 'Chat'
}

interface Props {
  conv: CWConversation
  selected: boolean
  onClick: () => void
}

export function ConversationItem({ conv, selected, onClick }: Props) {
  const sender   = conv.meta?.sender
  const name     = sender?.name || 'Unknown'
  const preview  = conv.messages?.[0]?.content?.substring(0, 60) ?? '—'
  const unread   = conv.unread_count ?? 0
  const isUnread = unread > 0
  const assignee = conv.meta?.assignee ?? conv.assignee
  const label    = channelLabel(conv)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-4 border-b border-white/5 transition-colors cursor-pointer',
        selected ? 'bg-amber-500/8 border-l-2 border-l-amber-400' : 'active:bg-white/5 hover:bg-white/3',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/20 flex items-center justify-center">
          <span className="text-amber-400 text-sm font-semibold">{initials(name)}</span>
        </div>
        {/* Channel badge */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0a1628] flex items-center justify-center border border-white/10">
          <ChannelIcon conv={conv} size={10} />
        </div>
        {/* Unread dot */}
        {isUnread && (
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-white' : 'font-medium text-white/80')}>
            {name}
          </span>
          <span className="text-[11px] text-white/35 flex-shrink-0 ml-2">
            {timeAgo(conv.last_activity_at)}
          </span>
        </div>
        <p className={cn('text-xs truncate', isUnread ? 'text-white/70' : 'text-white/40')}>
          {preview}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/5">
            {label}
          </span>
          {assignee?.name && (
            <span className="text-[10px] text-white/25 truncate">→ {assignee.name}</span>
          )}
          {isUnread && (
            <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center px-1 flex-shrink-0">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
