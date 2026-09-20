/**
 * Walz Team Hub V1 UI — `?c=<conversationId>` deep-link parsing
 * (lib/deepLink.ts). Backs page.tsx's `?c=` auto-select-on-load effect,
 * the same convention the Inbox's own useInboxScreens.ts and the Inbox's
 * "Ask Team" hand-off (AskTeamPanel.tsx → `/admin/team?c=<id>`) both rely on.
 */
import { parseDeepLinkConversationId } from '@/app/admin/team/lib/deepLink'

describe('parseDeepLinkConversationId', () => {
  it('extracts the conversation id from a URLSearchParams instance', () => {
    const params = new URLSearchParams('c=abc123')
    expect(parseDeepLinkConversationId(params)).toBe('abc123')
  })

  it('extracts the conversation id from a raw query string', () => {
    expect(parseDeepLinkConversationId('?c=xyz789')).toBe('xyz789')
    expect(parseDeepLinkConversationId('c=xyz789')).toBe('xyz789')
  })

  it('returns null when there is no "c" param', () => {
    expect(parseDeepLinkConversationId('?foo=bar')).toBeNull()
    expect(parseDeepLinkConversationId('')).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(parseDeepLinkConversationId(null)).toBeNull()
    expect(parseDeepLinkConversationId(undefined)).toBeNull()
  })

  it('returns null for a blank/whitespace-only "c" param rather than an empty string', () => {
    expect(parseDeepLinkConversationId('c=%20%20')).toBeNull()
  })

  it('ignores unrelated params alongside "c"', () => {
    const params = new URLSearchParams('foo=bar&c=conv-42&baz=qux')
    expect(parseDeepLinkConversationId(params)).toBe('conv-42')
  })
})
