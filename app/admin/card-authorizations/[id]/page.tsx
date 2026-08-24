'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Copy, Send, CheckCircle, XCircle, CreditCard,
  Clock, AlertCircle, Edit3, Check, RefreshCw,
} from 'lucide-react'

interface CardAuth {
  id:                    string
  token:                 string
  status:                string
  amount:                number
  currency:              string
  description:           string
  clientName:            string
  clientEmail:           string
  clientPhone:           string | null
  bookingRef:            string | null
  bookingId:             string | null
  applicationId:         string | null
  leadId:                string | null
  stripePaymentIntentId: string | null
  authorizedAt:          string | null
  capturedAt:            string | null
  releasedAt:            string | null
  cancelledAt:           string | null
  expiresAt:             string | null
  createdAt:             string
  createdBy:             string
  capturedBy:            string | null
  releasedBy:            string | null
  cancelledBy:           string | null
  capturedAmount:        number | null
  notes:                 string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  authorized: 'bg-blue-900/40 text-blue-300 border-blue-700',
  captured:   'bg-green-900/40 text-green-300 border-green-700',
  released:   'bg-gray-800 text-gray-400 border-gray-700',
  expired:    'bg-orange-900/40 text-orange-300 border-orange-700',
  cancelled:  'bg-red-900/40 text-red-300 border-red-700',
}

