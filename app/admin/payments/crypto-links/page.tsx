'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bitcoin, Copy, Check, ExternalLink, MessageCircle, Mail,
  Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
} from 'lucide-react'

interface GeneratedLink {
  invoiceUrl: string
  waShareUrl: string
  orderId:    string
}

interface AdminLink {
  id:          string
  invoiceUrl:  string
  amount:      string | number
  currency:    string
  description: string | null
  clientEmail: string | null
  bookingId:   string | null
  status:      string
  createdBy:   string
  createdAt:   string
}

const STATUS_CONFIG: Record<string, { label: string; colour: string; icon: React.ElementType }> = {
  pending: { label: 'Pending',  colour: 'text-amber-600 bg-amber-50 border-amber-200',  icon: Clock          },
  paid:    { label: 'Paid',     colour: 'text-green-600 bg-green-50 border-green-200',  icon: CheckCircle2   },
  expired: { label: 'Expired',  colour: 'text-gray-500 bg-gray-50 border-gray-200',     icon: XCircle        },
  failed:  { label: 'Failed',   colour: 'text-red-600 bg-red-50 border-red-200',        icon: XCircle        },
}

function StatusBadge({ status }: { status: string }) {
  const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.colour}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors">
      {copied ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
    </button>
  )
}

export default function CryptoLinksPage() {
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [bookingId,   setBookingId]   = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState('')
  const [result,      setResult]      = useState<GeneratedLink | null>(null)

  const [links,        setLinks]        = useState<AdminLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(true)

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true)
    try {
      const res = await fetch('/api/admin/payments/crypto-link')
      const data = await res.json()
      if (data.links) setLinks(data.links)
    } catch {
      // fail silently
    } finally {
      setLoadingLinks(false)
    }
  }, [])

  useEffect(() => { loadLinks() }, [loadLinks])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResult(null)

    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount in USD.'); return }

    setGenerating(true)
    try {
      const res = await fetch('/api/admin/payments/crypto-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          amount:      amt,
          currency:    'USD',
          description: description || undefined,
          clientEmail: clientEmail || undefined,
          bookingId:   bookingId   || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to generate link'); setGenerating(false); return }
      setResult(data)
      loadLinks()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const mailtoUrl = result
    ? `mailto:${clientEmail || ''}?subject=${encodeURIComponent(`Your Walz Travels Payment Link`)}&body=${encodeURIComponent(
        `Hi,\n\nHere is your Walz Travels payment link. You can pay with any cryptocurrency (Bitcoin, USDC, USDT and more):\n\n${result.invoiceUrl}\n\nAmount: $${amount} USD${description ? `\nRef: ${description}` : ''}\n\nPlease complete payment at your earliest convenience.\n\nKind regards,\nWalz Travels Team`
      )}`
    : ''

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
          <Bitcoin className="w-5 h-5 text-[#C9A84C]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Crypto Payment Links</h1>
          <p className="text-sm text-gray-500">Generate a NOWPayments link — customer chooses their own crypto (BTC, USDC, USDT, etc.)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleGenerate} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-2">Generate Link</h2>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Amount (USD $) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Crypto payment links are USD-denominated</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                placeholder="e.g. UK Visitor Visa for Emeka Okonkwo"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Client Email <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Booking Reference <span className="text-gray-400 font-normal">(optional — links to existing booking)</span>
              </label>
              <input
                type="text"
                value={bookingId}
                onChange={e => setBookingId(e.target.value)}
                placeholder="WLZ-XXXXXX"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl hover:bg-[#162d52] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Bitcoin className="w-4 h-4" /> Generate Payment Link</>}
            </button>
          </form>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-3">
          {result ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <h2 className="font-semibold text-gray-800">Payment Link Ready</h2>
              </div>

              {/* Invoice URL */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice URL</p>
                <p className="text-sm text-[#0B1F3A] font-mono break-all">{result.invoiceUrl}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <CopyButton text={result.invoiceUrl} />
                  <a href={result.invoiceUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </a>
                </div>
              </div>

              {/* Share actions */}
              <div className="grid grid-cols-2 gap-3">
                <a href={result.waShareUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white font-semibold text-sm transition-colors">
                  <MessageCircle className="w-4 h-4" />
                  Send via WhatsApp
                </a>
                <a href={mailtoUrl}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B1F3A] hover:bg-[#162d52] text-white font-semibold text-sm transition-colors">
                  <Mail className="w-4 h-4" />
                  Send via Email
                </a>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-800">
                  <strong>Amount:</strong> ${amount} USD &nbsp;·&nbsp;
                  <strong>Description:</strong> {description || '—'}&nbsp;·&nbsp;
                  <strong>Order ID:</strong> <span className="font-mono">{result.orderId}</span>
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Customer selects their preferred crypto (BTC, USDC, USDT, etc.) on NOWPayments' hosted page.
                </p>
              </div>

              <button
                onClick={() => { setResult(null); setAmount(''); setDescription(''); setClientEmail(''); setBookingId('') }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Generate another link →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 flex flex-col items-center justify-center text-center h-full min-h-[280px]">
              <Bitcoin className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Fill in the form to generate a crypto payment link</p>
              <p className="text-xs text-gray-300 mt-1">Customer chooses BTC, USDC, USDT, or any enabled currency</p>
            </div>
          )}
        </div>
      </div>

      {/* History table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Generated Links</h2>
          <button onClick={loadLinks} disabled={loadingLinks}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLinks ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loadingLinks ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : links.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No links generated yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Created By</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {links.map(link => (
                  <tr key={link.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="truncate font-medium text-gray-800">{link.description || '—'}</p>
                      {link.bookingId && (
                        <p className="text-[11px] text-gray-400 font-mono">{link.bookingId}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">
                      ${Number(link.amount).toFixed(2)} {link.currency}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={link.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                      {link.clientEmail || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[120px]">
                      {link.createdBy}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(link.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <a href={link.invoiceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#C9A84C] hover:underline text-xs">
                        <ExternalLink className="w-3 h-3" /> Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
