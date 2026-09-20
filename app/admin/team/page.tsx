'use client'

/**
 * Walz Team Hub V1 — top-level page. Mounts the shared Twilio calling
 * device provider + incoming-call overlay ONCE (per those files' own header
 * comments), reads `?c=<conversationId>` from the URL on load (mirroring
 * the Inbox's own `useSearchParams().get('c')` deep-link convention — this
 * is exactly what NotificationBell deep-links and the Inbox's "Ask Team"
 * hand-off, AskTeamPanel.tsx's `/admin/team?c=<id>` link, both rely on),
 * and renders the responsive TeamWorkspaceShell.
 *
 * Reuses the same [data-inbox-fullbleed] full-height/no-double-scroll
 * mechanism the Inbox route already established (app/globals.css /
 * app/admin/layout.tsx) — a generic admin-shell convention despite its
 * inbox-era name, not an edit to either of those files.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { TeamCallDeviceProvider } from './calls/useTeamCallDevice'
import { IncomingCallOverlay } from './calls/IncomingCallOverlay'
import { TeamWorkspaceShell } from './TeamWorkspaceShell'
import { parseDeepLinkConversationId } from './lib/deepLink'

function TeamPageInner() {
  const searchParams = useSearchParams()
  const initialConversationId = parseDeepLinkConversationId(searchParams)

  return (
    <div data-inbox-fullbleed className="flex h-full bg-walz-off-white overflow-hidden">
      <TeamWorkspaceShell initialConversationId={initialConversationId} />
    </div>
  )
}

export default function TeamHubPage() {
  return (
    <TeamCallDeviceProvider>
      <IncomingCallOverlay />
      <Suspense fallback={<div className="flex h-full items-center justify-center text-walz-muted-strong text-sm">Loading…</div>}>
        <TeamPageInner />
      </Suspense>
    </TeamCallDeviceProvider>
  )
}
