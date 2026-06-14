'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Lock } from 'lucide-react'

interface Props {
  onSend: (content: string, isPrivate: boolean) => Promise<void>
  disabled?: boolean
}

export function ReplyBox({ onSend, disabled }: Props) {
  const [mode, setMode]   = useState<'reply' | 'note'>('reply')
  const [text, setText]   = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isPrivate = mode === 'note'

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim(), isPrivate)
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="border-t border-white/8 bg-[#0B1F3A]">
      {/* Mode tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setMode('reply')}
          className={`px-4 py-2 text-xs font-semibold transition-colors ${
            mode === 'reply' ? 'text-[#C9A84C] border-b-2 border-[#C9A84C]' : 'text-white/40 hover:text-white/60'
          }`}
        >
          Reply
        </button>
        <button
          onClick={() => setMode('note')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-1 transition-colors ${
            mode === 'note' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Lock className="w-3 h-3" /> Private Note
        </button>
      </div>

      {/* Input area */}
      <div className="p-3">
        <div className={`rounded-xl border transition-colors ${
          isPrivate ? 'border-amber-600/30 bg-amber-900/10' : 'border-white/10 bg-white/5'
        }`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKey}
            disabled={disabled || sending}
            placeholder={isPrivate ? 'Write a private note (only visible to staff)...' : 'Reply to client... (Enter to send, Shift+Enter for newline)'}
            rows={2}
            className={`w-full bg-transparent px-3 pt-3 pb-1 text-sm resize-none outline-none placeholder-white/25 ${
              isPrivate ? 'text-amber-100' : 'text-white'
            }`}
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-white/25">{text.length} chars</span>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending || disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#d4b05c]"
            >
              <Send className="w-3 h-3" />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
