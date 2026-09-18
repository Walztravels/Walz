'use client'
import { MessageCircle, Instagram, Phone } from 'lucide-react'
import { CWConversation, timeAgo, initials, channelLabel } from '../types'
import { formatPreview } from './formatPreview'
import { cn } from '@/lib/utils'

// Channel glyphs keyed off the SHARED types.channelLabel truth — including the
// UX-2 production fact Channel::TwilioSms → 'WhatsApp' — so WhatsApp
// conversations never mislabel as SMS in the rail again.
const CHANNEL_ICONS: Record<string, { Icon: typeof MessageCircle; cls: string }> = {
  WhatsApp:  { Icon: MessageCircle, cls: 'text-green-400' },
  Instagram: { Icon: Instagram,     cls: 'text-pink-400' },
  Call:      { Icon: Phone,         cls: 'text-blue-400' },
}

interface Props {
  conv: CWConversation
  selected: boolean
  onClick: () => void
}

export function ConversationItem({ conv, selected, onClick }: Props) {
  const sender = conv.meta?.sender
  const label  = channelLabel(conv)
  // Display-name fallback chain — never a raw numeric id.
  const name =
    sender?.name || sender?.phone_number || sender?.email ||
    (label === 'Web' ? 'Website Visitor' : 'Unknown Contact')
  const lastMessage = conv.messages?.[0]
  // formatPreview is a cheap pure single-pass string op — no memo needed per row.
  const preview    = formatPreview(lastMessage)
  const isActivity = lastMessage?.message_type === 2
  const unread     = conv.unread_count ?? 0
  const isUnread   = unread > 0
  const assignee   = conv.meta?.assignee ?? conv.assignee
  const { Icon: ChannelGlyph, cls: channelCls } =
    CHANNEL_ICONS[label] ?? { Icon: MessageCircle, cls: 'text-white/50' }

  return (
    <button
      data-conv-card
      onClick={onClick}
      className={cn(
        // ~76px touch row on mobile; selected surface and keyboard focus are
        // DISTINCT affordances: selected = soft surface + gold left rule,
        // keyboard focus = inset gold ring (focus-visible only).
        'w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-white/5 transition-colors cursor-pointer outline-none',
        'focus-visible:ring-2 ring-inset ring-walz-gold/60',
        selected ? 'bg-white/5 border-l-2 border-l-walz-gold' : 'active:bg-white/5 hover:bg-white/5',
      )}
    >
      {/* ROW 1 — avatar (flat, initials-only: no images, no layout shift) */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-walz-slate flex items-center justify-center">
          <span className="text-walz-gold text-sm font-semibold">{initials(name)}</span>
        </div>
        {/* Channel badge */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-walz-deep-navy flex items-center justify-center border border-white/10">
          <ChannelGlyph size={10} className={channelCls} />
        </div>
        {/* Unread dot */}
        {isUnread && (
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-walz-gold" />
        )}
      </div>

      {/* Content column — min-w-0 keeps the truncate chain from overflowing */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            title={name}
            className={cn('text-sm truncate', isUnread ? 'font-semibold text-white' : 'font-medium text-white/75')}
          >
            {name}
          </span>
          <span className="text-[11px] text-white/50 flex-shrink-0 ml-2">
            {conv.last_activity_at ? timeAgo(conv.last_activity_at) : ''}
          </span>
        </div>

        {/* ROW 2 — preview (activity rows recede) */}
        <p className={cn('text-xs truncate', isActivity ? 'text-white/50 italic' : isUnread ? 'text-white/70' : 'text-white/55')}>
          {preview}
        </p>

        {/* ROW 3 — channel · assignee + unread count */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-white/50 truncate">
            {label} · {assignee?.name ?? 'Unassigned'}
          </span>
          {isUnread && (
            <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-walz-gold text-walz-deep-navy text-[10px] font-bold flex items-center justify-center px-1 flex-shrink-0">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
