/**
 * Walz Team Hub V1 — `?c=<conversationId>` deep-link parsing.
 *
 * Mirrors the Inbox's own `?c=` convention (app/admin/inbox/useInboxScreens.ts)
 * so the NotificationBell deep-link and the Inbox "Ask Team" hand-off
 * (AskTeamPanel.tsx navigates to `/admin/team?c=<teamConversationId>`) both
 * land correctly. Pure/framework-free so the parsing itself is directly
 * unit testable (see __tests__/team-ui-deep-link.test.ts); the effect that
 * reads it lives in page.tsx via useSearchParams().
 */
export function parseDeepLinkConversationId(search: URLSearchParams | string | null | undefined): string | null {
  if (!search) return null
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const raw = params.get('c')
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}
