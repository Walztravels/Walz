'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowDown, ChevronDown, Loader2 } from 'lucide-react'
import { CWConversation, CWMessage, CWAgent, initials, channelIcon, channelLabel } from '../types'
import { MessageBubble } from './MessageBubble'
import { ReplyBox } from './ReplyBox'
import { AssignDropdown } from './AssignDropdown'
import { HeaderActionMenu } from './HeaderActionMenu'
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
  /** Initial history load failed — show a failure, never a blank thread (0S.3). */
  loadError?:        boolean
  onRetryLoad?:      () => void
  /** UX-2 optional wiring — old call sites still typecheck without these. */
  onOpenLookup?:      () => void
  onOpenClientPanel?: () => void
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
  loadError = false, onRetryLoad, onOpenLookup, onOpenClientPanel,
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
      {/* Header — light surface with walz-border hairline (UX-1).
          UX-2 clean header: mobile row 1 is ONLY [←][avatar][identity]…[•••];
          assign + status controls are desktop-only in row 1 and reappear on
          mobile in a compact second row. Resolve/Reopen lives in the status
          control popover and the ••• menu — never a standalone header button. */}
      <div className="flex-shrink-0 border-b border-walz-border bg-white">
        <div className="flex items-center justify-between px-3 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Back button — mobile only */}
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back to conversations"
                className="md:hidden flex-shrink-0 min-w-[44px] min-h-[44px] -ml-2.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-walz-navy flex items-center justify-center text-xs font-bold text-walz-gold flex-shrink-0">
              {initials(sender?.name ?? '?')}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-walz-deep-navy truncate">{sender?.name ?? 'Unknown'}</p>
              {/* UX-2 polish subtitle (both breakpoints): human channel word,
                  no status here — status renders EXACTLY once, in StatusControl. */}
              <p className="text-[10px] text-walz-muted-strong truncate">
                {channelIcon(conv)} {channelLabel(conv)} · #{conv.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Desktop-only compact controls — row 1 stays clean on mobile */}
            <div className="hidden md:flex items-center gap-2">
              <AssignDropdown compact agents={agents} current={conv.meta?.assignee ?? conv.assignee} onAssign={onAssign} />
              <StatusControl isResolved={isResolved} onResolve={onResolve} onReopen={onReopen} />
            </div>
            <HeaderActionMenu
              isResolved={isResolved}
              onResolve={() => void onResolve()}
              onReopen={() => void onReopen()}
              onOpenLookup={onOpenLookup}
              onOpenClientPanel={onOpenClientPanel}
            />
          </div>
        </div>

        {/* Mobile second row — one compact line: assignment · status control.
            The StatusControl popover IS the status text ('Open ▾'/'Resolved ▾'),
            so no plain duplicate status string renders here. */}
        <div className="md:hidden flex items-center gap-1.5 px-3 pb-1.5">
          <AssignDropdown compact agents={agents} current={conv.meta?.assignee ?? conv.assignee} onAssign={onAssign} />
          <span className="text-[10px] text-walz-muted-strong flex-shrink-0">·</span>
          <StatusControl isResolved={isResolved} onResolve={onResolve} onReopen={onReopen} />
        </div>
      </div>

      {/* Messages — the single vertical history scroll container.
          Light canvas (walz-off-white) with light chrome above/below (UX-1). */}
      <div className="relative flex-1 min-h-0 bg-walz-off-white">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain py-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* History status row */}
          {messages.length > 0 && (
            beginningReached ? (
              <p className="text-center text-[10px] text-walz-muted-strong py-2">Beginning of conversation</p>
            ) : loadingOlder ? (
              <p className="flex items-center justify-center gap-1.5 text-[10px] text-walz-muted-strong py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading earlier messages…
              </p>
            ) : olderError ? (
              <p className="text-center text-[10px] text-walz-error py-2">
                Could not load earlier messages.{' '}
                <button onClick={() => onLoadOlder?.()} className="underline font-semibold">Retry</button>
              </p>
            ) : (
              <button onClick={() => onLoadOlder?.()}
                className="block mx-auto text-[10px] text-walz-muted-strong hover:text-walz-navy py-2">
                Load earlier messages
              </button>
            )
          )}

          {messages.length === 0 && loadError ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-sm">
              <p className="text-walz-error">Could not load messages.</p>
              <button
                onClick={() => onRetryLoad?.()}
                className="px-3 py-1.5 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-walz-muted-strong text-sm">
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
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-walz-gold text-walz-deep-navy text-xs font-bold shadow-lg"
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

/**
 * Compact status control (UX-2) — `Open ▾` / `Resolved ▾` popover exposing
 * the single lifecycle action for the current state. Reuses the existing
 * onResolve/onReopen handlers; the Resolve/Reopen labels live ONLY here
 * (and in HeaderActionMenu), never as standalone header buttons.
 */
function StatusControl({ isResolved, onResolve, onReopen }: {
  isResolved: boolean
  onResolve: () => Promise<void>
  onReopen:  () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-walz-navy/5 hover:bg-walz-navy/10 border border-walz-border text-xs font-semibold text-walz-navy transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isResolved ? 'bg-gray-400' : 'bg-green-500'}`} />
        {isResolved ? 'Resolved' : 'Open'}
        <ChevronDown className="w-3 h-3 text-walz-muted-strong" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-white border border-walz-border shadow-xl z-20 p-1.5">
            {!isResolved ? (
              <button
                role="menuitem"
                onClick={() => { setOpen(false); void onResolve() }}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Resolve
              </button>
            ) : (
              <button
                role="menuitem"
                onClick={() => { setOpen(false); void onReopen() }}
                className="w-full px-3 py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
