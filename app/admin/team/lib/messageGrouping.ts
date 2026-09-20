/**
 * Walz Team Hub V1 — grouped-by-sender collapsing for GROUP/CHANNEL message
 * lists (Slack/Teams density). Pure, framework-free so it's directly unit
 * testable (see __tests__/team-ui-message-grouping.test.ts).
 *
 * Rule (architecture audit, do not deviate): 1:1 DMs render as two-party
 * bubbles (MessageBubble.tsx's own treatment structurally assumes exactly 2
 * participants); GROUP/CHANNEL conversations collapse consecutive messages
 * from the SAME author, within a short time window, under one name/avatar
 * header instead of repeating it per message.
 */

export interface GroupableMessage {
  id: string
  authorId: string
  createdAt: string | Date
}

export interface MessageGroup<T extends GroupableMessage> {
  authorId: string
  messages: T[]
}

/** Consecutive same-author messages collapse into one group as long as the gap between them stays within `windowMs`. */
export const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000

export function groupMessagesBySender<T extends GroupableMessage>(
  messages: T[],
  windowMs: number = DEFAULT_GROUPING_WINDOW_MS,
): MessageGroup<T>[] {
  const groups: MessageGroup<T>[] = []

  for (const message of messages) {
    const lastGroup = groups[groups.length - 1]
    const lastMessage = lastGroup?.messages[lastGroup.messages.length - 1]

    const sameAuthor = lastGroup !== undefined && lastGroup.authorId === message.authorId
    const withinWindow =
      lastMessage !== undefined &&
      new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() <= windowMs

    if (sameAuthor && withinWindow) {
      lastGroup.messages.push(message)
    } else {
      groups.push({ authorId: message.authorId, messages: [message] })
    }
  }

  return groups
}
