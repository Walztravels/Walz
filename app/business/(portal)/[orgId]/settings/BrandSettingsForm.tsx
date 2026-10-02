'use client'

// app/business/[orgId]/settings/BrandSettingsForm.tsx — Walz Business (V1-B)
// Thin client form over the EXISTING, UNCHANGED PATCH .../brand-settings
// route. Rendered read-only for everyone; the editable fields are only ever
// shown for ADMIN-tier members and above — matching that route's own
// minRole, which the route re-enforces independently regardless of what
// this component does.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface BrandSettingsValue {
  displayName: string | null
  logoUrl: string | null
  brandColor: string | null
  supportEmail: string | null
  supportPhone: string | null
  clientFacingSenderName: string | null
  whiteLabelEnabled: boolean
}

export default function BrandSettingsForm({ orgId, initial }: { orgId: string; initial: BrandSettingsValue }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function field(name: keyof BrandSettingsValue) {
    return {
      value: (values[name] ?? '') as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues(v => ({ ...v, [name]: e.target.value })),
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setSuccess(false)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/brand-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not save brand settings')
        return
      }
      setSuccess(true)
      router.refresh()
    } catch {
      setError('Could not save brand settings')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 focus:border-[#0B1F3A]'
  const labelClass = 'block text-xs font-semibold text-slate-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {success && <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">Brand settings saved.</div>}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bs-displayName" className={labelClass}>Display name</label>
          <input id="bs-displayName" {...field('displayName')} className={inputClass} placeholder="Shown to your travellers" />
        </div>
        <div>
          <label htmlFor="bs-logoUrl" className={labelClass}>Logo URL</label>
          <input id="bs-logoUrl" {...field('logoUrl')} className={inputClass} placeholder="https://…" />
        </div>
        <div>
          <label htmlFor="bs-brandColor" className={labelClass}>Brand color</label>
          <input id="bs-brandColor" {...field('brandColor')} className={inputClass} placeholder="#0B1F3A" />
        </div>
        <div>
          <label htmlFor="bs-senderName" className={labelClass}>Client-facing sender name</label>
          <input id="bs-senderName" {...field('clientFacingSenderName')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bs-supportEmail" className={labelClass}>Support email</label>
          <input id="bs-supportEmail" type="email" {...field('supportEmail')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bs-supportPhone" className={labelClass}>Support phone</label>
          <input id="bs-supportPhone" {...field('supportPhone')} className={inputClass} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={values.whiteLabelEnabled}
          onChange={e => setValues(v => ({ ...v, whiteLabelEnabled: e.target.checked }))}
          className="rounded border-slate-300 text-[#0B1F3A] focus:ring-[#0B1F3A]/30"
        />
        Enable white-label presentation
      </label>
      <p className="text-xs text-slate-400 -mt-2">
        Presentation only — legal, regulatory, government-facing, and payment disclosures always show the real Walz/operator identity.
      </p>

      <div>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors disabled:opacity-60">
          {busy ? 'Saving…' : 'Save brand settings'}
        </button>
      </div>
    </form>
  )
}
