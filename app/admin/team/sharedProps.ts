/**
 * Walz Team Hub V1 — the bundle of state/handlers TeamWorkspaceShell.tsx
 * computes once and forwards to whichever breakpoint tree is active
 * (Desktop/Tablet/Mobile), so conversation loading, the selected
 * conversation's message hook, and every overlay's open/close state exist
 * exactly once regardless of viewport.
 */
import type { UseTeamConversationsResult } from './hooks/useTeamConversations'
import type { UseSelectedConversationResult } from './hooks/useSelectedConversation'
import type { CurrentStaff, TeamInboxLink, TeamMessage } from './types'

export interface TeamWorkspaceSharedProps {
  currentStaff: CurrentStaff | null
  conversations: UseTeamConversationsResult
  selectedId: string | null
  selectConversation: (id: string) => void
  joinChannel: (id: string) => void
  selected: UseSelectedConversationResult
  threadRootId: string | null
  threadRootMessage: TeamMessage | null
  openThread: (id: string) => void
  closeThread: () => void
  inboxLink: TeamInboxLink | null
  onLinkChanged: (link: TeamInboxLink) => void
  activeInboxConversationId: number | null
  onOpenDirectory: () => void
  onOpenCreate: () => void
  onOpenMembers: () => void
  onOpenCallHistory: () => void
}
