'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle2, Briefcase } from 'lucide-react'

/**
 * Candidate-facing offer page: view the offer, accept or decline once.
 * Token-gated; shows only this offer and the candidate's first name.
 */

interface Offer {
  status: string; jobTitle: string; compensationType: string
  compensationAmount: string | number | null; currency: string
  compensationNotes: string | null; startDate: string | null
  terms: string | null; respondedAt: string | null
}

export default function OfferPage() {
  const params = useParams<{ token: string }>()
  const [offer,     setOffer]     = useState<Offer | null>(null)
  const [firstName, setFirstName] = useState('')
  const [reference, setReference] = useState('')
  const [note,      setNote]      = useState('')
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  const [fatal,     setFatal]     = useState('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/careers/offer/${params.token}`)
      const data = await res.json()
      if (!res.ok) { setFatal(data.error ?? 'This offer link is not valid'); return }
      setOffer(data.offer)
      setFirstName(data.firstName ?? '')
      setReference(data.reference ?? '')
    } catch { setFatal('Network error — please refresh and try again') }
    finally { setLoading(false) }
  }, [params.token])
  useEffect(() => { void load() }, [load])

  async function respond(decision: 'accepted' | 'declined') {
    const verb = decision === 'accepted' ? 'accept' : 'decline'
    if (!confirm(`Are you sure you want to ${verb} this offer? This can only be done once.`)) return
    setBusy(true); setError('')
    try {
      const res  = await fetch(`/api/careers/offer/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not record your response'); return }
      await load()
    } catch { setError('Network error — please try again') }
    finally { setBusy(false) }
  }

  const money = () => {
    if (!offer?.compensationAmount) return null
    const n = Number(offer.compensationAmount)
    return Number.isFinite(n) ? `${offer.currency} ${n.toLocaleString('en-GB')}` : null
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[#F5F0E8] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-center text-sm font-bold text-[#0B1F3A] mb-6">WALZ TRAVELS · Careers</p>
        {children}
        <p className="text-center text-[11px] text-gray-400 mt-6">
          Questions about your offer?{' '}
          <a href="mailto:careers@walztravels.com" className="text-[#C9A84C] hover:underline">careers@walztravels.com</a>
        </p>
      </div>
    </main>
  )

  if (loading) return shell(<div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" /></div>)

  if (fatal || !offer) return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">Link not valid</h1>
      <p className="text-sm text-gray-500">{fatal || 'This offer link is not valid.'}</p>
    </div>
  )

  if (offer.status === 'withdrawn') return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">Offer no longer available</h1>
      <p className="text-sm text-gray-500">This offer has been withdrawn. Please check your email or contact us for details.</p>
    </div>
  )

  if (offer.status === 'accepted' || offer.status === 'declined') return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">
        {offer.status === 'accepted' ? `Congratulations${firstName ? `, ${firstName}` : ''}!` : 'Response recorded'}
      </h1>
      <p className="text-sm text-gray-500">
        {offer.status === 'accepted'
          ? `You have accepted the ${offer.jobTitle} offer. Our team will contact you shortly with onboarding details.`
          : `You have declined the ${offer.jobTitle} offer. Thank you for letting us know — we wish you all the best.`}
      </p>
    </div>
  )

  return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="w-5 h-5 text-[#C9A84C]" />
        <h1 className="text-xl font-bold text-[#0B1F3A]">Offer — {offer.jobTitle}</h1>
      </div>
      <p className="text-sm text-gray-500">
        Dear {firstName || 'candidate'}, we are delighted to offer you this position.
        {reference && <> Reference: <span className="font-mono">{reference}</span></>}
      </p>

      <div className="bg-[#F5F0E8] rounded-xl p-4 mt-4 space-y-1.5 text-sm">
        <p className="text-gray-600"><span className="font-semibold text-[#0B1F3A]">Compensation:</span> {offer.compensationType}{money() ? ` — ${money()}` : ''}</p>
        {offer.compensationNotes && <p className="text-gray-600 whitespace-pre-wrap">{offer.compensationNotes}</p>}
        {offer.startDate && (
          <p className="text-gray-600"><span className="font-semibold text-[#0B1F3A]">Proposed start:</span>{' '}
            {new Date(offer.startDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</p>
        )}
      </div>
      {offer.terms && (
        <div className="mt-4">
          <h2 className="text-sm font-bold text-[#0B1F3A] mb-1">Terms</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{offer.terms}</p>
        </div>
      )}

      <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 2000))} rows={3}
        placeholder="Optional message to the team (questions, conditions, preferred start date…)"
        aria-label="Optional message with your response"
        className="mt-5 w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-[#C9A84C]" />

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex gap-3 mt-4">
        <button onClick={() => void respond('accepted')} disabled={busy}
          className="flex-1 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-40">
          {busy ? 'Saving…' : 'Accept offer'}
        </button>
        <button onClick={() => void respond('declined')} disabled={busy}
          className="flex-1 border border-gray-200 text-gray-500 font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-40 hover:border-gray-300">
          Decline
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-3">You can respond once. If anything is unclear, email us first — replying does not affect your offer.</p>
    </div>
  )
}
