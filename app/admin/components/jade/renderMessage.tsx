'use client'

// renderMessage — Staff Jade message renderer (extracted from JadeStaffWidget
// for INBOX UX-2 Phase B, behavior unchanged). Pure: string in, nodes out.
// Designed for dark assistant bubbles (white/amber text on navy).

import type { ReactNode } from 'react'

export function renderMessage(content: string): ReactNode[] {
  return content.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />

    // Parse inline bold **text**
    const parseBold = (text: string): ReactNode => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g)
      return (
        <>
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>
              : <span key={j}>{p}</span>
          )}
        </>
      )
    }

    // Admin path highlighting
    if (line.trim().startsWith('/admin/') || line.trim().startsWith('→ /admin/')) {
      return (
        <p key={i} className="text-amber-400/80 font-mono text-[11px] leading-relaxed bg-amber-500/5 px-2 py-0.5 rounded my-0.5">
          {line}
        </p>
      )
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <p key={i} className="flex gap-2 text-white/80 leading-relaxed">
          <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
          <span>{parseBold(line.replace(/^[-•]\s/, ''))}</span>
        </p>
      )
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^\d+/)?.[0] ?? ''
      return (
        <p key={i} className="flex gap-2 text-white/80 leading-relaxed">
          <span className="text-amber-400 font-bold flex-shrink-0 min-w-[16px]">{num}.</span>
          <span>{parseBold(line.replace(/^\d+\.\s/, ''))}</span>
        </p>
      )
    }

    return (
      <p key={i} className="text-white/80 leading-relaxed">
        {parseBold(line)}
      </p>
    )
  })
}
