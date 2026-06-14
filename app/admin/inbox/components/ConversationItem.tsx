'use client'
import { CWConversation, timeAgo, initials, channelIcon } from '../types'

interface Props {
  conv: CWConversation
  selected: boolean
  onClick: () => void
}

export function ConversationItem({ conv, selected, onClick }: Props) {
  const sender  = conv.meta?.sender
  const name    = sender?.name || 'Unknown'
  const preview = conv.messages?.[0]?.content?.substring(0, 50) ?? '—'
  const unread  = conv.unread_count ?? 0
  const icon    = channelIcon(conv)
  const assignee = conv.meta?.assignee ?? conv.assignee
  const online  = assignee?.availability_status === 'online'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors ${
        selected ? 'bg-[#C9A84C]/15 border-l-2 border-l-[#C9A84C]' : 'hover:bg-white/5'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs font-bold text-[#C9A84C]">
            {initials(name)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">{icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            <span className="text-[10px] text-white/40 flex-shrink-0 ml-1">
              {timeAgo(conv.last_activity_at)}
            </span>
          </div>
          <p className="text-xs text-white/50 truncate">{preview}</p>
          <div className="flex items-center justify-between mt-1">
            {assignee ? (
              <span className="text-[10px] text-[#C9A84C]/70 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
                {assignee.name}
              </span>
            ) : (
              <span className="text-[10px] text-white/30">Unassigned</span>
            )}
            {unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
