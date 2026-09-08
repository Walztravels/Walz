'use client'

// Recruitment Hub — shared job create/edit form (all fields + screening
// questions). Server-side validation is authoritative; this mirrors it for UX.

import { useState } from 'react'
import { Loader2, Check, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'

export interface ScreeningQuestion {
  question: string
  kind: 'text' | 'boolean' | 'select'
  required: boolean
  options: string[]
}

export interface JobFormValue {
  title: string; department: string; type: string; workplaceType: string
  location: string; compensationType: string; compensationMin: string
  compensationMax: string; currency: string; description: string
  responsibilities: string; requirements: string; benefits: string
  applicationInstructions: string; deadline: string; hiringManager: string
  positions: number; aiDisclosure: string
}

export const EMPTY_JOB: JobFormValue = {
  title: '', department: '', type: 'Full-time', workplaceType: 'remote',
  location: '', compensationType: 'salary', compensationMin: '', compensationMax: '',
  currency: 'GBP', description: '', responsibilities: '', requirements: '',
  benefits: '', applicationInstructions: '', deadline: '', hiringManager: '',
  positions: 1, aiDisclosure: '',
}

const EMPLOYMENT_TYPES  = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Commission-based']
const WORKPLACE_TYPES   = [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']]
const COMPENSATION_TYPES = [['salary', 'Salary'], ['hourly', 'Hourly'], ['commission', 'Commission'], ['mixed', 'Mixed']]

const inp   = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]'
const label = 'text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1'

export function JobForm({ value, onChange, questions, onQuestionsChange, onSave, saving, saveLabel }: {
  value: JobFormValue
  onChange: (v: JobFormValue) => void
  questions: ScreeningQuestion[]
  onQuestionsChange: (q: ScreeningQuestion[]) => void
  onSave: () => void
  saving: boolean
  saveLabel: string
}) {
  const [showQ, setShowQ] = useState(questions.length > 0)
  const set = (patch: Partial<JobFormValue>) => onChange({ ...value, ...patch })

  function moveQ(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= questions.length) return
    const next = [...questions]
    ;[next[i], next[j]] = [next[j], next[i]]
    onQuestionsChange(next)
  }

  return (
    <div className="space-y-5">
      {/* Basics */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-[#0B1F3A] text-sm">Role</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><span className={label}>Job title *</span>
            <input aria-label="Job title" className={inp} value={value.title} onChange={e => set({ title: e.target.value })} /></div>
          <div><span className={label}>Department</span>
            <input aria-label="Department" className={inp} value={value.department} onChange={e => set({ department: e.target.value })} placeholder="e.g. Sales & Marketing" /></div>
          <div><span className={label}>Employment type *</span>
            <select aria-label="Employment type" className={`${inp} bg-white`} value={value.type} onChange={e => set({ type: e.target.value })}>
              {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select></div>
          <div><span className={label}>Workplace</span>
            <select aria-label="Workplace type" className={`${inp} bg-white`} value={value.workplaceType} onChange={e => set({ workplaceType: e.target.value })}>
              {WORKPLACE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><span className={label}>Location *</span>
            <input aria-label="Location" className={inp} value={value.location} onChange={e => set({ location: e.target.value })} placeholder="e.g. Remote (UK/Nigeria)" /></div>
          <div><span className={label}>Open positions</span>
            <input aria-label="Number of positions" type="number" min={1} className={inp} value={value.positions}
              onChange={e => set({ positions: parseInt(e.target.value) || 1 })} /></div>
          <div><span className={label}>Application deadline</span>
            <input aria-label="Application deadline" type="date" className={inp} value={value.deadline} onChange={e => set({ deadline: e.target.value })} /></div>
          <div><span className={label}>Hiring manager (email)</span>
            <input aria-label="Hiring manager email" className={inp} value={value.hiringManager} onChange={e => set({ hiringManager: e.target.value })} placeholder="staff@walztravels.com" /></div>
        </div>
      </div>

      {/* Compensation */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-[#0B1F3A] text-sm">Compensation</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <div><span className={label}>Type</span>
            <select aria-label="Compensation type" className={`${inp} bg-white`} value={value.compensationType} onChange={e => set({ compensationType: e.target.value })}>
              {COMPENSATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><span className={label}>Currency</span>
            <input aria-label="Currency" className={inp} value={value.currency} onChange={e => set({ currency: e.target.value })} /></div>
          <div><span className={label}>Range min (optional)</span>
            <input aria-label="Compensation minimum" type="number" className={inp} value={value.compensationMin} onChange={e => set({ compensationMin: e.target.value })} /></div>
          <div><span className={label}>Range max (optional)</span>
            <input aria-label="Compensation maximum" type="number" className={inp} value={value.compensationMax} onChange={e => set({ compensationMax: e.target.value })} /></div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-[#0B1F3A] text-sm">Description</h2>
        {([
          ['Description *', 'description', 5],
          ['Responsibilities', 'responsibilities', 4],
          ['Requirements', 'requirements', 4],
          ['Benefits', 'benefits', 3],
          ['Application instructions', 'applicationInstructions', 2],
        ] as Array<[string, keyof JobFormValue, number]>).map(([lbl, field, rows]) => (
          <div key={field}><span className={label}>{lbl}</span>
            <textarea aria-label={lbl.replace(' *', '')} rows={rows} className={`${inp} resize-none`}
              value={value[field] as string} onChange={e => set({ [field]: e.target.value } as Partial<JobFormValue>)} /></div>
        ))}
        <div><span className={label}>AI-use disclosure (leave blank for the Walz default)</span>
          <textarea aria-label="AI-use disclosure" rows={2} className={`${inp} resize-none`}
            value={value.aiDisclosure} onChange={e => set({ aiDisclosure: e.target.value })}
            placeholder="Default Walz AI-use disclosure will be shown" /></div>
      </div>

      {/* Screening questions */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#0B1F3A] text-sm">Screening questions ({questions.length})</h2>
          <button type="button" onClick={() => setShowQ(s => !s)} className="text-xs text-[#C9A84C] hover:underline">
            {showQ ? 'Hide' : 'Configure'}
          </button>
        </div>
        {showQ && (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="bg-[#F5F0E8] rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Move question ${i + 1} up`} onClick={() => moveQ(i, -1)} disabled={i === 0}
                      className="p-0.5 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                    <button type="button" aria-label={`Move question ${i + 1} down`} onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1}
                      className="p-0.5 text-gray-300 hover:text-[#0B1F3A] disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                  </div>
                  <textarea aria-label={`Question ${i + 1}`} rows={2} className={`${inp} resize-none flex-1`}
                    value={q.question}
                    onChange={e => onQuestionsChange(questions.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove question ${i + 1}`}
                    onClick={() => onQuestionsChange(questions.filter((_, j) => j !== i))}
                    className="p-1.5 text-gray-300 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-3 pl-6">
                  <select aria-label={`Question ${i + 1} type`} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                    value={q.kind}
                    onChange={e => onQuestionsChange(questions.map((x, j) => j === i ? { ...x, kind: e.target.value as ScreeningQuestion['kind'] } : x))}>
                    <option value="text">Free text</option>
                    <option value="boolean">Yes / No</option>
                    <option value="select">Multiple choice</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={q.required}
                      onChange={e => onQuestionsChange(questions.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />
                    Required
                  </label>
                  {q.kind === 'select' && (
                    <input aria-label={`Question ${i + 1} options`} className="border border-gray-200 rounded-lg px-2 py-1 text-xs flex-1"
                      placeholder="Options, comma-separated"
                      value={q.options.join(', ')}
                      onChange={e => onQuestionsChange(questions.map((x, j) => j === i ? { ...x, options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) } : x))} />
                  )}
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => onQuestionsChange([...questions, { question: '', kind: 'text', required: false, options: [] }])}
              className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add question
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-2.5 rounded-xl text-sm disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
