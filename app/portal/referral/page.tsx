'use client'

import { useState, useEffect } from 'react'
import { Users, Copy, CheckCircle, Loader2, MessageCircle, Gift } from 'lucide-react'

interface ReferralCode {
  id: string
  code: string
  uses: number
  credits: number
  createdAt: string
}

export default function PortalReferralPage() {
  const [referral, setReferral] = useState<ReferralCode | null>(null)
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)

  useEffect(() => {
    fetch('/api/portal/referral')
      .then(r => r.json())
      .then(d => { setReferral(d.referral); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const copyCode = () => {
    if (!referral) return
    navigator.clipboard.writeText(referral.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const shareLink = referral ? `https://walztravels.us/?ref=${referral.code}` : ''

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Refer &amp; Earn</h1>
        <p className="text-sm text-gray-500 mt-0.5">Share Walz Travels with friends and earn credits</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-2xl space-y-6">
        {/* Hero */}
        <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#C9A84C]/20 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-7 h-7 text-[#C9A84C]" />
          </div>
          <h2 className="text-xl font-bold mb-2">Earn when your friends travel</h2>
          <p className="text-white/60 text-sm max-w-sm mx-auto">
            Share your unique referral code. When a friend books with Walz Travels using your code, you both get rewarded.
          </p>
        </div>

        {/* Referral code */}
        {referral && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-sm text-gray-500 mb-2">Your unique referral code</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-lg font-bold text-[#0B1F3A] tracking-widest">
                  {referral.code}
                </div>
                <button
                  onClick={copyCode}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${copied ? 'bg-green-600 text-white' : 'bg-[#0B1F3A] text-white hover:bg-[#0d2040]'}`}
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-sm text-gray-500 mb-2">Or share your referral link</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 truncate">
                  {shareLink}
                </div>
                <button onClick={copyLink} className="px-4 py-3 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-semibold text-sm hover:bg-[#d4b55c] transition-colors">
                  Copy
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-3xl font-bold text-[#0B1F3A]">{referral.uses}</p>
                <p className="text-sm text-gray-500 mt-1">Successful referrals</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-3xl font-bold text-[#C9A84C]">£{referral.credits.toLocaleString()}</p>
                <p className="text-sm text-gray-500 mt-1">Credits earned</p>
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-[#0B1F3A] mb-4">How it works</h3>
          <div className="space-y-4">
            {[
              { step: '1', title: 'Share your code', desc: 'Give your unique code or link to a friend planning to travel.' },
              { step: '2', title: 'Friend books with Walz', desc: 'When they book a visa, flight, or tour using your code.' },
              { step: '3', title: 'Both get rewarded', desc: 'You earn account credits. Your friend gets a discount on their first booking.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-xs flex-shrink-0 mt-0.5">{step}</div>
                <div>
                  <p className="font-medium text-[#0B1F3A] text-sm">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Share on WhatsApp */}
        {referral && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Use my Walz Travels referral code ${referral.code} for a discount on your next visa, flight, or tour! Book at ${shareLink}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Share on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
