'use client'

import { useState, useEffect, useRef } from 'react'
import {
  LOGO_VARIANTS,
  LOGO_VARIANT_LABELS,
  LOGO_TREATMENT_LABELS,
  type LogoVariant,
  type WalzBrandAsset,
  type WalzBrandAssets,
} from '@/lib/orbit/brand'
import { CONFIRMED_PHONE } from '@/lib/orbit/brand/phone-validator'
import { BUSINESS, waLink } from '@/lib/config/business'

export const dynamic = 'force-dynamic'

const VARIANT_META: Record<LogoVariant, { label: string; required: boolean; hint: string; darkBg: boolean }> = {
  PRIMARY:    { label: 'Primary Logo',    required: true,  hint: 'Colour logo on transparent. Required to enable branded export.', darkBg: false },
  LIGHT:      { label: 'Light Logo',      required: false, hint: 'White/light version — used on dark poster backgrounds.', darkBg: true  },
  DARK:       { label: 'Dark Logo',       required: false, hint: 'Black/dark version — used on light poster backgrounds.', darkBg: false },
  MONOCHROME: { label: 'Monochrome',      required: false, hint: 'Single-colour version for luxury or minimal posters.', darkBg: true  },
  ICON:       { label: 'Icon Only',       required: false, hint: 'Symbol / mark without wordmark. Used when space is limited.', darkBg: false },
}

// ── Upload form ───────────────────────────────────────────────────────────────

function UploadForm({
  variant,
  existing,
  onDone,
}: {
  variant:  LogoVariant
  existing: WalzBrandAsset | null
  onDone:   () => void
}) {
  const [file,      setFile]      = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!file) return
    setUploading(true); setError(null)
    const form = new FormData()
    form.append('variant', variant)
    form.append('file', file)
    try {
      const res = await fetch('/api/admin/orbit/brand/upload', { method: 'POST', body: form })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-gray-800">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }}
        className="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-800 file:text-gray-300 cursor-pointer"
      />
      {file && <p className="text-xs text-gray-600">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={!file || uploading}
        className="w-full py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 rounded-lg text-xs font-semibold text-white transition-colors"
      >
        {uploading ? 'Uploading…' : existing ? 'Replace Logo' : 'Upload Logo'}
      </button>
    </div>
  )
}

// ── Variant card ──────────────────────────────────────────────────────────────

