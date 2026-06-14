'use client'
import { useEffect, useRef } from 'react'
import { CWConversation, CWMessage, CWAgent, initials, channelIcon } from '../types'
import { MessageBubble } from './MessageBubble'
import { ReplyBox } from './ReplyBox'
import { AssignDropdown } from './AssignDropdown'

interface Props {
  conv:     CWConversation
  messages: CWMessage[]
  agents:   CWAgent[]
  onSend:   (content: string, isPrivate: boolean) => Promise<void>
  onAssign: (agentId: number) => Promise<void>
  onResolve: () => Promise<void>
  onReopen:  () => Promise<void>
}

export function ChatWindow({ conv, messages, agents, onSend, onAssign, onResolve, onReopen }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const sender = conv.meta?.sender
  const isResolved = conv.status === 'resolved'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#0B1F3A]">
        <div className="flex items-center gap-3 min-w-0">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/20 text-sm">
            No messages yet
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={msg.id} msg={msg} prevMsg={messages[i - 1]} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="flex-shrink-0">
        <ReplyBox onSend={onSend} disabled={isResolved} />
      </div>
    </div>
  )
}
