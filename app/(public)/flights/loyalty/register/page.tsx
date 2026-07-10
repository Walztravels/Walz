'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Metadata } from 'next'

const TIERS = [
  { name: 'Bronze',   colour: '#CD7F32', threshold: 0,     label: 'Start earning today'    },
  { name: 'Silver',   colour: '#9BA4B5', threshold: 5000,  label: '5,000 miles milestone'  },
  { name: 'Gold',     colour: '#C9A84C', threshold: 20000, label: '20,000 miles milestone' },
  { name: 'Platinum', colour: '#8B5CF6', threshold: 50000, label: '50,000 miles milestone' },
]

const BENEFITS = [
  { icon: '✈', title: '10 Jade Miles per £1',  desc: 'Earn on every booking, every time.'          },
  { icon: '🎁', title: 'Birthday bonus miles',  desc: 'Surprise miles on your special day.'         },
  { icon: '⬆', title: 'Exclusive upgrades',     desc: 'Bid for cabin upgrades with miles.'          },
  { icon: '🛋', title: 'Lounge access',          desc: 'Gold & Platinum members get lounge passes.'  },
  { icon: '🌍', title: 'Partner transfers',      desc: 'Transfer to 6 major airline programmes.'     },
  { icon: '💬', title: 'Priority support',       desc: 'Dedicated concierge for Gold & Platinum.'    },
]

