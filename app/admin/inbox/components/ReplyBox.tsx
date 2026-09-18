'use client'
import { useEffect, useState, useRef, KeyboardEvent } from 'react'
import { Send, Lock, Paperclip, X, FileText } from 'lucide-react'
import { useComposerDraft } from '../ComposerDraftContext'

interface Props {
  onSend: (content: string, isPrivate: boolean, file?: File) => Promise<void>
  disabled?: boolean
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'

export function ReplyBox({ onSend, disabled }: Props) {
  const [mode, setMode]       = useState<'reply' | 'note'>('reply')
  const [text, setText]       = useState('')
  const [file, setFile]       = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UX-2: Jade talks to the composer through the draft context — the
  // ChatWindow → ReplyBox JSX line is pinned, so no new props here.
  const { registerInserter, openCopilot } = useComposerDraft()
  useEffect(() => {
    registerInserter((draft: string) => {
      setMode('reply')
      setText(prev => (prev.trim() ? `${prev}\n\n${draft}` : draft))
      // Refocus + resize after React commits the new value (same autosize rule
      // as handleInput: grow to content, capped at 120px).
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
        el.setSelectionRange(el.value.length, el.value.length)
      })
    })
  }, [registerInserter])

  const isPrivate = mode === 'note'
  const canSend   = (text.trim().length > 0 || file !== null) && !sending && !disabled

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    try {
      await onSend(text.trim(), isPrivate, file ?? undefined)
      setText('')
      setFile(null)
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    e.target.value = ''
  }

  const isImage = file?.type.startsWith('image/')

  return (
    <div className="border-t border-walz-border bg-white">
      {/* Mode tabs */}
      <div className="flex border-b border-walz-border/60">
        <button
          onClick={() => setMode('reply')}
          className={`px-4 py-2 text-xs font-semibold transition-colors ${
            mode === 'reply' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-walz-muted-strong hover:text-walz-navy'
          }`}
        >
          Reply
        </button>
        <button
          onClick={() => setMode('note')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-1 transition-colors ${
            mode === 'note' ? 'text-amber-700 border-b-2 border-amber-600' : 'text-walz-muted-strong hover:text-walz-navy'
          }`}
        >
          <Lock className="w-3 h-3" /> Private Note
        </button>
      </div>

      {/* File preview */}
      {file && (
        <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-walz-off-white border border-walz-border">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="h-10 w-10 object-cover rounded"
            />
          ) : (
            <FileText className="w-5 h-5 text-walz-gold flex-shrink-0" />
          )}
          <span className="text-xs text-walz-navy truncate flex-1">{file.name}</span>
          <span className="text-[10px] text-walz-muted-strong flex-shrink-0">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button onClick={() => setFile(null)} className="text-walz-muted-strong hover:text-walz-navy flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3">
        <div className={`rounded-xl border transition-colors ${
          isPrivate ? 'border-amber-500/50 bg-amber-500/10' : 'border-walz-border bg-walz-off-white/60'
        }`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKey}
            disabled={disabled || sending}
            placeholder={isPrivate ? 'Write a private note (only visible to staff)...' : 'Reply to client… (Enter to send, Shift+Enter for newline)'}
            rows={2}
            className={`w-full bg-transparent px-3 pt-3 pb-1 text-sm resize-none outline-none placeholder-walz-muted-strong ${
              isPrivate ? 'text-amber-900' : 'text-walz-deep-navy'
            }`}
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-walz-muted-strong">{text.length} chars</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || sending}
                title="Attach file or image"
                className="text-walz-muted-strong hover:text-walz-gold transition-colors disabled:opacity-40"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Ask Jade — compact icon entry beside the actions on mobile */}
              <button
                type="button"
                onClick={openCopilot}
                title="Ask Jade"
                aria-label="Ask Jade"
                className="md:hidden min-w-[44px] min-h-[44px] -my-3 flex items-center justify-center text-walz-gold hover:opacity-80 transition-opacity text-sm leading-none"
              >
                ✨
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="w-3 h-3" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        {/* Slim bottom row — Staff Jade entry (desktop text button) */}
        <div className="hidden md:flex items-center pt-1.5">
          {/* M3 contrast: the words read in muted-strong (gold text fails AA
              at this size) — only the sparkle stays gold. */}
          <button
            type="button"
            onClick={openCopilot}
            className="text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy transition-colors"
          >
            <span className="text-walz-gold">✨</span> Ask Jade
          </button>
        </div>
      </div>
    </div>
  )
}
