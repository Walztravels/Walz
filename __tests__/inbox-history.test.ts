/**
 * Admin Inbox — conversation history / mobile scroll fix.
 *
 * Root causes fixed: (A) the Chatwoot proxy never paginated, so history
 * beyond the latest page was unreachable; (B) polling replaced the
 * message array and an unconditional scroll effect yanked the viewport
 * to the bottom every 5 seconds.
 */

import fs from 'fs'
import path from 'path'

import {
  sortPage, mergeLatest, prependOlder, oldestCursor,
  isNearBottom, NEAR_BOTTOM_PX, TOP_TRIGGER_PX,
} from '@/lib/inbox/message-history'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const route = read('app/api/admin/conversations/[id]/messages/route.ts')
const page  = read('app/admin/inbox/page.tsx')
const chat  = read('app/admin/inbox/components/ChatWindow.tsx')

const msg = (id: number, t: number) => ({ id, created_at: t })
/** A conversation of 120 messages, ids 1..120, chronological. */
const FULL = Array.from({ length: 120 }, (_, i) => msg(i + 1, 1000 + i))
const pageOf = (before: number | null, size = 30) => {
  const older = before == null ? FULL : FULL.filter(m => m.id < before)
  return older.slice(-size)
}

describe('pagination over a >100-message conversation', () => {
  it('initial load is the latest page; upward pages chain to the beginning with no duplicates', () => {
    let messages = sortPage(pageOf(null))
    expect(messages).toHaveLength(30)
    expect(messages[messages.length - 1].id).toBe(120)      // latest shown first

    const pagesLoaded: number[] = []
    for (let i = 0; i < 10; i++) {
      const cursor = oldestCursor(messages)!
      const older = pageOf(cursor)
      const { merged, added } = prependOlder(messages, older)
      messages = merged
      pagesLoaded.push(added)
      if (added === 0) break
    }
    expect(messages).toHaveLength(120)                       // whole history reachable
    expect(pagesLoaded).toEqual([30, 30, 30, 0])             // 4th page ends history
    // No duplicates, strict chronological order:
    expect(new Set(messages.map(m => m.id)).size).toBe(120)
    expect(messages.map(m => m.id)).toEqual(FULL.map(m => m.id))
  })
  it('oldest page correctly ends history (added=0 → beginning)', () => {
    const start = sortPage(pageOf(31))                       // ids 1..30
    expect(prependOlder(start, pageOf(oldestCursor(start)!)).added).toBe(0)
  })
})

describe('poll refresh merges — never replaces', () => {
  it('keeps loaded older pages and reports only genuinely new messages', () => {
    let messages = sortPage([...pageOf(61), ...pageOf(null)])   // older page + latest
    const before = messages.length
    // Poll returns the same latest page → nothing changes, nothing dropped.
    const same = mergeLatest(messages, pageOf(null))
    expect(same.merged).toHaveLength(before)
    expect(same.appendedIds).toEqual([])
    // A new incoming message arrives:
    const withNew = mergeLatest(messages, [...pageOf(null).slice(1), msg(121, 1120)])
    expect(withNew.merged[withNew.merged.length - 1].id).toBe(121)
    expect(withNew.appendedIds).toEqual([121])
    expect(withNew.merged.filter(m => m.id <= 60).length).toBeGreaterThan(0)   // history intact
  })
})

describe('scroll rules', () => {
  it('near-bottom threshold drives autoscroll vs indicator', () => {
    expect(isNearBottom(1000, 1500, 400)).toBe(true)    // 100px from bottom
    expect(isNearBottom(500, 1500, 400)).toBe(false)    // deep in history
    expect(NEAR_BOTTOM_PX).toBe(120)
    expect(TOP_TRIGGER_PX).toBe(80)
  })
  it('ChatWindow preserves position on prepend and never yanks readers', () => {
    expect(chat).toContain('el.scrollTop += el.scrollHeight - prev.scrollHeight')   // prepend preservation
    expect(chat).toContain('if (nearBottomRef.current) scrollToBottom')             // append near bottom
    expect(chat).toContain('setShowNewIndicator(true)')                             // append while reading
    expect(chat).toContain('New messages')
    expect(chat).not.toContain('scrollIntoView')          // the unconditional yank is gone
    expect(chat).toContain('useLayoutEffect')             // adjust before paint
  })
  it('loading / retry / beginning states exist and never blank the thread', () => {
    expect(chat).toContain('Loading earlier messages…')
    expect(chat).toContain('Could not load earlier messages.')
    expect(chat).toContain('Retry')
    expect(chat).toContain('Beginning of conversation')
  })
  it('mobile: single scroll container with touch-friendly overflow', () => {
    expect(chat).toContain('overflow-y-auto overscroll-contain')
    expect(chat).toContain("WebkitOverflowScrolling: 'touch'")
    expect((chat.match(/overflow-y-auto/g) ?? []).length).toBe(1)
    expect(page).toContain('h-[100dvh]')                  // modern viewport height (already present)
  })
})

describe('server pagination + RBAC', () => {
  it('the proxy forwards a validated numeric before-cursor to Chatwoot', () => {
    expect(route).toContain("searchParams.get('before')")
    expect(route).toContain('/^\\d+$/.test(before)')
    expect(route).toContain('?before=${before}')
  })
  it('messages are session-gated and history depth is never filtered by staff (omnichannel history)', () => {
    expect(route).toContain('getAdminSession')
    expect(route).toContain("{ status: 401 }")
    // Conversation-level access control lives in lib/inbox/authz (INBOX-0S.2);
    // the route itself must not thin out message pages per staff member.
    expect(route).not.toMatch(/assignee|staffId|session\.email/)
  })
  it('the page polls with the merging refresh, not the replacing initial fetch', () => {
    expect(page).toContain('refreshMessages(selectedRef.current.id)')
    expect(page).toContain('mergeLatest(prev, sortPage(page)).merged')
    expect(page).toContain('loadOlderMessages')
  })
  it('composer and sending untouched', () => {
    expect(chat).toContain('<ReplyBox onSend={onSend} disabled={isResolved} />')
    expect(read('app/admin/inbox/components/ReplyBox.tsx')).toContain('Private')
  })
})