export default function JadeMilesRegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<'benefits' | 'form' | 'success'>('benefits')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', agree: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberNumber, setMemberNumber] = useState('')

  function updateForm(key: string, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.agree) { setError('Please accept the terms to continue.'); return }
    setError(null)
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 1500))
    const num = `JM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    setMemberNumber(num)
    setSubmitting(false)
    setStep('success')
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-4 shadow-xl shadow-[#C9A84C]/30">
            <img src="/jade-avatar.jpg" alt="Jade" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-[#C9A84C] font-bold text-lg">Jade Miles</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#CD7F32]/20 text-[#CD7F32]">Bronze</span>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full mb-8">
          <p className="text-white/40 text-sm mb-1">Welcome,</p>
          <h1 className="font-display text-3xl font-bold text-white mb-2">{form.firstName} {form.lastName}</h1>
          <p className="text-[#C9A84C] text-sm font-semibold mb-6">{form.email}</p>

          <div className="bg-white/5 rounded-xl p-4 mb-6">
            <p className="text-white/40 text-xs mb-1 uppercase tracking-wider">Your Member Number</p>
            <p className="font-display text-2xl font-bold text-[#C9A84C] tracking-widest">{memberNumber}</p>
          </div>

          <p className="text-white/50 text-sm leading-relaxed mb-6">
            You&apos;re now a Jade Miles Bronze member. Start earning 10 miles per £1 on your next booking — they&apos;re already waiting for you.
          </p>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[#C9A84C] text-xl font-bold">0</p>
              <p className="text-white/40 text-[10px] mt-0.5">Jade Miles</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[#CD7F32] text-xl font-bold">Bronze</p>
              <p className="text-white/40 text-[10px] mt-0.5">Status</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white text-xl font-bold">10×</p>
              <p className="text-white/40 text-[10px] mt-0.5">Earn rate</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => router.push('/flights')}
            className="px-6 py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all">
            Search flights →
          </button>
          <button
            onClick={() => router.push('/flights/loyalty')}
            className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-all">
            View my membership
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/jade-avatar.jpg" alt="Jade" className="w-12 h-12 rounded-xl object-cover shadow-lg shadow-[#C9A84C]/30" />
            <div className="text-left">
              <p className="text-[#C9A84C] font-bold text-xl leading-none">Jade Miles</p>
              <p className="text-white/30 text-xs tracking-widest uppercase mt-0.5">Loyalty Programme</p>
            </div>
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Join free.<br />
            <span style={{ background: 'linear-gradient(135deg,#C9A84C,#8B6914)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Start earning instantly.
            </span>
          </h1>
          <p className="text-white/50 text-base max-w-lg mx-auto">
            Earn 10 Jade Miles per £1 on every Walz Travels booking. Redeem for flights, upgrades, and extras.
          </p>
        </div>
      </div>

      {/* Tier preview strip */}
      <div className="bg-white border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between gap-4 overflow-x-auto">
          {TIERS.map((t, i) => (
            <div key={t.name} className="flex items-center gap-2 flex-shrink-0">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colour }} />
              <span className="text-sm font-semibold" style={{ color: t.colour }}>{t.name}</span>
              {i < TIERS.length - 1 && <span className="text-[#0B1F3A]/15 text-xs ml-2">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {step === 'benefits' && (
          <>
            {/* Benefits grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
              {BENEFITS.map(b => (
                <div key={b.title} className="bg-white rounded-2xl border border-black/5 p-4">
                  <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center text-xl mb-3">
                    {b.icon}
                  </div>
                  <p className="font-bold text-[#0B1F3A] text-sm mb-1">{b.title}</p>
                  <p className="text-xs text-[#0B1F3A]/50 leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>

            {/* Earning calculator */}
            <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-8 text-center">
              <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-2">Quick Estimate</p>
              <p className="text-white/70 text-sm mb-1">A £500 flight earns you</p>
              <p className="font-display text-5xl font-bold text-[#C9A84C] mb-1">5,000</p>
              <p className="text-white/40 text-sm">Jade Miles = £50 off your next booking</p>
            </div>

            <button
              onClick={() => setStep('form')}
              className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all shadow-lg shadow-[#C9A84C]/25">
              Join Jade Miles — It&apos;s free →
            </button>
            <p className="text-center text-[#0B1F3A]/30 text-xs mt-3">No credit card required · Cancel anytime</p>
          </>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-2xl border border-black/5 p-6">
              <h2 className="font-display font-bold text-[#0B1F3A] text-xl mb-5">Create your account</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5 block">First name *</label>
                  <input required type="text" value={form.firstName} onChange={e => updateForm('firstName', e.target.value)}
                    placeholder="First name"
                    className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5 block">Last name *</label>
                  <input required type="text" value={form.lastName} onChange={e => updateForm('lastName', e.target.value)}
                    placeholder="Last name"
                    className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]" />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5 block">Email address *</label>
                <input required type="email" value={form.email} onChange={e => updateForm('email', e.target.value)}
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]" />
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5 block">Phone number</label>
                <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)}
                  placeholder="+44 7700 900000"
                  className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]" />
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5 block">Date of birth</label>
                <input type="date" value={form.dob} onChange={e => updateForm('dob', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 text-sm text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]" />
                <p className="text-[10px] text-[#0B1F3A]/30 mt-1">Used to send your birthday bonus miles.</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${form.agree ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-[#0B1F3A]/20'}`}
                  onClick={() => updateForm('agree', !form.agree)}>
                  {form.agree && (
                    <svg className="w-3 h-3 text-[#0B1F3A]" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-[#0B1F3A]/60 leading-relaxed" onClick={() => updateForm('agree', !form.agree)}>
                  I agree to the Jade Miles{' '}
                  <a href="/terms" className="text-[#C9A84C] hover:underline">Terms & Conditions</a>
                  {' '}and{' '}
                  <a href="/privacy" className="text-[#C9A84C] hover:underline">Privacy Policy</a>.
                  I consent to receiving miles updates and travel offers by email.
                </span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep('benefits')}
                className="px-5 py-3.5 rounded-xl border border-[#0B1F3A]/10 text-sm font-semibold text-[#0B1F3A]/60 hover:border-[#0B1F3A]/30 transition-all">
                ← Back
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" />
                    Creating your account…
                  </span>
                ) : 'Create my Jade Miles account →'}
              </button>
            </div>

            <p className="text-center text-[#0B1F3A]/30 text-xs">
              Already a member?{' '}
              <a href="/login" className="text-[#C9A84C] hover:underline">Sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
