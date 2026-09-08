'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ExternalLink } from 'lucide-react'
import { JobForm, EMPTY_JOB, type JobFormValue, type ScreeningQuestion } from '@/components/admin/recruitment/JobForm'

export default function EditJobPage() {
  const params = useParams<{ id: string }>()
  const [form,      setForm]      = useState<JobFormValue>(EMPTY_JOB)
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([])
  const [meta,      setMeta]      = useState<{ status: string; slug: string | null; jobRef: string | null } | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/recruitment/jobs/${params.id}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      const j = data.job
      setMeta({ status: j.status, slug: j.slug, jobRef: j.jobRef })
      setForm({
        title: j.title ?? '', department: j.department ?? '', type: j.type ?? 'Full-time',
        workplaceType: j.workplaceType ?? 'remote', location: j.location ?? '',
        compensationType: j.compensationType ?? 'salary',
        compensationMin: j.compensationMin != null ? String(j.compensationMin) : '',
        compensationMax: j.compensationMax != null ? String(j.compensationMax) : '',
        currency: j.currency ?? 'GBP', description: j.description ?? '',
        responsibilities: j.responsibilities ?? '', requirements: j.requirements ?? '',
        benefits: j.benefits ?? '', applicationInstructions: j.applicationInstructions ?? '',
        deadline: j.deadline ? j.deadline.slice(0, 10) : '', hiringManager: j.hiringManager ?? '',
        positions: j.positions ?? 1, aiDisclosure: j.aiDisclosure ?? '',
      })
      setQuestions((j.screeningQuestions ?? []).map((q: { question: string; kind: string; required: boolean; options: string[] }) => ({
        question: q.question, kind: q.kind, required: q.required, options: q.options ?? [],
      })))
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  async function save() {
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/admin/recruitment/jobs/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          compensationMin: form.compensationMin || null,
          compensationMax: form.compensationMax || null,
          deadline:        form.deadline || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      const qRes = await fetch(`/api/admin/recruitment/jobs/${params.id}/questions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.filter(q => q.question.trim()) }),
      })
      if (!qRes.ok) { setError((await qRes.json()).error ?? 'Questions failed to save'); return }
      setSuccess('Saved'); setTimeout(() => setSuccess(''), 2500)
      await load()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link href="/admin/recruitment/jobs" className="hover:underline">Job Openings</Link> › Edit
          </p>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">{form.title || 'Job'}</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {meta?.jobRef ?? ''} · status: <span className="font-semibold">{meta?.status}</span>
          </p>
        </div>
        {meta?.status === 'published' && meta.slug && (
          <a href={`/careers/${meta.slug}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#C9A84C] hover:underline mt-6">
            <ExternalLink className="w-3.5 h-3.5" /> View public page
          </a>
        )}
      </div>
      {error   && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-2.5">{success}</p>}
      <JobForm value={form} onChange={setForm} questions={questions} onQuestionsChange={setQuestions}
        onSave={() => void save()} saving={saving} saveLabel="Save Changes" />
    </div>
  )
}
