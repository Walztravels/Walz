'use client'

/**
 * Walz Team Hub V1 — "Start Call" / "Join Call" button for a GROUP/CHANNEL
 * header. Self-contained: reads startOrJoinGroupCall/joinGroupCall/status
 * from useTeamCallDeviceContext(); the active-call state itself is passed
 * in as a prop (owned by ConversationPane's single useActiveGroupCall poll,
 * shared with GroupCallBanner, rather than each component polling its own
 * copy of the same endpoint).
 */

import { Phone, PhoneCall } from 'lucide-react'
import { useTeamCallDeviceContext } from './useTeamCallDevice'
import type { ActiveGroupCall } from '../types'

export interface GroupCallButtonProps {
  conversationId: string
  activeCall: ActiveGroupCall | null
}

export function GroupCallButton({ conversationId, activeCall }: GroupCallButtonProps) {
  const { status, activeCall: myActiveCall, startOrJoinGroupCall, joinGroupCall } = useTeamCallDeviceContext()

  const deviceBusy = status !== 'READY' && status !== 'ANSWERED'
  // Already on THIS call in this tab — nothing to do (the persistent
  // call panel already shows Leave/Mute controls).
  const alreadyOnThisCall = myActiveCall?.type === 'GROUP' && myActiveCall.callRecordId === activeCall?.id
  const disabled = deviceBusy || alreadyOnThisCall

  const label = activeCall ? 'Join Call' : 'Start Call'

  function handleClick() {
    if (activeCall) {
      void joinGroupCall(conversationId, activeCall.id)
    } else {
      void startOrJoinGroupCall(conversationId)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? (alreadyOnThisCall ? 'You are already on this call' : 'Calling is not ready yet') : label}
      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] lg:min-h-0 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
    >
      {activeCall ? <PhoneCall className="w-4 h-4" strokeWidth={1.5} /> : <Phone className="w-4 h-4" strokeWidth={1.5} />}
      {label}
    </button>
  )
}
