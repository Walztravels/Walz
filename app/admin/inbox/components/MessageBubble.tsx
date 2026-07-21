'use client'
import { CWMessage, initials } from '../types'

interface Props {
  msg: CWMessage
  prevMsg?: CWMessage
}

function formatTime(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function sameDay(a: number, b: number) {
  const da = new Date(a > 1e12 ? a : a * 1000)
  const db = new Date(b > 1e12 ? b : b * 1000)
  return da.toDateString() === db.toDateString()
}

export function MessageBubble({ msg, prevMsg }: Props) {
  const isIncoming  = msg.message_type === 0
  const isActivity  = msg.message_type === 2
  const isPrivate   = msg.private
  const senderName  = msg.sender?.name || (isIncoming ? 'Client' : 'Agent')
  const showDate    = !prevMsg || !sameDay(prevMsg.created_at, msg.created_at)

  if (isActivity) {
    return (
      <div className="flex items-center gap-2 my-2 px-4">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] text-white/30 px-2">{msg.content}</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    )
  }

  return (
    <>
      {showDate && (
        <div className="flex items-center gap-2 my-4 px-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] text-white/40 px-2">{formatDate(msg.created_at)}</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      )}

      <div className={`flex gap-2.5 px-4 py-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
        {isIncoming && (
          <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-[10px] font-bold text-[#C9A84C] flex-shrink-0 mt-1">
            {initials(senderName)}
          </div>
        )}

        <div className={`max-w-[70%] ${isIncoming ? '' : 'items-end flex flex-col'}`}>
          {isPrivate ? (
            <div className="rounded-xl px-3 py-2 bg-amber-900/30 border border-amber-600/30 border-dashed">
              <p className="text-[10px] text-amber-400 font-semibold mb-1">🔒 Private note</p>
              <p className="text-sm text-amber-100 whitespace-pre-wrap">{msg.content}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* Image attachments */}
              {msg.attachments?.filter(a => a.file_type === 'image' || a.file_type === 'sticker').map(att => (
                <a key={att.id} href={att.data_url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.data_url}
                    alt={att.file_name ?? 'image'}
                    className="max-w-[260px] max-h-[320px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}

              {/* Audio attachments */}
              {msg.attachments?.filter(a => a.file_type === 'audio').map(att => (
                <audio key={att.id} controls src={att.data_url} className="max-w-[260px] rounded-lg" />
              ))}

              {/* Video attachments */}
              {msg.attachments?.filter(a => a.file_type === 'video').map(att => (
                <video key={att.id} controls src={att.data_url} className="max-w-[260px] rounded-xl" />
              ))}

              {/* File / document attachments */}
              {msg.attachments?.filter(a => !['image','sticker','audio','video'].includes(a.file_type)).map(att => (
                <a
                  key={att.id}
                  href={att.data_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium underline-offset-2 hover:underline ${
                    isIncoming ? 'bg-[#1e3a5f] text-blue-300' : 'bg-[#b8903f] text-[#0B1F3A]'
                  }`}
                >
                  📎 {att.file_name ?? 'Download file'}
                </a>
              ))}

              {/* Text content (skip if empty and there are attachments) */}
              {msg.content?.trim() && (
                <div
                  className={`rounded-2xl px-3.5 py-2.5 ${
                    isIncoming
                      ? 'bg-[#1e3a5f] text-white rounded-tl-sm'
                      : 'bg-[#C9A84C] text-[#0B1F3A] rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              )}
            </div>
          )}
          <div className={`flex items-center gap-1 mt-0.5 ${isIncoming ? '' : 'justify-end'}`}>
            <span className="text-[10px] text-white/30">{formatTime(msg.created_at)}</span>
            {!isIncoming && <span className="text-[10px] text-white/30">· {senderName}</span>}
          </div>
        </div>

        {!isIncoming && (
          <div className="w-7 h-7 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[10px] font-bold text-[#C9A84C] flex-shrink-0 mt-1">
            {initials(senderName)}
          </div>
        )}
      </div>
    </>
  )
}
