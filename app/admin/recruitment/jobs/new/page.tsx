'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { JobForm, EMPTY_JOB, type JobFormValue, type ScreeningQuestion } from '@/components/admin/recruitment/JobForm'

export default function NewJobPage() {
  const router = useRouter()
  const [form,      setForm]      = useState<JobFormValue>(EMPTY_JOB)
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      const res  = await fetch('/api/admin/recruitment/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          positions:       form.positions,
          compensationMin: form.compensationMin || null,
          compensationMax: form.compensationMax || null,
          deadline:        form.deadline || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create job'); return }
      if (questions.length > 0) {
        await fetch(`/api/admin/recruitment/jobs/${data.job.id}/questions`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions }),
        })
      }
      router.push(`/admin/recruitment/jobs/${data.job.id}`)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment/jobs" className="hover:underline">Job Openings</Link> › New
        </p>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">New Job Opening</h1>
        <p className="text-gray-400 text-sm mt-0.5">Saved as a draft — publish from the job list when ready</p>
      </div>
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      <JobForm value={form} onChange={setForm} questions={questions} onQuestionsChange={setQuestions}
        onSave={() => void save()} saving={saving} saveLabel="Create Draft" />
    </div>
  )
}