function fmt(amount: number | null, currency: string) {
  if (amount === null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
}

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CardAuthDetailPage({ params }: { params: { id: string } }) {
  const router  = useRouter()
  const [auth,    setAuth]    = useState<CardAuth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Action state
  const [captureAmount, setCaptureAmount] = useState('')
  const [capturing,  setCapturing]  = useState(false)
  const [releasing,  setReleasing]  = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [resending,  setResending]  = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk,    setActionOk]   = useState<string | null>(null)

  // Notes
  const [notes,       setNotes]       = useState('')
  const [editNotes,   setEditNotes]   = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Copied state
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/card-authorizations/${params.id}`)
      const d = await r.json() as { auth?: CardAuth; error?: string }
      if (!r.ok || d.error) { setError(d.error ?? 'Not found'); return }
      setAuth(d.auth!)
      setNotes(d.auth!.notes ?? '')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActionError(null)
    setActionOk(null)
    const r = await fetch(`/api/admin/card-authorizations/${params.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, ...extra }),
    })
    const d = await r.json() as { auth?: CardAuth; ok?: boolean; message?: string; error?: string }
    if (!r.ok) { return { ok: false, error: d.error } }
    if (d.auth) setAuth(d.auth)
    return { ok: true, message: d.message }
  }

  async function handleCapture() {
    setCapturing(true)
    const amount = captureAmount ? parseFloat(captureAmount) : undefined
    const result = await doAction('capture', amount ? { amountToCapture: amount } : {})
    if (!result.ok) setActionError(result.error ?? 'Capture failed')
    else setActionOk('Payment captured successfully')
    setCapturing(false)
  }

  async function handleRelease() {
    if (!confirm('Release the card hold? The client will not be charged.')) return
    setReleasing(true)
    const result = await doAction('release')
    if (!result.ok) setActionError(result.error ?? 'Release failed')
    else setActionOk('Hold released')
    setReleasing(false)
  }

  async function handleCancel() {
    if (!confirm('Cancel this authorization request?')) return
    setCancelling(true)
    const result = await doAction('cancel')
    if (!result.ok) setActionError(result.error ?? 'Cancel failed')
    else { setActionOk('Cancelled'); router.refresh() }
    setCancelling(false)
  }

  async function handleResend() {
    setResending(true)
    const result = await doAction('resend')
    if (!result.ok) setActionError(result.error ?? 'Resend failed')
    else setActionOk('Authorization link resent to client')
    setResending(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    const result = await doAction('update_notes', { notes })
    if (!result.ok) setActionError(result.error ?? 'Could not save notes')
    else setEditNotes(false)
    setSavingNotes(false)
  }

  function copyLink() {
    if (!auth) return
    const base = window.location.origin
    navigator.clipboard.writeText(`${base}/authorize/${auth.token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !auth) return (
    <div className="p-6 text-center text-red-400">{error ?? 'Not found'}</div>
  )

  const authUrl    = `/authorize/${auth.token}`
  const fullUrl    = typeof window !== 'undefined' ? `${window.location.origin}${authUrl}` : authUrl
  const canCapture = auth.status === 'authorized'
  const canRelease = auth.status === 'authorized'
  const canCancel  = ['pending', 'authorized'].includes(auth.status)
  const canResend  = auth.status === 'pending'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/card-authorizations" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Card Authorisation</h1>
            <p className="text-gray-500 text-xs mt-0.5 font-mono">{auth.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${STATUS_COLORS[auth.status] ?? STATUS_COLORS.cancelled}`}>
            {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}
      {actionOk && (
        <div className="bg-green-950 border border-green-800 text-green-300 text-sm rounded-lg px-4 py-3">
          {actionOk}
        </div>
      )}

      {/* Main detail card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Details</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {[
            ['Client',       auth.clientName],
            ['Email',        auth.clientEmail],
            ['Phone',        auth.clientPhone ?? '—'],
            ['Description',  auth.description],
            ['Amount',       fmt(auth.amount, auth.currency)],
            ['Currency',     auth.currency.toUpperCase()],
            ...(auth.capturedAmount !== null ? [['Captured', fmt(auth.capturedAmount, auth.currency)]] : []),
            ['Booking Ref',  auth.bookingRef  ?? '—'],
            ['Booking ID',   auth.bookingId   ?? '—'],
            ['Application',  auth.applicationId ?? '—'],
            ['Stripe PI',    auth.stripePaymentIntentId ?? '—'],
            ['Created',      fmtDt(auth.createdAt)],
            ['Created by',   auth.createdBy],
            ['Authorized',   fmtDt(auth.authorizedAt)],
            ['Expires',      fmtDt(auth.expiresAt)],
            ['Captured at',  fmtDt(auth.capturedAt)],
            ['Captured by',  auth.capturedBy  ?? '—'],
            ['Released at',  fmtDt(auth.releasedAt)],
            ['Released by',  auth.releasedBy  ?? '—'],
            ['Cancelled at', fmtDt(auth.cancelledAt)],
            ['Cancelled by', auth.cancelledBy ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
              <span className="text-gray-200 break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Authorization link */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Client Link</h2>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={fullUrl}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none"
          />
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gray-800 border border-gray-700 hover:border-[#C9A84C] text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <Link
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            Preview
          </Link>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Internal Notes</h2>
          {!editNotes && (
            <button onClick={() => setEditNotes(true)} className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        {editNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C] resize-y"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditNotes(false); setNotes(auth.notes ?? '') }} className="text-xs text-gray-500 hover:text-white transition-colors">Cancel</button>
              <button onClick={saveNotes} disabled={savingNotes} className="text-xs bg-[#C9A84C] text-[#0A1628] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{auth.notes || 'No notes'}</p>
        )}
      </div>

      {/* Actions */}
      {(canCapture || canRelease || canCancel || canResend) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Actions</h2>

          {canCapture && (
            <div className="space-y-2">
              <label className="text-xs text-gray-400 block">Capture amount (leave empty for full {fmt(auth.amount, auth.currency)})</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={auth.amount}
                  value={captureAmount}
                  onChange={e => setCaptureAmount(e.target.value)}
                  placeholder={String(auth.amount)}
                  className="w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                />
                <button
                  onClick={handleCapture}
                  disabled={capturing}
                  className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {capturing ? 'Capturing…' : 'Capture Payment'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canRelease && (
              <button
                onClick={handleRelease}
                disabled={releasing}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {releasing ? 'Releasing…' : 'Release Hold'}
              </button>
            )}

            {canResend && (
              <button
                onClick={handleResend}
                disabled={resending}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
                {resending ? 'Sending…' : 'Resend Link'}
              </button>
            )}

            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 bg-red-900/50 hover:bg-red-900 border border-red-800 disabled:opacity-50 text-red-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {cancelling ? 'Cancelling…' : 'Cancel Request'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
