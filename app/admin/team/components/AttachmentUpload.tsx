'use client'

/**
 * Walz Team Hub V1 — attachment trigger + preview/progress/error chrome for
 * the composer. Split into two small controlled pieces (`AttachmentTrigger`,
 * `AttachmentPreview`) rather than one component that renders in two
 * different places in Composer.tsx's layout (toolbar row vs. above the
 * textarea) — Composer owns the `file`/`uploading`/`error` state (mirroring
 * ReplyBox.tsx's own inline file-state pattern) and renders each piece
 * where it belongs.
 */
import { useRef } from 'react'
import { Paperclip, X, FileText, Loader2 } from 'lucide-react'

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx'

export interface AttachmentTriggerProps {
  onSelect: (file: File) => void
  disabled?: boolean
}

export function AttachmentTrigger({ onSelect, disabled }: AttachmentTriggerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach file or image"
        title="Attach file or image"
        className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-gold hover:bg-walz-navy/5 transition-colors disabled:opacity-40"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onSelect(f)
          e.target.value = ''
        }}
      />
    </>
  )
}

export interface AttachmentPreviewProps {
  file: File
  uploading: boolean
  error: string | null
  onRemove: () => void
}

export function AttachmentPreview({ file, uploading, error, onRemove }: AttachmentPreviewProps) {
  const isImage = file.type.startsWith('image/')
  return (
    <div className="px-3 pt-2 space-y-1">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-walz-off-white border border-walz-border">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={URL.createObjectURL(file)} alt={file.name} className="h-10 w-10 object-cover rounded flex-shrink-0" />
        ) : (
          <FileText className="w-5 h-5 text-walz-gold flex-shrink-0" />
        )}
        <span className="text-xs text-walz-navy truncate flex-1">{file.name}</span>
        <span className="text-[10px] text-walz-muted-strong flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
        {uploading ? (
          <span className="flex items-center gap-1 text-[10px] text-walz-muted-strong flex-shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
          </span>
        ) : (
          <button onClick={onRemove} aria-label="Remove attachment" className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center text-walz-muted-strong hover:text-walz-navy flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-walz-error">{error}</p>}
    </div>
  )
}
