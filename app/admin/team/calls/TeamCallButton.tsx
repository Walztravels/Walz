'use client'

/**
 * Walz Team Hub V1 — "call this person" button for a DM header.
 *
 * Self-contained: reads `placeCall`/`status` from useTeamCallDeviceContext(),
 * so a UI-building agent can drop `<TeamCallButton conversationId={...}
 * calleeStaffId={...} calleeName={...} />` into a DM header anywhere inside
 * a `<TeamCallDeviceProvider>` subtree.
 */

import { Phone } from 'lucide-react'
import { useTeamCallDeviceContext } from './useTeamCallDevice'

export interface TeamCallButtonProps {
  conversationId: string
  calleeStaffId: string
  calleeName: string
}

export function TeamCallButton({ conversationId, calleeStaffId, calleeName }: TeamCallButtonProps) {
  const { status, placeCall } = useTeamCallDeviceContext()
  const disabled = status !== 'READY'

  return (
    <button
      type="button"
      onClick={() => void placeCall(conversationId, calleeStaffId)}
      disabled={disabled}
      aria-label={`Call ${calleeName}`}
      title={disabled ? 'Calling is not ready yet' : `Call ${calleeName}`}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Phone className="w-4 h-4" strokeWidth={1.5} />
      Call
    </button>
  )
}
