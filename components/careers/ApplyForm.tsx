'use client'

// Public application form — no account required. Server validation is
// authoritative; this mirrors it for a good candidate experience.

import { useState } from 'react'
import { Loader2, CheckCircle, Upload } from 'lucide-react'

interface Question { id: string; question: string; kind: string; required: boolean; options: string[] }

const inp   = 'w-full bg-white border border-[#E2D9CC] rounded-xl px-3.5 py-2.5 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C]'
const label = 'text-xs font-semibold text-[#0B1F3A]/60 block mb-1.5'

export function ApplyForm({ jobSlug, jobTitle, questions, aiDisclosure }: {
  jobSlug: string; jobTitle: string; questions: Question[]; aiDisclosure: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState<{ reference: string; duplicate?: boolean } | null>(null)
  const [cvName,     setCvName]     = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true); setError('')
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('jobSlug', jobSlug)
      const res  = await fetch('/api/careers/apply', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong — please try again.'); return }
      setDone({ reference: data.reference, duplicate: data.duplicate })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('Network error — please check your connection and try again.') }
    finally { setSubmitting(false) }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
        <CheckCircle className="w-12 h-12 text-[#C9A84C] mx-auto mb-4" />
        <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-2">
          {done.duplicate ? 'You’ve already applied' : 'Application received'}
        </h2>
        <p className="text-[#0B1F3A]/60 text-sm leading-relaxed mb-4">
          {done.duplicate
            ? 'Your earlier application for this position is already on file with our team.'
            : `Thank you for applying for ${jobTitle}. A confirmation email with your status link is on its way.`}
        </p>
        <p className="text-xs text-[#0B1F3A]/40">
          Your reference: <span className="font-mono font-bold text-[#0B1F3A]">{done.reference}</span>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#0B1F3A]">About you</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><span className={label}>First name *</span><input name="firstName" required maxLength={80} className={inp} autoComplete="given-name" /></div>
          <div><span className={label}>Last name *</span><input name="lastName" required maxLength={80} className={inp} autoComplete="family-name" /></div>
          <div><span className={label}>Email *</span><input name="email" type="email" required maxLength={200} className={inp} autoComplete="email" /></div>
          <div><span className={label}>Phone</span><input name="phone" maxLength={40} className={inp} autoComplete="tel" /></div>
          <div><span className={label}>Country</span><input name="country" maxLength={80} className={inp} autoComplete="country-name" /></div>
          <div><span className={label}>City</span><input name="city" maxLength={80} className={inp} autoComplete="address-level2" /></div>
          <div><span className={label}>LinkedIn URL</span><input name="linkedinUrl" maxLength={300} className={inp} placeholder="https://linkedin.com/in/…" /></div>
          <div><span className={label}>Portfolio URL</span><input name="portfolioUrl" maxLength={300} className={inp} placeholder="https://…" /></div>
        </div>
        <div><span className={label}>Are you authorized to work in the role&apos;s location?</span>
          <input name="workAuthorization" maxLength={200} className={inp} placeholder="e.g. Yes — authorized to work in the role's location" /></div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Your application</h2>
        <div>
          <span className={label}>CV / Résumé * (PDF, Word or text, max 8MB)</span>
          <label className="flex items-center gap-3 bg-[#F5F2EE] border border-dashed border-[#C9A84C]/50 rounded-xl px-4 py-4 cursor-pointer hover:bg-[#C9A84C]/5">
            <Upload className="w-5 h-5 text-[#C9A84C]" />
            <span className="text-sm text-[#0B1F3A]/60">{cvName || 'Choose a file…'}</span>
            <input name="cv" type="file" required accept=".pdf,.doc,.docx,.txt" className="sr-only"
              onChange={e => setCvName(e.target.files?.[0]?.name ?? '')} />
          </label>
        </div>
        <div><span className={label}>Cover letter</span>
          <textarea name="coverLetter" rows={5} maxLength={5000} className={`${inp} resize-none`}
            placeholder="Tell us why you're a great fit…" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><span className={label}>How did you hear about this role?</span>
            <input name="howHeard" maxLength={200} className={inp} /></div>
          <div><span className={label}>Referred by (optional)</span>
            <input name="referral" maxLength={200} className={inp} /></div>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">A few questions</h2>
          {questions.map(q => (
            <div key={q.id}>
              <span className={label}>{q.question}{q.required ? ' *' : ''}</span>
              {q.kind === 'boolean' ? (
                <select name={`q_${q.id}`} required={q.required} className={`${inp} bg-white`} defaultValue="">
                  <option value="" disabled>Select…</option>
                  <option>Yes</option><option>No</option>
                </select>
              ) : q.kind === 'select' ? (
                <select name={`q_${q.id}`} required={q.required} className={`${inp} bg-white`} defaultValue="">
                  <option value="" disabled>Select…</option>
                  {q.options.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <textarea name={`q_${q.id}`} required={q.required} rows={3} maxLength={5000} className={`${inp} resize-none`} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 space-y-4">
        <div><span className={label}>Accessibility or accommodation request (optional)</span>
          <textarea name="accommodation" rows={2} maxLength={2000} className={`${inp} resize-none`}
            placeholder="Let us know how we can support you through this process" /></div>
        <div className="bg-[#F5F2EE] rounded-xl p-4">
          <p className="text-[11px] text-[#0B1F3A]/50 leading-relaxed mb-3">{aiDisclosure}</p>
          <label className="flex items-start gap-2.5 text-xs text-[#0B1F3A]/70 mb-2 cursor-pointer">
            <input type="checkbox" name="consentPrivacy" value="true" required className="mt-0.5 rounded border-gray-300" />
            <span>I consent to Walz Travels processing my application data in line with its{' '}
              <a href="/privacy" target="_blank" className="text-[#C9A84C] hover:underline">privacy policy</a>. *</span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-[#0B1F3A]/70 cursor-pointer">
            <input type="checkbox" name="consentAi" value="true" required className="mt-0.5 rounded border-gray-300" />
            <span>I acknowledge that AI assists in reviewing applications, and that all hiring decisions are made by Walz Travels staff. *</span>
          </label>
        </div>
      </div>

      <button type="submit" disabled={submitting}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? 'Submitting…' : 'Submit Application'}
      </button>
    </form>
  )
}
