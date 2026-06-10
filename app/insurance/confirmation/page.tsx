'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle,
  Download,
  Phone,
  Mail,
  ArrowRight,
  Shield,
  Calendar,
  MapPin,
  Copy,
  Check,
} from 'lucide-react'

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────

function ConfirmationContent() {
  const params       = useSearchParams()
  const orderRef     = params.get('order_ref') ?? params.get('ref') ?? ''
  const policyNumber = params.get('policy')    ?? ''
  const docUrl       = params.get('doc')       ?? ''
  const destination  = params.get('dest')      ?? ''
  const dateFrom     = params.get('from')      ?? ''
  const dateTo       = params.get('to')        ?? ''
  const plan         = params.get('plan')      ?? 'Walz Travel Shield'
  const emergency    = params.get('emergency') ?? '+1 800 TRAVEL'

  const ref = policyNumber || orderRef

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  function copyRef() {
    navigator.clipboard.writeText(ref).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <main className="min-h-screen bg-[#F7F4EF] flex flex-col">

      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/walz-logo.svg" alt="Walz Travels" className="h-8 w-auto" />
          </Link>
          <span className="text-[#C9A84C] text-sm font-semibold tracking-wide uppercase">
            Policy Confirmed
          </span>
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-[#0B1F3A] pb-16 pt-12 text-center px-6">
        <div className="max-w-3xl mx-auto">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6 ring-4 ring-green-500/30">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
            You&rsquo;re Protected
          </h1>
          <p className="text-white/60 text-base sm:text-lg max-w-xl mx-auto">
            Your travel insurance is active. Your policy document has been sent to your email.
          </p>
        </div>
      </section>

      {/* ── Main card ────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 -mt-6 pb-16 flex flex-col gap-6">

        {/* Policy reference */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="bg-[#C9A84C]/10 border-b border-[#C9A84C]/20 px-6 py-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#C9A84C]" />
            <span className="font-semibold text-[#0B1F3A] text-sm uppercase tracking-wide">
              Policy Reference
            </span>
          </div>
          <div className="px-6 py-6">
            {ref ? (
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-2xl sm:text-3xl text-[#0B1F3A] tracking-wider flex-1 break-all">
                  {ref}
                </span>
                <button
                  onClick={copyRef}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F7F4EF] hover:bg-[#C9A84C]/10 text-[#0B1F3A] text-sm font-medium transition-colors shrink-0"
                  title="Copy reference"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-[#0B1F3A]/60 text-sm">
                Reference not available — check your confirmation email.
              </p>
            )}
            <p className="text-sm text-[#0B1F3A]/50 mt-2">
              Quote this number when making a claim or contacting emergency assistance.
            </p>
          </div>
        </div>

        {/* Trip summary */}
        {(destination || dateFrom) && (
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="bg-[#0B1F3A]/5 border-b border-[#0B1F3A]/10 px-6 py-4">
              <span className="font-semibold text-[#0B1F3A] text-sm uppercase tracking-wide">
                Trip Summary
              </span>
            </div>
            <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {plan && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#0B1F3A]/50 uppercase tracking-wide mb-0.5">Plan</p>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{plan}</p>
                  </div>
                </div>
              )}
              {destination && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#0B1F3A]/50 uppercase tracking-wide mb-0.5">Destination</p>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{destination}</p>
                  </div>
                </div>
              )}
              {(dateFrom || dateTo) && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#0B1F3A]/50 uppercase tracking-wide mb-0.5">Travel Dates</p>
                    <p className="font-semibold text-[#0B1F3A] text-sm">
                      {dateFrom}{dateTo ? ` → ${dateTo}` : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* What to do next */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="bg-[#0B1F3A]/5 border-b border-[#0B1F3A]/10 px-6 py-4">
            <span className="font-semibold text-[#0B1F3A] text-sm uppercase tracking-wide">
              What to Do Next
            </span>
          </div>
          <div className="px-6 py-6 flex flex-col gap-5">

            {/* Step 1 — email */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm shrink-0 mt-0.5">
                1
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-[#C9A84C]" />
                  <p className="font-semibold text-[#0B1F3A]">Check your email</p>
                </div>
                <p className="text-sm text-[#0B1F3A]/60">
                  Your full policy document has been sent to your registered email address. Save it or
                  download it below.
                </p>
              </div>
            </div>

            {/* Step 2 — portal */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm shrink-0 mt-0.5">
                2
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-[#C9A84C]" />
                  <p className="font-semibold text-[#0B1F3A]">Save to your portal</p>
                </div>
                <p className="text-sm text-[#0B1F3A]/60 mb-2">
                  Your policy is saved in your Walz Travels portal — accessible any time.
                </p>
                <Link
                  href="/portal"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C9A84C] hover:text-[#0B1F3A] transition-colors"
                >
                  View My Portal <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Step 3 — download */}
            {docUrl && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Download className="w-4 h-4 text-[#C9A84C]" />
                    <p className="font-semibold text-[#0B1F3A]">Download your policy document</p>
                  </div>
                  <p className="text-sm text-[#0B1F3A]/60 mb-2">
                    Keep a copy on your phone for easy access while travelling.
                  </p>
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#C9A84C] hover:text-[#0B1F3A] transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Policy Document
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Emergency assistance */}
        <div className="bg-[#0B1F3A] rounded-2xl shadow-md px-6 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C] flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-[#0B1F3A]" />
            </div>
            <div>
              <p className="font-bold text-white text-base">24/7 Emergency Assistance</p>
              <p className="text-white/50 text-xs">Available wherever you are in the world</p>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-white/50 text-xs mb-1">Emergency telephone</p>
              <p className="text-[#C9A84C] font-mono font-bold text-lg tracking-wide">{emergency}</p>
            </div>
            <div className="text-white/40 text-xs sm:text-right">
              Quote your policy reference number<br />when calling
            </div>
          </div>
          <p className="text-white/30 text-xs mt-4">
            Powered by Battleface — available in 190+ countries
          </p>
        </div>

        {/* CTA strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/portal"
            className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-white border border-[#0B1F3A]/10 text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A] hover:text-white hover:border-[#0B1F3A] transition-all"
          >
            <Shield className="w-4 h-4" />
            View My Policies
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A] hover:text-[#C9A84C] transition-all"
          >
            Back to Home <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Fine print */}
        <p className="text-center text-xs text-[#0B1F3A]/40 pb-4">
          Travel insurance underwritten and administered by Battleface.
          Walz Travels acts as an introducer only.
          In the event of a claim, contact Battleface emergency assistance directly.
        </p>
      </div>
    </main>
  )
}

// ── Page export (wraps useSearchParams consumer in Suspense) ──────────────────

export default function InsuranceConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F7F4EF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
}
