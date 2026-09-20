'use client'

/**
 * Walz Team Hub V1 — "Priscilla started a call — Join Call" lightweight
 * internal event banner. Deliberately NOT a persisted TeamMessage system
 * message (per product spec: "do not create excessive system messages if
 * a lighter call-event presentation fits better") — purely a rendering of
 * the currently-active-call poll state (useActiveGroupCall, owned by
 * ConversationPane), so it appears/disappears automatically as the call
 * starts/ends with zero message-history pollution and no extra writes.
 * Hidden entirely once the current staff member is already on this call.
 */

import { PhoneCall } from 'lucide-react'
import { useTeamCallDeviceContext } from './useTeamCallDevice'
import type { ActiveGroupCall } from '../types'

export interface GroupCallBannerProps {
  conversationId: string
  activeCall: ActiveGroupCall | null
}

export function GroupCallBanner({ conversationId, activeCall }: GroupCallBannerProps) {
  const { activeCall: myActiveCall, joinGroupCall } = useTeamCallDeviceContext()

  if (!activeCall) return null
  const alreadyOnThisCall = myActiveCall?.type === 'GROUP' && myActiveCall.callRecordId === activeCall.id
  if (alreadyOnThisCall) return null

  const participantLabel = activeCall.participantCount === 1 ? '1 person' : `${activeCall.participantCount} people`

  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-emerald-600/10 border-b border-emerald-600/20 text-xs">
      <span className="text-walz-deep-navy flex items-center gap-1.5 min-w-0">
        <PhoneCall className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
        <span className="truncate">{activeCall.callerName} started a call · {participantLabel} on the call</span>
      </span>
      <button
        onClick={() => void joinGroupCall(conversationId, activeCall.id)}
        className="flex-shrink-0 min-h-[44px] lg:min-h-[32px] px-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
      >
        Join Call
      </button>
    </div>
  )
}
