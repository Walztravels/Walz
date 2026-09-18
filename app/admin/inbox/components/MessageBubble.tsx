'use client'
import { CWMessage, initials } from '../types'
import { formatMessageText } from './formatMessageText'

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
  const isJade      = msg.content_attributes?.jade_ai === true
  const senderName  = msg.sender?.name || (isIncoming ? 'Client' : 'Agent')
  const showDate    = !prevMsg || !sameDay(prevMsg.created_at, msg.created_at)

  // UX-1: the message canvas is a light surface now — separator/timestamp
  // text flipped to walz tokens for readability. Bubble internals untouched.
  if (isActivity) {
    return (
      <div className="flex items-center gap-2 my-2 px-4">
        <div className="h-px flex-1 bg-walz-navy/10" />
        <span className="text-[10px] text-walz-muted-strong px-2">{msg.content}</span>
        <div className="h-px flex-1 bg-walz-navy/10" />
      </div>
    )
  }

  return (
    <>
      {showDate && (
        <div className="flex items-center gap-2 my-4 px-4">
          <div className="h-px flex-1 bg-walz-navy/10" />
          <span className="text-[10px] text-walz-muted-strong px-2">{formatDate(msg.created_at)}</span>
          <div className="h-px flex-1 bg-walz-navy/10" />
        </div>
      )}

      <div className={`flex gap-2.5 px-4 py-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
        {isIncoming && (
          <div className="w-7 h-7 rounded-full bg-walz-navy flex items-center justify-center text-[10px] font-bold text-walz-gold flex-shrink-0 mt-1">
            {initials(senderName)}
          </div>
        )}

        <div className={`max-w-[85%] md:max-w-[72%] ${isIncoming ? '' : 'items-end flex flex-col'}`}>
          {isPrivate ? (
            <div className="rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/40 border-dashed">
              <p className="text-[10px] text-amber-700 font-semibold mb-1">🔒 Private note</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{formatMessageText(msg.content)}</p>
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
                    className="max-w-[min(260px,100%)] max-h-[320px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}

              {/* Audio attachments */}
              {msg.attachments?.filter(a => a.file_type === 'audio').map(att => (
                <audio key={att.id} controls src={att.data_url} className="max-w-[min(260px,100%)] rounded-lg" />
              ))}

              {/* Video attachments */}
              {msg.attachments?.filter(a => a.file_type === 'video').map(att => (
                <video key={att.id} controls src={att.data_url} className="max-w-[min(260px,100%)] rounded-xl" />
              ))}

              {/* File / document attachments */}
              {msg.attachments?.filter(a => !['image','sticker','audio','video'].includes(a.file_type)).map(att => (
                <a
                  key={att.id}
                  href={att.data_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium underline-offset-2 hover:underline max-w-full ${
                    isIncoming
                      ? 'bg-white border border-walz-border text-walz-navy'
                      : 'bg-blue-50 border border-blue-200/60 text-walz-navy'
                  }`}
                >
                  📎 {att.file_name ?? 'Download file'}
                </a>
              ))}

              {/* Text content (skip if empty and there are attachments).
                  UX-2 palette: white incoming with a walz-border hairline, light Walz
                  blue staff outgoing — no solid gold slabs; gold marks Jade only. */}
              {msg.content?.trim() && (
                <div
                  className={`rounded-2xl px-3.5 py-2.5 ${
                    isIncoming
                      ? 'bg-white border border-walz-border text-walz-deep-navy rounded-tl-sm'
                      : 'bg-blue-50 border border-blue-200/60 text-walz-deep-navy rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{formatMessageText(msg.content)}</p>
                </div>
              )}
            </div>
          )}
          <div className={`flex items-center gap-1 mt-0.5 ${isIncoming ? '' : 'justify-end'}`}>
            {isJade && (
              // M3 contrast: the sparkle stays gold; the word reads in
              // muted-strong (gold text fails AA at this size).
              <span className="text-[10px] font-semibold text-walz-muted-strong">
                <span className="text-walz-gold">✨</span> Jade
              </span>
            )}
            <span className="text-[10px] text-walz-muted-strong">{formatTime(msg.created_at)}</span>
            {!isIncoming && <span className="text-[10px] text-walz-muted-strong">· {senderName}</span>}
          </div>
        </div>

        {!isIncoming && (
          <div className="w-7 h-7 rounded-full bg-walz-navy flex items-center justify-center text-[10px] font-bold text-walz-gold flex-shrink-0 mt-1">
            {initials(senderName)}
          </div>
        )}
      </div>
    </>
  )
}
