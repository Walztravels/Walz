/**
 * Walz Team Hub V1 — @mention trigger parsing for the composer's
 * autocomplete dropdown. Pure, framework-free (no DOM) so it's directly
 * unit testable (see __tests__/team-ui-mention-parse.test.ts).
 *
 * Security note: this module only decides WHEN to show the dropdown and
 * WHAT partial name to search for — the actual candidate list always comes
 * from GET .../conversations/[id]/members?q=, which is membership-scoped
 * server-side (see that route's header comment). This module never
 * fabricates or caches a global staff list, so it cannot leak private-
 * channel membership regardless of what it's fed.
 */

export interface MentionTrigger {
  /** Index into the text where the triggering '@' sits. */
  start: number
  /** Partial name typed after '@' so far (may be empty right after typing '@'). */
  query: string
}

const TRIGGER_RE = /(?:^|\s)@([A-Za-z0-9_.'-]{0,32})$/

/**
 * Looks backwards from the cursor for an active, unclosed "@partial" token.
 * Returns null once the token is broken by whitespace beyond the allowed
 * name characters, or if the cursor isn't immediately after such a token.
 */
export function findMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  if (cursor < 0 || cursor > text.length) return null
  const upToCursor = text.slice(0, cursor)
  const match = TRIGGER_RE.exec(upToCursor)
  if (!match) return null
  const query = match[1]
  const start = upToCursor.length - query.length - 1 // position of '@' itself
  return { start, query }
}

/** Applies a selected mention, replacing the "@partial" token with "@Full Name " and returning the new cursor position. */
export function applyMentionSelection(
  text: string,
  trigger: MentionTrigger,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const before = text.slice(0, trigger.start)
  const after = text.slice(cursor)
  const inserted = `@${name} `
  return { text: before + inserted + after, cursor: (before + inserted).length }
}
