/**
 * Walz Team Hub V1 — "Prepare Client Reply" cross-product handoff contract.
 *
 * Team Hub's Jade integration can draft a suggested CLIENT-facing reply
 * from an authorized internal discussion, but it must land in the Inbox's
 * OWN composer/review/send flow — never send anything itself (owner
 * "NO AUTO-SEND" invariant). Since ComposerDraftContext (app/admin/inbox/
 * ComposerDraftContext.tsx) is scoped to the Inbox page's own React tree,
 * a genuinely different page (/admin/team) cannot reach into it directly.
 *
 * This module is the deliberately narrow, browser-sessionStorage-based
 * bridge: Team Hub writes a pending draft keyed by the target Inbox
 * conversation id, then navigates the staff member to
 * `/admin/inbox?c=<id>`; ReplyBox.tsx (Inbox side) reads and immediately
 * clears it on mount. It is advisory PREFILL TEXT ONLY — never trusted as
 * authorization for anything. The staff member must already be able to
 * open that Inbox conversation through the Inbox's own existing,
 * unmodified authorization (checkConversationAccess/checkInboxPermission)
 * for the text to ever become visible, and must still press Send through
 * the Inbox's own existing, unmodified send path for it to ever reach a
 * client — satisfying the required logical AND (Team Hub discussion
 * authorization, checked when the draft was generated, AND Inbox
 * conversation authorization, checked exactly as it always is when the
 * Inbox page loads that conversation) without needing any new
 * authorization code on the Inbox side at all.
 */

const PREFIX = 'teamhub:pendingClientDraft:'
const MAX_AGE_MS = 15 * 60 * 1000 // stale after 15 minutes — never silently resurrect an old draft

interface PendingDraft {
  text: string
  createdAt: number
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.sessionStorage
}

/** Called from Team Hub after the staff member reviews and accepts a Jade-suggested client reply. */
export function writePendingClientDraft(inboxConversationId: string | number, text: string): void {
  if (!isBrowser()) return
  try {
    const payload: PendingDraft = { text, createdAt: Date.now() }
    window.sessionStorage.setItem(PREFIX + String(inboxConversationId), JSON.stringify(payload))
  } catch {
    // sessionStorage unavailable (private mode, quota) — the handoff simply doesn't happen; not fatal.
  }
}

/**
 * Called from the Inbox composer on mount/conversation-id-change. Reads
 * AND clears in one call — a pending draft is consumed exactly once, so a
 * remount, refresh, or navigating away and back never re-inserts it.
 */
export function consumePendingClientDraft(inboxConversationId: string | number): string | null {
  if (!isBrowser()) return null
  const key = PREFIX + String(inboxConversationId)
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    window.sessionStorage.removeItem(key)
    const parsed = JSON.parse(raw) as PendingDraft
    if (!parsed?.text || typeof parsed.createdAt !== 'number') return null
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) return null
    return parsed.text
  } catch {
    return null
  }
}
