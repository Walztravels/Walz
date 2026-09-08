'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'

/**
 * Candidate-facing written AI screening interview. Token-gated; the page
 * shows only this candidate's progress and the current question. Text
 * answers only — nothing is recorded beyond what the candidate types.
 */

interface State { status: string; total: number; index: number; question: string | null }

export default function AiInterviewPage() {
  const params = useParams<{ token: string }>()
  const [state,     setState]     = useState<State | null>(null)
  const [firstName, setFirstName] = useState('')
  const [jobTitle,  setJobTitle]  = useState('')
  const [notice,    setNotice]    = useState('')
  const [answerMax, setAnswerMax] = useState(5000)
  const [answer,    setAnswer]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  const [fatal,     setFatal]     = useState('')
  const [started,   setStarted]   = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/careers/interview/${params.token}`)
      const data = await res.json()
      if (!res.ok) { setFatal(data.error ?? 'This interview link is not valid'); return }
      setState(data.state)
      setFirstName(data.firstName ?? '')
      setJobTitle(data.jobTitle ?? '')
      setNotice(data.notice ?? '')
      setAnswerMax(data.answerMax ?? 5000)
      if (data.state?.status === 'in_progress') setStarted(true)
    } catch { setFatal('Network error — please refresh and try again') }
    finally { setLoading(false) }
  }, [params.token])
  useEffect(() => { void load() }, [load])

  async function submit() {
    if (!answer.trim() || busy) return
    setBusy(true); setError('')
    try {
      const res  = await fetch(`/api/careers/interview/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not save your answer'); return }
      setAnswer('')
      setState(data.state)
    } catch { setError('Network error — your answer was not saved. Please try again.') }
    finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[#F5F0E8] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-center text-sm font-bold text-[#0B1F3A] mb-6">WALZ TRAVELS · Careers</p>
        {children}
        <p className="text-center text-[11px] text-gray-400 mt-6">
          Need help or prefer a human-led interview?{' '}
          <a href="mailto:careers@walztravels.com" className="text-[#C9A84C] hover:underline">careers@walztravels.com</a>
        </p>
      </div>
    </main>
  )

  if (loading) return shell(<div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" /></div>)

  if (fatal || !state) return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">Link not valid</h1>
      <p className="text-sm text-gray-500">{fatal || 'This interview link is not valid.'}</p>
      <p className="text-sm text-gray-500 mt-2">If you believe this is a mistake, reply to your invitation email and we will send you a new link.</p>
    </div>
  )

  if (state.status === 'cancelled') return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">Interview no longer available</h1>
      <p className="text-sm text-gray-500">This interview was cancelled by our recruitment team. Please check your email for next steps.</p>
    </div>
  )

  if (state.status === 'completed' || state.question === null) return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
      <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-[#0B1F3A] mb-2">Thank you{firstName ? `, ${firstName}` : ''}!</h1>
      <p className="text-sm text-gray-500">
        Your interview{jobTitle ? ` for the ${jobTitle} role` : ''} is complete. Our recruitment team will
        personally review your answers and contact you about the next steps.
      </p>
      <Link href="/careers" className="inline-block mt-4 text-sm font-semibold text-[#C9A84C] hover:underline">Back to careers</Link>
    </div>
  )

  if (!started) return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8">
      <h1 className="text-xl font-bold text-[#0B1F3A]">
        {firstName ? `Welcome, ${firstName}` : 'Welcome'} — your screening interview
      </h1>
      {jobTitle && <p className="text-sm text-gray-500 mt-1">Role: {jobTitle}</p>}
      <div className="flex items-start gap-2.5 bg-[#F5F0E8] rounded-xl p-4 mt-4">
        <ShieldCheck className="w-5 h-5 text-[#C9A84C] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 leading-relaxed">{notice}</p>
      </div>
      <p className="text-sm text-gray-500 mt-4">{state.total} written questions · answer at your own pace · your progress is saved after each answer.</p>
      <button onClick={() => setStarted(true)}
        className="mt-5 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-xl text-sm">
        Start interview
      </button>
    </div>
  )

  return shell(
    <div className="bg-white rounded-2xl shadow-sm p-8">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400">Question {state.index + 1} of {state.total}</p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: state.total }, (_, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${i < state.index ? 'bg-[#C9A84C]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>
      <h1 className="text-lg font-bold text-[#0B1F3A] mt-2">{state.question}</h1>
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value.slice(0, answerMax))}
        rows={7}
        placeholder="Type your answer here…"
        aria-label="Your answer"
        className="mt-4 w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-[#C9A84C]"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-gray-300">{answer.length}/{answerMax}</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <button onClick={() => void submit()} disabled={busy || !answer.trim()}
        className="mt-3 bg-[#0B1F3A] text-white font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-40">
        {busy ? 'Saving…' : state.index + 1 === state.total ? 'Submit final answer' : 'Save & next question'}
      </button>
      <p className="text-[10px] text-gray-400 mt-3">
        Answers are saved one at a time — you can close this page and return with the same link before it expires.
      </p>
    </div>
  )
}
