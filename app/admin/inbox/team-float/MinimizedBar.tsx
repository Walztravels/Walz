'use client'

/**
 * Floating Ask Team Workspace — minimized compact bar. Shown instead of the
 * full window when `minimized` is true; stays visible, shows the linked
 * client(s) + aggregate unread, and restores on click.
 *
 * Positioning is breakpoint-conditional via plain Tailwind classes (no JS
 * plumbing needed — Tailwind's `md:` breakpoint is 768px, exactly this
 * feature's own mobile/tablet split, see useBreakpoint.ts). On tablet/
 * desktop it keeps its original bottom-right anchor (same corner
 * convention as this codebase's other persistent FABs — Twilio phone/Jade
 * bubble, lib/admin/chrome.ts's Z_INDEX.fab), which does not sit over the
 * Inbox's reply composer at those widths. On a phone, the reply composer
 * (app/admin/inbox/components/ReplyBox.tsx) is a normal in-flow element
 * pinned near the bottom of the conversation column, and the on-screen
 * keyboard shrinks the viewport further from the bottom when it's focused —
 * a bottom-right fixed bar there risks sitting on top of the composer/
 * keyboard area. Anchored to the top-right on mobile instead, clear of both.
 */
import { ChevronUp } from 'lucide-react'
import type { FloatTab } from '@/lib/team-float/state'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface MinimizedBarProps {
  tabs: FloatTab[]
  totalUnread: number
  onRestore: () => void
}

/**
 * Bottom-right of the viewport on tablet/desktop (>=768px, Tailwind `md:`),
 * same corner convention as this codebase's other persistent FABs (Twilio
 * phone / Jade bubble — see lib/admin/chrome.ts's Z_INDEX.fab). Below that
 * (phone width), anchored top-right instead — clear of the reply composer
 * and on-screen keyboard, which live at the bottom of the viewport there.
 */
export function MinimizedBar({ tabs, totalUnread, onRestore }: MinimizedBarProps) {
  if (tabs.length === 0) return null

  const label = tabs.length === 1 ? `Team · ${tabs[0].clientName}` : `Team · ${tabs.length} discussions`

  return (
    <button
      type="button"
      onClick={onRestore}
      aria-label={`Restore Team Hub floating workspace — ${label}${totalUnread > 0 ? `, ${totalUnread} new message${totalUnread === 1 ? '' : 's'}` : ''}`}
      className="fixed right-4 top-4 md:top-auto md:bottom-4 flex items-center gap-2 rounded-full bg-walz-deep-navy text-white shadow-2xl px-4 py-2.5 text-sm font-semibold hover:bg-walz-navy transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
      style={{ zIndex: Z_INDEX.inboxFloatingPanel }}
    >
      <span className="truncate max-w-[180px]">{label}</span>
      {totalUnread > 0 && (
        <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
      <ChevronUp className="w-4 h-4" />
    </button>
  )
}
