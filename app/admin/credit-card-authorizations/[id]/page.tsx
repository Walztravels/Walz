'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { formatCurrencyMinor } from '@/lib/currency'

interface Transaction {
  id:                     string
  amountMinor:            number
  currency:               string
  description:            string
  status:                 string
  requestedBy:            string
  requestedAt:            string
  succeededAt?:           string
  failedAt?:              string
  safeFailureMessage?:    string
  refundedAmountMinor?:   number
  refundedAt?:            string
  refundedBy?:            string
  stripePaymentIntentId?: string
}

interface Event {
  id:          string
  eventType:   string
  staffEmail?: string
  amountMinor?: number
  currency?:   string
  createdAt:   string
}

interface CCA {
  id:                     string
  reference:              string
  status:                 string
  cardholderName:         string
  cardholderEmail:        string
  cardholderPhone?:       string
  cardholderCountry?:     string
  cardholderRelationship: string
  cardholderRelationshipNote?: string
  isPersonalCard:         boolean
  companyName?:           string
  travellerName:          string
  bookingReference?:      string
  travelDates?:           string
  supplier?:              string
  serviceType:            string
  currency:               string
  maxAmountMinor:         number
  totalChargedMinor:      number
  permittedCharges:       string[]
  description:            string
  allowMultipleCharges:   boolean
  validUntil:             string
  signedAt?:              string
  signatureName?:         string
  signatureDataUrl?:      string
  ipAddress?:             string
  cardBrand?:             string
  cardLast4?:             string
  cardExpMonth?:          number
  cardExpYear?:           number
  sentAt?:                string
  openedAt?:              string
  revokedAt?:             string
  revokedBy?:             string
  revocationReason?:      string
  notes?:                 string
  createdAt:              string
  createdBy:              string
  transactions:           Transaction[]
  events:                 Event[]
}

const STATUS_STYLES: Record<string, string> = {
  draft:                   'bg-gray-100 text-gray-600',
  sent:                    'bg-blue-100 text-blue-700',
  opened:                  'bg-indigo-100 text-indigo-700',
  active:                  'bg-green-100 text-green-700',
  authentication_required: 'bg-amber-100 text-amber-700',
  partially_used:          'bg-teal-100 text-teal-700',
  fully_used:              'bg-slate-100 text-slate-600',
  expired:                 'bg-red-100 text-red-600',
  revoked:                 'bg-red-200 text-red-700',
  cancelled:               'bg-gray-200 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  draft:                   'Draft',
  sent:                    'Sent',
  opened:                  'Opened',
  active:                  'Active',
  authentication_required: 'Authentication Required',
  partially_used:          'Partially Used',
  fully_used:              'Fully Used',
  expired:                 'Expired',
  revoked:                 'Revoked',
  cancelled:               'Cancelled',
}

const TX_STATUS_STYLES: Record<string, string> = {
  pending:                 'bg-gray-100 text-gray-600',
  processing:              'bg-blue-100 text-blue-700',
  authentication_required: 'bg-amber-100 text-amber-700',
  paid:                    'bg-green-100 text-green-700',
  failed:                  'bg-red-100 text-red-700',
  refunded:                'bg-purple-100 text-purple-700',
  partially_refunded:      'bg-indigo-100 text-indigo-700',
}

const EVENT_DOTS: Record<string, string> = {
  CREATED:          'bg-blue-500',
  SENT:             'bg-blue-400',
  RESENT:           'bg-blue-300',
  OPENED:           'bg-indigo-400',
  CARD_SAVED:       'bg-teal-400',
  SIGNED:           'bg-green-500',
  CHARGE_REQUESTED: 'bg-yellow-500',
  CHARGE_SUCCEEDED: 'bg-green-500',
  CHARGE_FAILED:    'bg-red-500',
  AUTH_REQUIRED:    'bg-amber-500',
  AUTH_LINK_RESENT: 'bg-amber-400',
  REFUNDED:         'bg-purple-500',
  REVOKED:          'bg-red-600',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex py-2.5 border-b border-gray-50 last:border-0">
      <dt className="text-sm text-gray-500 w-44 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value}</dd>
    </div>
  )
}

