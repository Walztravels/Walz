/**
 * Walz Team Hub V1 — client-side types mirroring the already-built API's
 * exact response shapes (see each route file under app/api/admin/team/**
 * for the authoritative shape this must stay in sync with). This UI layer
 * never invents fields the API doesn't actually return.
 */

export type ConversationType = 'DM' | 'GROUP' | 'CHANNEL'
export type ConversationVisibility = 'PUBLIC' | 'PRIVATE'

export interface TeamConversationSummary {
  id: string
  type: ConversationType
  name: string | null
  description?: string | null
  slug?: string | null
  dmKey?: string | null
  visibility?: ConversationVisibility
  joinable?: boolean
  archived?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface TeamConversationMemberSummary {
  staffId: string
  role: string
  name: string
  roleTitle: string | null
  department: string | null
}

export interface TeamConversationDetail {
  id: string
  type: ConversationType
  name: string | null
  description: string | null
  slug: string | null
  visibility: ConversationVisibility
  joinable: boolean
  archived: boolean
  members: TeamConversationMemberSummary[]
  myMembership: { role?: string; lastReadAt: string | null }
}

export interface TeamMessageAttachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
}

export interface TeamMessageReaction {
  staffId: string
  emoji: string
}

export interface TeamMessage {
  id: string
  authorId: string
  authorName: string
  body: string | null
  deleted: boolean
  editedAt: string | null
  parentMessageId: string | null
  replyCount: number
  reactions: TeamMessageReaction[]
  attachments: TeamMessageAttachment[]
  mentionedStaffIds: string[]
  createdAt: string
}

export interface StaffDirectoryEntry {
  id: string
  name: string
  role: string | null
  department: string | null
  status: string
}

export type InboxLinkStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED'

export interface TeamInboxLink {
  id: string
  messageId: string
  inboxConversationId: number
  status: InboxLinkStatus
  createdAt: string
  updatedAt: string
}

export interface TeamCallHistoryEntry {
  id: string
  callerId: string
  calleeIds: string[]
  status: string
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSeconds: number | null
}

export interface ActiveGroupCall {
  id: string
  callerId: string
  callerName: string
  startedAt: string
  participantCount: number
}

export interface CurrentStaff {
  id: string
  name: string
  email: string
}
