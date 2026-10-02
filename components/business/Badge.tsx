// components/business/Badge.tsx — Walz Business (V1-B)
// Small shared presentation helpers reused across Dashboard/Requests/
// Travellers/Team — status pills and the travel-request status mapping.
// Presentation only: carries no authorization meaning whatsoever.

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-50 text-blue-700',
  warning: 'bg-amber-50 text-amber-700',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  gold: 'bg-[#C9A84C]/15 text-[#8a6d1f]',
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  )
}

const REQUEST_STATUS_TONE: Record<string, keyof typeof TONE_CLASSES> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  AWAITING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

export function RequestStatusBadge({ status }: { status: string }) {
  return <Badge tone={REQUEST_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>
}

const MEMBERSHIP_STATUS_TONE: Record<string, keyof typeof TONE_CLASSES> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
  REMOVED: 'neutral',
}

export function MembershipStatusBadge({ status }: { status: string }) {
  return <Badge tone={MEMBERSHIP_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
}

const CLAIM_STATE_TONE: Record<string, keyof typeof TONE_CLASSES> = {
  claimed: 'success',
  pending: 'warning',
  expired: 'danger',
  none: 'neutral',
}
const CLAIM_STATE_LABEL: Record<string, string> = {
  claimed: 'Account linked',
  pending: 'Invite sent',
  expired: 'Invite expired',
  none: 'Not linked',
}

export function ClaimStateBadge({ state }: { state: 'claimed' | 'pending' | 'expired' | 'none' }) {
  return <Badge tone={CLAIM_STATE_TONE[state]}>{CLAIM_STATE_LABEL[state]}</Badge>
}
