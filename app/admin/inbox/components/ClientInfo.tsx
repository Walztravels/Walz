'use client'
import { useCallback, useEffect, useState } from 'react'
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
  /** UX-4.1B: opens the page-level Request Payment drawer. */
  onOpenPaymentRequest?: () => void
  /** UX-4.2: opens the page-level Create Quote drawer. */
  onOpenCreateQuote?: () => void
  /** UX-4.3: opens the page-level Visa Form drawer. */
  onOpenVisaForm?: () => void
  /** UX-4.1C: opens the Find/Create client identity drawer in the given mode. */
  onOpenClientIdentity?: (mode: 'find' | 'create') => void
  /** UX-4.1C: bump after a successful link/create to force the status panel to refetch. */
  identityRefreshToken?: number
  /** 'overlay' renders full-width for the mobile client-details overlay. */
  variant?: 'rail' | 'overlay'
}

function formatDate(ts: number): string {
  return new Date(ts > 1e12 ? ts : ts * 1000).toLocaleDateString([], {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── UX-4.1A — server-authoritative client identity status ────────────────────

/** Narrow slice of the client-context DTO this panel renders. */
interface ClientContextSlice {
  resolution:  'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  application: { walzRef: string; applicationType: string; status: string } | null
  link:        { linkMethod: string; clientReference: string | null } | null
  user:          { name: string | null } | null
  clientAccount: { name: string | null } | null
  prismaLead:    { name: string | null } | null
}

/** UX-4.1C: name + reference to show for a LINKED customer with no
 *  VisaApplication — first-time/legacy customers linked via Find/Create. */
function linkedDisplay(ctx: ClientContextSlice): { name: string | null; reference: string | null } {
  const name = ctx.user?.name ?? ctx.clientAccount?.name ?? ctx.prismaLead?.name ?? null
  return { name, reference: ctx.link?.clientReference ?? null }
}

type ContextState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; context: ClientContextSlice }

/**
 * Compact CLIENT status block — reads /client-context on conversation
 * change (rail and overlay variants share this component, so both get it).
 * Never fabricates identity: only the server's resolution is rendered.
 */
function ClientIdentityStatus({
  conversationId, onOpenLookup, onOpenPaymentRequest, onOpenCreateQuote, onOpenVisaForm,
  onOpenClientIdentity, identityRefreshToken,
}: {
  conversationId: number
  onOpenLookup?: () => void
  /** UX-4.1B: opens the Request Payment drawer (page-level). */
  onOpenPaymentRequest?: () => void
  /** UX-4.2: opens the Create Quote drawer (page-level). */
  onOpenCreateQuote?: () => void
  /** UX-4.3: opens the Visa Form drawer (page-level). */
  onOpenVisaForm?: () => void
  /** UX-4.1C: opens the Find/Create client identity drawer in the given mode. */
  onOpenClientIdentity?: (mode: 'find' | 'create') => void
  /** UX-4.1C: bump this after a successful link/create to force a refetch —
   *  identity mutations happen in a page-level drawer, outside this component. */
  identityRefreshToken?: number
}) {
  const [state, setState] = useState<ContextState>({ phase: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const retry = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    fetch(`/api/admin/inbox/conversations/${conversationId}/client-context`)
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json() as { context?: ClientContextSlice }
        if (!data?.context?.resolution) throw new Error('bad payload')
        if (!cancelled) setState({ phase: 'ready', context: data.context })
      })
      .catch(() => { if (!cancelled) setState({ phase: 'error' }) })
    return () => { cancelled = true }
  }, [conversationId, reloadKey, identityRefreshToken])

  return (
    <div className="p-4 border-b border-walz-border">
      <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-3">Client Status</p>

      {state.phase === 'loading' && (
        <>
          <span className="sr-only" role="status">Loading client status</span>
          <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
            <div className="h-5 w-24 rounded-full bg-walz-navy/10" />
            <div className="h-3 w-32 rounded bg-walz-navy/10" />
          </div>
        </>
      )}

      {state.phase === 'error' && (
        <div className="space-y-2">
          <p className="text-xs text-walz-muted-strong">Could not load client context.</p>
          <button
            onClick={retry}
            className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors border border-walz-border"
          >
            Retry
          </button>
        </div>
      )}

      {state.phase === 'ready' && (() => {
        const { resolution, application } = state.context
        const identityOk = resolution === 'VERIFIED' || resolution === 'LINKED'
        // UX-4.1B/4.2 QUICK ACTIONS — live actions gated on the server's
        // hard invariant (VERIFIED/LINKED only, re-enforced on every
        // mutation); future actions stay a muted roadmap line, never
        // clickable dead buttons.
        const quickActions = (onOpenPaymentRequest || onOpenCreateQuote || onOpenVisaForm) ? (
          <div className="pt-3 mt-3 border-t border-walz-border space-y-2">
            <p className="text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest">Quick Actions</p>
            {onOpenPaymentRequest && (
              <button
                onClick={onOpenPaymentRequest}
                disabled={!identityOk}
                className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy text-walz-gold text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Request Payment
              </button>
            )}
            {onOpenCreateQuote && (
              <button
                onClick={onOpenCreateQuote}
                disabled={!identityOk}
                className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Quote
              </button>
            )}
            {onOpenVisaForm && (
              <button
                onClick={onOpenVisaForm}
                disabled={!identityOk}
                className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Visa Form
              </button>
            )}
            {!identityOk && (
              <p className="text-[10px] text-walz-muted-strong">Verify client identity first</p>
            )}
            <p className="text-[10px] text-walz-muted-strong" aria-hidden="true">
              Itinerary — coming with the next release
            </p>
          </div>
        ) : null
        if (resolution === 'VERIFIED') {
          return (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-700">
                ✓ Verified
              </span>
              {application && (
                <>
                  <p className="text-xs text-walz-navy font-mono">{application.walzRef}</p>
                  <p className="text-[10px] text-walz-muted-strong">{application.applicationType}</p>
                </>
              )}
              {quickActions}
            </div>
          )
        }
        if (resolution === 'LINKED') {
          const { name: linkedName, reference: linkedReference } = linkedDisplay(state.context)
          return (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-walz-navy/10 text-walz-navy">
                Linked
              </span>
              {application ? (
                <p className="text-xs text-walz-navy font-mono">{application.walzRef}</p>
              ) : (
                <>
                  {linkedName && <p className="text-xs font-semibold text-walz-deep-navy">{linkedName}</p>}
                  {linkedReference && <p className="text-xs text-walz-navy font-mono">{linkedReference}</p>}
                </>
              )}
              {quickActions}
            </div>
          )
        }
        // HEURISTIC and UNRESOLVED both require explicit verification before
        // any client action — nothing is assumed on the client's behalf.
        return (
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
              Client identity required
            </span>
            {/* UX-4.1C: first-time/legacy customers rarely have an
                application reference in hand — Find/Create are the primary
                actions; the OTP-verified path (unchanged) stays available
                as a secondary link for customers who DO have one. */}
            {onOpenClientIdentity && (
              <>
                <button
                  onClick={() => onOpenClientIdentity('find')}
                  className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy text-walz-gold text-xs font-semibold hover:bg-walz-deep-navy transition-colors"
                >
                  Find existing client
                </button>
                <button
                  onClick={() => onOpenClientIdentity('create')}
                  className="w-full min-h-[44px] py-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
                >
                  + Create new client
                </button>
              </>
            )}
            <button
              onClick={onOpenLookup}
              className="w-full min-h-[44px] py-2 rounded-lg text-walz-navy text-xs font-semibold hover:underline"
            >
              Verify via application reference
            </button>
            {quickActions}
          </div>
        )
      })()}
    </div>
  )
}

export function ClientInfo({ conv, agents, onAssign, onResolve, onReopen, linkedApp, onOpenLookup, onOpenPaymentRequest, onOpenCreateQuote, onOpenVisaForm, onOpenClientIdentity, identityRefreshToken, variant = 'rail' }: Props) {
  const sender = conv.meta?.sender
  const isResolved = conv.status === 'resolved'

  return (
    <div className={variant === 'overlay'
      ? 'w-full flex flex-col bg-white h-full overflow-y-auto'
      : 'w-72 flex-shrink-0 flex flex-col bg-white border-l border-walz-border h-full overflow-y-auto'
    }>

      {/* Client identity status — UX-4.1A server-authoritative resolution */}
      <ClientIdentityStatus
        conversationId={conv.id}
        onOpenLookup={onOpenLookup}
        onOpenPaymentRequest={onOpenPaymentRequest}
        onOpenCreateQuote={onOpenCreateQuote}
        onOpenVisaForm={onOpenVisaForm}
        onOpenClientIdentity={onOpenClientIdentity}
        identityRefreshToken={identityRefreshToken}
      />

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