function VariantCard({
  variant,
  asset,
  onRefresh,
}: {
  variant:   LogoVariant
  asset:     WalzBrandAsset | null
  onRefresh: () => void
}) {
  const meta     = VARIANT_META[variant]
  const [showUpload, setShowUpload] = useState(!asset)
  const [deleting,   setDeleting]   = useState(false)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)

  useEffect(() => { setShowUpload(!asset) }, [asset])

  async function handleDelete() {
    if (!asset) return
    if (!confirm(`Remove ${meta.label}? This cannot be undone.`)) return
    setDeleting(true); setDeleteErr(null)
    try {
      const res = await fetch(`/api/admin/orbit/brand?id=${encodeURIComponent(asset.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Delete failed')
      }
      onRefresh()
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className={`rounded-2xl border ${asset ? 'border-gray-700 bg-gray-900' : 'border-dashed border-gray-800 bg-gray-900/40'} p-5 space-y-4`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">{meta.label}</h3>
            {meta.required && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-400 font-medium">Required</span>
            )}
            {asset && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-950 border border-green-800 text-green-400 font-medium">✓ Active</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">{meta.hint}</p>
        </div>
      </div>

      {/* Preview */}
      {asset ? (
        <div className={`rounded-xl p-4 flex items-center justify-center min-h-20 ${meta.darkBg ? 'bg-gray-950' : 'bg-gray-100'}`}>
          <img
            src={asset.publicUrl}
            alt={meta.label}
            className="max-h-16 max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/50 p-6 flex flex-col items-center justify-center gap-1 min-h-20">
          <p className="text-xs text-gray-600">Not uploaded</p>
          {meta.required && <p className="text-xs text-amber-600">Required for branded export</p>}
        </div>
      )}

      {/* Actions */}
      {asset && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(v => !v)}
            className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors"
          >
            {showUpload ? 'Cancel Replace' : 'Replace'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-1.5 bg-red-950 hover:bg-red-900 border border-red-900 rounded-lg text-xs font-medium text-red-400 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      )}

      {deleteErr && <p className="text-xs text-red-400">{deleteErr}</p>}

      {/* Upload form */}
      {showUpload && (
        <UploadForm
          variant={variant}
          existing={asset}
          onDone={() => { onRefresh(); setShowUpload(false) }}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrandPage() {
  const [assets,  setAssets]  = useState<WalzBrandAssets>({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/orbit/brand')
      if (!res.ok) throw new Error('Failed to load brand assets')
      const data = await res.json() as { assets: WalzBrandAsset[] }
      const map: WalzBrandAssets = {}
      for (const a of data.assets) map[a.variant as LogoVariant] = a
      setAssets(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const hasPrimary = !!assets.PRIMARY
  const uploadedCount = LOGO_VARIANTS.filter(v => assets[v]).length

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold mb-1">Walz Orbit · Brand</p>
          <h1 className="text-2xl font-bold text-white">Brand Assets</h1>
          <p className="text-sm text-gray-400 mt-1">
            Upload the official Walz Travels logo. Once uploaded, it appears automatically
            on every Graphic Designer poster — adapting variant and treatment to the poster background.
          </p>
        </div>

        {/* Status banner */}
        {!loading && !hasPrimary && (
          <div className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3">
            <p className="text-sm font-semibold text-amber-300">Primary logo required</p>
            <p className="text-xs text-amber-400 mt-1">
              Upload your official Walz Travels Primary logo below to enable branded poster export.
              Without it, posters export without a logo.
            </p>
          </div>
        )}

        {hasPrimary && (
          <div className="rounded-xl border border-green-800 bg-green-950/30 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400">Brand active — {uploadedCount}/5 variant{uploadedCount !== 1 ? 's' : ''} uploaded</p>
              <p className="text-xs text-green-600 mt-0.5">
                Posters will use the best available variant for each background.
              </p>
            </div>
            <a
              href="/admin/orbit/campaigns"
              className="text-xs text-green-400 hover:text-green-200 underline flex-shrink-0"
            >
              Open Campaigns →
            </a>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Variant cards */}
        {loading ? (
          <div className="text-sm text-gray-500">Loading brand assets…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOGO_VARIANTS.map(v => (
              <VariantCard key={v} variant={v} asset={assets[v] ?? null} onRefresh={load} />
            ))}
          </div>
        )}

        {/* Format guidance */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Upload Guidelines</h2>
          <ul className="text-xs text-gray-500 space-y-1 leading-relaxed list-disc list-inside">
            <li>Accepted formats: SVG (preferred), PNG, WebP — max 5 MB</li>
            <li>Use a transparent background — the compositor applies the background</li>
            <li>Maintain original aspect ratio — it is never distorted</li>
            <li>Do not include a coloured rectangle behind the logo — upload the logo mark only</li>
            <li>AI never generates, redraws, or recreates the Walz Travels logo</li>
          </ul>
        </div>

        {/* Treatments reference */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Protective Treatments</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Applied behind the logo on complex photo backgrounds. The logo image itself is never modified.
            Treatments can be overridden per-design in Designer Mode controls.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(LOGO_TREATMENT_LABELS).map(([key, label]) => (
              <div key={key} className="flex gap-2 items-baseline">
                <span className="text-xs font-mono text-gray-600 w-24 flex-shrink-0">{key}</span>
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Brand contacts */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Production Contact Numbers</h2>
          <p className="text-xs text-gray-500">
            These appear on poster contact bars. Central config at <code className="text-gray-400">lib/config/business.ts</code>.
          </p>
          <div className="space-y-2">
            <ContactRow label="Global WhatsApp" value={BUSINESS.contacts.globalWhatsapp.display} link={waLink(BUSINESS.contacts.globalWhatsapp.e164)} />
            <ContactRow label="Visa WhatsApp"   value={BUSINESS.contacts.visaWhatsapp.display}   link={waLink(BUSINESS.contacts.visaWhatsapp.e164)} />
            <ContactRow label="Nigeria"         value={BUSINESS.contacts.nigeriaWhatsapp.display} link={waLink(BUSINESS.contacts.nigeriaWhatsapp.e164)} />
            <ContactRow label="Email"           value={BUSINESS.contacts.email} />
          </div>
          {CONFIRMED_PHONE.valid && (
            <p className="text-xs text-green-700 mt-2">
              ✓ Global number {CONFIRMED_PHONE.display} confirmed valid.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

function ContactRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex gap-3 items-center">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="text-xs text-gray-300 font-mono hover:text-white transition-colors">
          {value}
        </a>
      ) : (
        <span className="text-xs text-gray-300 font-mono">{value}</span>
      )}
    </div>
  )
}
