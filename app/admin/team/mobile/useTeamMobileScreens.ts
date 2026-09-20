'use client'

/**
 * Walz Team Hub V1 — mobile screen-state navigation, mirroring the exact
 * shape of app/admin/inbox/useInboxScreens.ts: `screen: 'list' | 'chat'`
 * plus an open thread as a SECOND, independent overlay flag (never a third
 * mutually-exclusive screen) that is force-closed on every screen change.
 */
import { useCallback, useState } from 'react'

export type TeamMobileScreen = 'list' | 'chat'

export interface TeamMobileScreensApi {
  screen: TeamMobileScreen
  /** The open thread's root messageId, or null. An overlay, not a screen. */
  threadOpen: string | null
  openThread: (messageId: string) => void
  closeThread: () => void
  goToChat: () => void
  goToList: () => void
}

export function useTeamMobileScreens(): TeamMobileScreensApi {
  const [screen, setScreen] = useState<TeamMobileScreen>('list')
  const [threadOpen, setThreadOpen] = useState<string | null>(null)

  const goToChat = useCallback(() => { setScreen('chat'); setThreadOpen(null) }, [])
  const goToList = useCallback(() => { setScreen('list'); setThreadOpen(null) }, [])
  const openThread = useCallback((messageId: string) => setThreadOpen(messageId), [])
  const closeThread = useCallback(() => setThreadOpen(null), [])

  return { screen, threadOpen, openThread, closeThread, goToChat, goToList }
}
