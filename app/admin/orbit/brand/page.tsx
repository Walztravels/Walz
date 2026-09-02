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
import { SUBMITTED_PHONE_ALERT } from '@/lib/orbit/brand/phone-validator'
import { BUSINESS } from '@/lib/config/business'

export const dynamic = 'force-dynamic'

interface AssetsResponse {
  assets: WalzBrandAsset[]
}

// ── Util ──────────────────────────────────────────────────────────────────────

function variantBadgeColor(variant: LogoVariant): string {
  return {
    PRIMARY:    'bg-indigo-950 border-indigo-700 text-indigo-300',
    LIGHT:      'bg-gray-800 border-gray-600 text-gray-300',
    DARK:       'bg-zinc-900 border-zinc-700 text-zinc-400',
    MONOCHROME: 'bg-slate-900 border-slate-700 text-slate-400',
    ICON:       'bg-amber-950 border-amber-700 text-amber-300',
  }[variant]
}

// ── Upload panel ──────────────────────────────────────────────────────────────

function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const [variant,   setVariant]   = useState<LogoVariant>('PRIMARY')
  const [file,      setFile]      = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) { setError('Choose a file first.'); return }
    setUploading(true); setError(null); setSuccess(false)
    const form = new FormData()
    form.append('variant', variant)
    form.append('file', file)
    try {
      const res = await fetch('/api/admin/orbit/brand/upload', { method: 'POST', body: form })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setSuccess(true); setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
      <h2 className="text-sm font-bold text-white uppercase tracking-widest">Upload Logo Variant</h2>
      <p className="text-xs text-gray-400 leading-relaxed">
        Upload the official Walz Travels logo. Accepted formats: PNG, SVG, WebP (max 5 MB).
        Only one logo per variant is kept — uploading again replaces the previous version.
      </p>

      {/* Variant selector */}
      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Variant</p>
        <div className="flex flex-wrap gap-2">
          {LOGO_VARIANTS.map(v => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                variant === v
                  ? variantBadgeColor(v)
                  : 'border-gray-800 bg-gray-900 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {LOGO_VARIANT_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* File picker */}
      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Logo File</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setSuccess(false); setError(null) }}
          className="block w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-800 file:text-white hover:file:bg-indigo-700 cursor-pointer"
        />
        {file && (
          <p className="mt-1 text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(0)} KB · {file.type}</p>
        )}
      </div>

      {error   && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-xs text-green-400 bg-green-950/50 border border-green-800 rounded-lg px-3 py-2">Logo uploaded successfully.</p>}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors"
      >
        {uploading ? 'Uploading…' : `Upload ${LOGO_VARIANT_LABELS[variant]}`}
      </button>
    </div>
  )
}

// ── Asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset, onDelete }: { asset: WalzBrandAsset; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleDelete() {
    if (!confirm(`Remove ${LOGO_VARIANT_LABELS[asset.variant]} logo? This cannot be undone.`)) return
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/admin/orbit/brand?id=${encodeURIComponent(asset.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Delete failed')
      }
      onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${variantBadgeColor(asset.variant)}`}>
          {LOGO_VARIANT_LABELS[asset.variant]}
        </span>
        <span className="text-xs text-gray-600">{new Date(asset.createdAt).toLocaleDateString('en-GB')}</span>
      </div>

      {/* Preview */}
      <div className="bg-gray-950 rounded-lg p-4 flex items-center justify-center min-h-16">
        {asset.mimeType === 'image/svg+xml' ? (
          <img src={asset.publicUrl} alt={asset.variant} className="max-h-16 max-w-full object-contain" />
        ) : (
          <img src={asset.publicUrl} alt={asset.variant} className="max-h-16 max-w-full object-contain" />
        )}
      </div>

      <div className="text-xs text-gray-600 truncate">{asset.mimeType}</div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 disabled:opacity-40 rounded-lg text-xs font-medium text-red-400 transition-colors"
      >
        {deleting ? 'Removing…' : 'Remove'}
      </button>
    </div>
  )
}

// ── Phone alert ───────────────────────────────────────────────────────────────

function PhoneAlert() {
  if (SUBMITTED_PHONE_ALERT.valid) return null
  return (
    <div className="rounded-2xl border border-amber-800 bg-amber-950/30 p-5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 font-bold text-sm">Phone Number Alert</span>
        <span className="text-xs bg-amber-950 border border-amber-700 text-amber-400 px-2 py-0.5 rounded">Admin Warning</span>
      </div>
      <p className="text-xs text-amber-200 leading-relaxed">{SUBMITTED_PHONE_ALERT.warning}</p>
      {SUBMITTED_PHONE_ALERT.suggestion && (
        <p className="text-xs text-amber-300/70 leading-relaxed">{SUBMITTED_PHONE_ALERT.suggestion}</p>
      )}
      <p className="text-xs text-amber-400/60 mt-2">
        The submitted number <code className="font-mono">{SUBMITTED_PHONE_ALERT.raw}</code> has NOT been applied.
        The existing production contact number{' '}
        <code className="font-mono text-amber-300">{BUSINESS.contacts.globalWhatsapp.display}</code> remains in use.
        Confirm and correct the number before updating the brand config.
      </p>
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
      const data = await res.json() as AssetsResponse
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold mb-1">Walz Orbit</p>
          <h1 className="text-2xl font-bold text-white">Brand Assets</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage official Walz Travels logo variants. Uploaded logos appear automatically
            across all Graphic Designer templates.
          </p>
        </div>

        {/* Phone alert */}
        <PhoneAlert />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left: current assets */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Active Logo Variants</h2>
              <button onClick={load} disabled={loading} className="text-xs text-gray-400 hover:text-white transition-colors">
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">{error}</div>
            )}

            {!loading && Object.keys(assets).length === 0 && !error && (
              <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
                <p className="text-gray-500 text-sm">No logo variants uploaded yet.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Upload the official Walz Travels logo using the panel on the right.
                </p>
              </div>
            )}

            {/* Variant grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOGO_VARIANTS.map(v => {
                const asset = assets[v]
                if (!asset) return (
                  <div key={v} className="rounded-xl border border-dashed border-gray-800 bg-gray-900/30 p-4 flex flex-col gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border self-start ${variantBadgeColor(v)}`}>
                      {LOGO_VARIANT_LABELS[v]}
                    </span>
                    <p className="text-xs text-gray-600">Not uploaded</p>
                  </div>
                )
                return <AssetCard key={v} asset={asset} onDelete={load} />
              })}
            </div>

            {/* Treatment reference */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Logo Treatments</h3>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                Protective treatments render behind the logo on the poster canvas. The logo image itself is never modified.
                Treatments can be set per-design in the Designer Mode controls.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(LOGO_TREATMENT_LABELS).map(([key, label]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-xs text-gray-500 font-mono w-24 flex-shrink-0">{key}</span>
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: upload + contacts */}
          <div className="space-y-6">
            <UploadPanel onUploaded={load} />

            {/* Current brand contacts (read-only) */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Brand Contacts</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Contact details sourced from central business config (<code className="font-mono text-gray-400">lib/config/business.ts</code>).
                These appear on poster contact bars. Update the config file to change them.
              </p>
              <div className="space-y-2">
                <Row label="Global WhatsApp" value={BUSINESS.contacts.globalWhatsapp.display} />
                <Row label="Visa WhatsApp"   value={BUSINESS.contacts.visaWhatsapp.display} />
                <Row label="Nigeria WhatsApp" value={BUSINESS.contacts.nigeriaWhatsapp.display} />
                <Row label="Email"            value={BUSINESS.contacts.email} />
              </div>
            </div>
          </div>
        </div>

        {/* Guidance footer */}
        <div className="mt-10 border-t border-gray-800 pt-6">
          <p className="text-xs text-gray-600 leading-relaxed max-w-2xl">
            AI never generates, redraws, or recreates the Walz Travels logo. The official uploaded logo
            is the only source of truth. When no logo is uploaded for a variant, the Designer falls back
            to text — upload the official logo files to enable the full brand system.
          </p>
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-300 font-mono">{value}</span>
    </div>
  )
}
