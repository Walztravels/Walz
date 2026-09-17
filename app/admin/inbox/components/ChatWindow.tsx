'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowDown, Loader2 } from 'lucide-react'
import { CWConversation, CWMessage, CWAgent, initials, channelIcon } from '../types'
import { MessageBubble } from './MessageBubble'
import { ReplyBox } from './ReplyBox'
import { AssignDropdown } from './AssignDropdown'
import { isNearBottom, TOP_TRIGGER_PX } from '@/lib/inbox/message-history'

interface Props {
  conv:      CWConversation
  messages:  CWMessage[]
  agents:    CWAgent[]
  onSend:    (content: string, isPrivate: boolean) => Promise<void>
  onAssign:  (agentId: number) => Promise<void>
  onResolve: () => Promise<void>
  onReopen:  () => Promise<void>
  onBack?:   () => void
  onLoadOlder?:      () => void
  loadingOlder?:     boolean
  olderError?:       boolean
  beginningReached?: boolean
}

/**
 * Conversation view (history/scroll fix).
 *
 * Scroll contract: open at the latest message; scrolling up near the top
 * loads earlier pages, PRESERVING the visual position when they prepend;
 * new messages auto-scroll only when the reader is already near the
 * bottom — otherwise a "New messages ↓" control appears. The viewport is
 * never yanked to the bottom by polling.
 */
export function ChatWindow({
  conv, messages, agents, onSend, onAssign, onResolve, onReopen, onBack,
  onLoadOlder, loadingOlder = false, olderError = false, beginningReached = false,
}: Props) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const prevRef = useRef<{ convId: number; firstId: number | null; lastId: number | null; scrollHeight: number }>(
    { convId: -1, firstId: null, lastId: null, scrollHeight: 0 })
  const [showNewIndicator, setShowNewIndicator] = useState(false)

  const sender = conv.meta?.sender
  const isResolved = conv.status === 'resolved'

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setShowNewIndicator(false)
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
    if (nearBottomRef.current) setShowNewIndicator(false)
    // Approaching the top → fetch the previous page.
    if (el.scrollTop <= TOP_TRIGGER_PX && !loadingOlder && !beginningReached && !olderError && messages.length > 0) {
      prevRef.current.scrollHeight = el.scrollHeight
      onLoadOlder?.()
    }
  }

  // Position management around every message-list change. useLayoutEffect
  // so adjustments land before paint (no visible jump).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const firstId = messages[0]?.id ?? null
    const lastId  = messages[messages.length - 1]?.id ?? null
    const prev = prevRef.current

    if (prev.convId !== conv.id) {
      // Conversation opened: jump straight to the latest message.
      scrollToBottom('auto')
      nearBottomRef.current = true
    } else if (prev.firstId !== null && firstId !== null && firstId !== prev.firstId
               && messages.some(m => m.id === prev.firstId)) {
      // Older page prepended: keep the reader exactly where they were.
      el.scrollTop += el.scrollHeight - prev.scrollHeight
    } else if (lastId !== null && prev.lastId !== null && lastId !== prev.lastId) {
      // New message appended.
      if (nearBottomRef.current) scrollToBottom('smooth')
      else setShowNewIndicator(true)
    }

    prevRef.current = { convId: conv.id, firstId, lastId, scrollHeight: el.scrollHeight }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conv.id])

  // Clear the indicator when switching conversations.
  useEffect(() => { setShowNewIndicator(false) }, [conv.id])

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-3 border-b border-white/8 bg-[#0B1F3A] gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Back button — mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden flex-shrink-0 p-1.5 -ml-1 rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs font-bold text-[#C9A84C] flex-shrink-0">
            {initials(sender?.name ?? '?')}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{sender?.name ?? 'Unknown'}</p>
            <p className="text-[10px] text-white/40">
              {channelIcon(conv)} #{conv.id} · {conv.status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <AssignDropdown agents={agents} current={conv.meta?.assignee ?? conv.assignee} onAssign={onAssign} />
          {!isResolved ? (
            <button
              onClick={onResolve}
              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
            >
              Resolve
            </button>
          ) : (
            <button
              onClick={onReopen}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/15 transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Messages — the single vertical history scroll container */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain py-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* History status row */}
          {messages.length > 0 && (
            beginningReached ? (
              <p className="text-center text-[10px] text-white/25 py-2">Beginning of conversation</p>
            ) : loadingOlder ? (
              <p className="flex items-center justify-center gap-1.5 text-[10px] text-white/40 py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading earlier messages…
              </p>
            ) : olderError ? (
              <p className="text-center text-[10px] text-red-300 py-2">
                Could not load earlier messages.{' '}
                <button onClick={() => onLoadOlder?.()} className="underline font-semibold">Retry</button>
              </p>
            ) : (
              <button onClick={() => onLoadOlder?.()}
                className="block mx-auto text-[10px] text-white/30 hover:text-white/60 py-2">
                Load earlier messages
              </button>
            )
          )}

          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/20 text-sm">
              No messages yet
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} prevMsg={messages[i - 1]} />
            ))
          )}
        </div>

        {/* New-messages control — reader is in history, don't yank them */}
        {showNewIndicator && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold shadow-lg"
          >
            New messages <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Reply box */}
      <div className="flex-shrink-0">
        <ReplyBox onSend={onSend} disabled={isResolved} />
      </div>
    </div>
  )
}