export default function CCADetailPage() {
  const { id } = useParams<{ id: string }>()
  const [auth,    setAuth]    = useState<CCA | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Charge modal state
  const [showChargeModal,   setShowChargeModal]   = useState(false)
  const [chargeAmount,      setChargeAmount]      = useState('')
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeLoading,     setChargeLoading]     = useState(false)
  const [chargeError,       setChargeError]       = useState<string | null>(null)

  // Revoke modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [revokeReason,    setRevokeReason]    = useState('')
  const [revokeLoading,   setRevokeLoading]   = useState(false)

  // Action loading
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/credit-card-authorizations/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      setAuth(d.auth)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const r = await fetch(`/api/admin/credit-card-authorizations/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, ...extra }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Action failed')
      if (d.auth) setAuth(d.auth)
      setActionMessage(d.message ?? 'Done.')
      return d
    } catch (e) {
      setActionMessage(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      throw e
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCharge() {
    if (!chargeAmount || parseFloat(chargeAmount) <= 0) {
      setChargeError('Enter a valid amount.')
      return
    }
    setChargeLoading(true)
    setChargeError(null)
    try {
      const d = await doAction('charge', {
        amount:      parseFloat(chargeAmount),
        description: chargeDescription || auth?.description,
      })
      setShowChargeModal(false)
      setChargeAmount('')
      setChargeDescription('')
      if (d.status === 'authentication_required') {
        setActionMessage('3DS authentication required — auth link sent to cardholder.')
      }
    } catch (e) {
      setChargeError(e instanceof Error ? e.message : 'Charge failed.')
    } finally {
      setChargeLoading(false)
    }
  }

  async function handleRevoke() {
    setRevokeLoading(true)
    try {
      await doAction('revoke', { revocationReason: revokeReason })
      setShowRevokeModal(false)
    } finally {
      setRevokeLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-400 py-20">Loading…</div>
  }

  if (error || !auth) {
    return (
      <div className="p-6 text-center text-red-600 py-20">
        {error ?? 'Authorization not found.'}
      </div>
    )
  }

  const isExpired  = new Date() > new Date(auth.validUntil)
  const canSend    = auth.status === 'draft'
  const canResend  = ['sent', 'opened'].includes(auth.status)
  const canCharge  = ['active', 'partially_used'].includes(auth.status) && !isExpired && !!auth.cardLast4
  const canRevoke  = !['revoked', 'cancelled', 'fully_used', 'expired'].includes(auth.status)
  const remaining  = auth.maxAmountMinor - auth.totalChargedMinor

  return (
    <div className="p-6 max-w-screen-lg mx-auto space-y-6">
      {/* Back */}
      <a href="/admin/credit-card-authorizations" className="text-sm text-gray-500 hover:text-gray-800">
        ← Credit Card Authorisations
      </a>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{auth.reference}</h1>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[auth.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[auth.status] ?? auth.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{auth.serviceType} for {auth.travellerName}</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {canSend && (
            <button onClick={() => doAction('send')} disabled={actionLoading}
              className="px-4 py-2 text-sm font-semibold bg-[#0A1628] text-white rounded-lg hover:bg-[#1a2a48] disabled:opacity-50">
              Send to Client
            </button>
          )}
          {canResend && (
            <button onClick={() => doAction('resend')} disabled={actionLoading}
              className="px-4 py-2 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              Resend Link
            </button>
          )}
          {canCharge && (
            <button onClick={() => setShowChargeModal(true)}
              className="px-4 py-2 text-sm font-semibold bg-[#C9A84C] text-[#0A1628] rounded-lg hover:bg-[#b8973d]">
              Charge Card
            </button>
          )}
          {canRevoke && (
            <button onClick={() => setShowRevokeModal(true)}
              className="px-4 py-2 text-sm font-semibold border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
              Revoke
            </button>
          )}
        </div>
      </div>

      {/* Action message */}
      {actionMessage && (
        <div className={`rounded-lg px-4 py-3 text-sm ${actionMessage.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionMessage}
        </div>
      )}

      {/* Auth required banner */}
      {auth.status === 'authentication_required' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-1">Authentication Required</p>
          <p className="text-sm text-amber-700">A charge attempt requires 3DS authentication. An email has been sent to the cardholder.</p>
          {auth.transactions.filter(t => t.status === 'authentication_required').map(tx => (
            <button key={tx.id} onClick={() => doAction('send_auth_link', { transactionId: tx.id })}
              className="mt-2 text-xs font-semibold text-amber-800 underline hover:no-underline">
              Resend auth link for {formatCurrencyMinor(tx.amountMinor, tx.currency)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Amount summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Financial Summary</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 mb-1">Maximum</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrencyMinor(auth.maxAmountMinor, auth.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Charged</p>
                <p className="text-xl font-bold text-teal-700 tabular-nums">{formatCurrencyMinor(auth.totalChargedMinor, auth.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Remaining</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: remaining <= 0 ? '#dc2626' : '#059669' }}>{formatCurrencyMinor(Math.max(0, remaining), auth.currency)}</p>
              </div>
            </div>
            <div className="mt-4 bg-gray-100 rounded-full h-2">
              <div
                className="bg-[#C9A84C] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (auth.totalChargedMinor / auth.maxAmountMinor) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-400">
              <span>Valid until {new Date(auth.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {auth.allowMultipleCharges ? <span>Multiple charges allowed</span> : <span>Single charge only</span>}
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Transactions</h2>
            {auth.transactions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No charges yet.</p>
            ) : (
              <div className="space-y-3">
                {auth.transactions.map(tx => (
                  <div key={tx.id} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{tx.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(tx.requestedAt).toLocaleString('en-GB')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">{formatCurrencyMinor(tx.amountMinor, tx.currency)}</p>
                        <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${TX_STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {tx.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    {tx.status === 'failed' && tx.safeFailureMessage && (
                      <p className="text-xs text-red-600 mt-1">{tx.safeFailureMessage}</p>
                    )}
                    {tx.refundedAmountMinor && tx.refundedAmountMinor > 0 && (
                      <p className="text-xs text-purple-600 mt-1">
                        Refunded: {formatCurrencyMinor(tx.refundedAmountMinor, tx.currency)} on {new Date(tx.refundedAt!).toLocaleDateString('en-GB')}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Requested by {tx.requestedBy}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit trail */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Audit Trail</h2>
            {auth.events.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No events recorded.</p>
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-100" />
                <div className="space-y-4">
                  {auth.events.map(ev => (
                    <div key={ev.id} className="relative">
                      <div className={`absolute -left-5 mt-1 w-2.5 h-2.5 rounded-full border-2 border-white ${EVENT_DOTS[ev.eventType] ?? 'bg-gray-400'}`} />
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-semibold text-gray-800">{ev.eventType.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">{new Date(ev.createdAt).toLocaleString('en-GB')}</p>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        {ev.staffEmail && <span>{ev.staffEmail}</span>}
                        {ev.amountMinor != null && ev.currency && (
                          <span className="font-mono">{formatCurrencyMinor(ev.amountMinor, ev.currency)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Card on file */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Card on File</h2>
            {auth.cardLast4 ? (
              <div className="bg-gradient-to-br from-[#0A1628] to-[#1a2a48] rounded-lg p-4 text-white">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">{auth.cardBrand ?? 'Card'}</p>
                <p className="text-lg font-mono tracking-widest">···· ···· ···· {auth.cardLast4}</p>
                <p className="text-xs text-gray-400 mt-2">Exp {auth.cardExpMonth?.toString().padStart(2, '0')}/{auth.cardExpYear}</p>
                <p className="text-sm font-semibold mt-2">{auth.cardholderName}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No card saved yet.</p>
            )}
            {auth.signedAt && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                Signed {new Date(auth.signedAt).toLocaleString('en-GB')}
                {auth.signatureName && ` by "${auth.signatureName}"`}
              </p>
            )}
          </div>

          {/* Cardholder */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Cardholder</h2>
            <dl>
              <Row label="Name"         value={auth.cardholderName} />
              <Row label="Email"        value={auth.cardholderEmail} />
              {auth.cardholderPhone  && <Row label="Phone"    value={auth.cardholderPhone} />}
              {auth.cardholderCountry && <Row label="Country"  value={auth.cardholderCountry} />}
              <Row label="Relationship" value={auth.cardholderRelationship} />
              {!auth.isPersonalCard && <Row label="Company" value={auth.companyName ?? '—'} />}
            </dl>
          </div>

          {/* Traveller */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Traveller &amp; Booking</h2>
            <dl>
              <Row label="Traveller"  value={auth.travellerName} />
              {auth.bookingReference && <Row label="Booking Ref" value={<span className="font-mono">{auth.bookingReference}</span>} />}
              {auth.travelDates       && <Row label="Travel Dates" value={auth.travelDates} />}
              {auth.supplier          && <Row label="Supplier"     value={auth.supplier} />}
              <Row label="Service"    value={auth.serviceType} />
            </dl>
          </div>

          {/* Lifecycle */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Lifecycle</h2>
            <dl>
              <Row label="Created"    value={new Date(auth.createdAt).toLocaleString('en-GB')} />
              <Row label="Created by" value={auth.createdBy} />
              {auth.sentAt    && <Row label="Sent"    value={new Date(auth.sentAt).toLocaleString('en-GB')} />}
              {auth.openedAt  && <Row label="Opened"  value={new Date(auth.openedAt).toLocaleString('en-GB')} />}
              {auth.signedAt  && <Row label="Signed"  value={new Date(auth.signedAt).toLocaleString('en-GB')} />}
              {auth.revokedAt && <Row label="Revoked" value={new Date(auth.revokedAt).toLocaleString('en-GB')} />}
              {auth.revokedBy && <Row label="Revoked by" value={auth.revokedBy} />}
              {auth.revocationReason && <Row label="Reason" value={auth.revocationReason} />}
            </dl>
          </div>

          {/* Notes */}
          {auth.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Notes</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{auth.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Charge Modal */}
      {showChargeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Charge Card</h3>
            <p className="text-sm text-gray-500 mb-5">
              Card: {auth.cardBrand} ···{auth.cardLast4} &nbsp;|&nbsp;
              Remaining: {formatCurrencyMinor(Math.max(0, remaining), auth.currency)}
            </p>

            {chargeError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{chargeError}</div>
            )}

            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Amount ({auth.currency.toUpperCase()}) *
            </label>
            <input
              type="number" min="0.01" step="0.01"
              value={chargeAmount}
              onChange={e => setChargeAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              placeholder="0.00"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={chargeDescription}
              onChange={e => setChargeDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              placeholder={auth.description}
            />

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-xs text-amber-800">
              This will charge the card immediately. If the bank requires 3DS, an authentication link will be sent to the cardholder.
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCharge} disabled={chargeLoading}
                className="flex-1 bg-[#C9A84C] text-[#0A1628] font-bold text-sm py-2.5 rounded-lg hover:bg-[#b8973d] disabled:opacity-50"
              >
                {chargeLoading ? 'Processing…' : 'Charge Card'}
              </button>
              <button onClick={() => { setShowChargeModal(false); setChargeError(null) }}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold text-sm py-2.5 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Revoke Authorisation</h3>
            <p className="text-sm text-gray-500 mb-5">
              The cardholder will be notified. No further charges will be possible.
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason (optional)</label>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-5 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="E.g. Booking cancelled, new arrangement made, etc."
            />
            <div className="flex gap-3">
              <button
                onClick={handleRevoke} disabled={revokeLoading}
                className="flex-1 bg-red-600 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {revokeLoading ? 'Revoking…' : 'Revoke Authorisation'}
              </button>
              <button onClick={() => setShowRevokeModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold text-sm py-2.5 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
