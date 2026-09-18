'use client'
import { CWConversation, CWAgent, initials, channelIcon } from '../types'
import { AssignDropdown } from './AssignDropdown'

/** Session-only application linkage (UX-2 — no persistence yet). */
export interface LinkedAppSummary {
  walzRef: string
  applicationType?: string
  status?: string
}

interface Props {
  conv:     CWConversation
  agents:   CWAgent[]
  onAssign: (agentId: number) => Promise<void>
  onResolve: () => Promise<void>
  onReopen:  () => Promise<void>
  /** Verified in THIS session via the lookup drawer; null → "No application linked". */
  linkedApp?: LinkedAppSummary | null
  /** Opens the Secure Application Lookup drawer. */
  onOpenLookup?: () => void
  /** 'overlay' renders full-width for the mobile client-details overlay. */
  variant?: 'rail' | 'overlay'
}

function formatDate(ts: number): string {
  return new Date(ts > 1e12 ? ts : ts * 1000).toLocaleDateString([], {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function ClientInfo({ conv, agents, onAssign, onResolve, onReopen, linkedApp, onOpenLookup, variant = 'rail' }: Props) {
  const sender = conv.meta?.sender
  const isResolved = conv.status === 'resolved'

  return (
    <div className={variant === 'overlay'
      ? 'w-full flex flex-col bg-white h-full overflow-y-auto'
      : 'w-72 flex-shrink-0 flex flex-col bg-white border-l border-walz-border h-full overflow-y-auto'
    }>

      {/* Client */}
      <div className="p-4 border-b border-walz-border">
        <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Client</p>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-walz-navy flex items-center justify-center text-sm font-bold text-walz-gold">
            {initials(sender?.name ?? '?')}
          </div>
          <div>
            <p className="text-sm font-semibold text-walz-deep-navy">{sender?.name ?? 'Unknown'}</p>
            <p className="text-[10px] text-walz-muted-strong">{channelIcon(conv)} {conv.channel?.replace('Channel::', '') ?? 'Web'}</p>
          </div>
        </div>
        {sender?.email && (
          <div className="mb-1.5">
            <p className="text-[10px] text-walz-muted-strong uppercase tracking-wide">Email</p>
            <p className="text-xs text-walz-navy break-all">{sender.email}</p>
          </div>
        )}
        {sender?.phone_number && (
          <div>
            <p className="text-[10px] text-walz-muted-strong uppercase tracking-wide">Phone</p>
            <p className="text-xs text-walz-navy">{sender.phone_number}</p>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="p-4 border-b border-walz-border">
        <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Conversation</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-walz-muted-strong">ID</span>
            <span className="text-xs text-walz-navy font-mono">#{conv.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-walz-muted-strong">Started</span>
            <span className="text-xs text-walz-navy">{formatDate(conv.created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-walz-muted-strong">Status</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              conv.status === 'open'     ? 'bg-green-500/15 text-green-700' :
              conv.status === 'resolved' ? 'bg-gray-500/15 text-gray-600' :
                                           'bg-amber-500/15 text-amber-700'
            }`}>
              {conv.status}
            </span>
          </div>
        </div>
      </div>

      {/* Assignee */}
      <div className="p-4 border-b border-walz-border">
        <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Assigned To</p>
        <AssignDropdown
          agents={agents}
          current={conv.meta?.assignee ?? conv.assignee}
          onAssign={onAssign}
        />
      </div>

      {/* Application — v1 session-only linkage (no conversation→application persistence yet) */}
      <div className="p-4 border-b border-walz-border">
        <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Application</p>
        {linkedApp ? (
          <div className="space-y-1.5">
            <p className="text-xs text-walz-navy font-mono">{linkedApp.walzRef}</p>
            {linkedApp.applicationType && (
              <p className="text-xs text-walz-deep-navy">{linkedApp.applicationType}</p>
            )}
            {linkedApp.status && (
              <p className="text-[10px] text-walz-muted-strong">Status: <span className="text-walz-navy font-semibold">{linkedApp.status}</span></p>
            )}
            <button
              onClick={onOpenLookup}
              className="w-full mt-1 py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors border border-walz-border"
            >
              Open Application
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-walz-muted-strong">No application linked</p>
            <button
              onClick={onOpenLookup}
              className="w-full py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors border border-walz-border"
            >
              🔍 Link Application
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4">
        <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Actions</p>
        <div className="space-y-2">
          {!isResolved ? (
            <button
              onClick={onResolve}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              ✓ Mark Resolved
            </button>
          ) : (
            <button
              onClick={onReopen}
              className="w-full py-2 rounded-lg bg-blue-600/10 text-blue-700 text-xs font-semibold hover:bg-blue-600/15 transition-colors border border-blue-600/20"
            >
              ↩ Reopen
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
