'use client'

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from 'react'
import Link from 'next/link'
import { Upload, ArrowLeft, ArrowRight, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5

type ColumnMapping = {
  name:        string | null
  contact:     string | null
  email:       string | null
  service:     string | null
  destination: string | null
  travelDate:  string | null
  details:     string | null
  createdAt:   string | null
}

type ParseResult = {
  headers:     string[]
  previewRows: Record<string, string>[]
  totalRows:   number
}

type ImportResult = {
  imported:          number
  skippedDuplicates: number
  skippedInvalid:    number
  importBatchId:     string
  errors:            { row: number; reason: string }[]
}

const EMPTY_MAPPING: ColumnMapping = {
  name:        null,
  contact:     null,
  email:       null,
  service:     null,
  destination: null,
  travelDate:  null,
  details:     null,
  createdAt:   null,
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  name:        'Name *',
  contact:     'Contact / Phone',
  email:       'Email',
  service:     'Service',
  destination: 'Destination',
  travelDate:  'Travel Date',
  details:     'Notes / Details',
  createdAt:   'Original Date (optional)',
}

const SOURCE_OPTIONS = [
  { value: 'sleekflow_import', label: 'Sleekflow export' },
  { value: 'zendesk_import',   label: 'Zendesk export' },
  { value: 'csv_import',       label: 'Other CSV' },
]

// ── Main component ─────────────────────────────────────────────────────────────

export default function LeadsImportPage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)
  const [step, setStep]                 = useState<Step>(1)
  const [file, setFile]                 = useState<File | null>(null)
  const [source, setSource]             = useState('sleekflow_import')
  const [parsing, setParsing]           = useState(false)
  const [parseResult, setParseResult]   = useState<ParseResult | null>(null)
  const [mapping, setMapping]           = useState<ColumnMapping>({ ...EMPTY_MAPPING })
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError]               = useState('')
  const [dragOver, setDragOver]         = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check super_admin role
  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then((d: { role?: string }) => setIsSuperAdmin(d.role === 'super_admin'))
      .catch(() => setIsSuperAdmin(false))
  }, [])

  // ── Auto-guess column mapping from header names ──────────────────────────
  function guessMapping(headers: string[]): ColumnMapping {
    function best(patterns: RegExp[]): string | null {
      for (const p of patterns) {
        const h = headers.find(h => p.test(h))
        if (h) return h
      }
      return null
    }
    return {
      name:        best([/^name$/i, /full.?name/i, /contact.?name/i, /customer.?name/i]),
      contact:     best([/phone/i, /mobile/i, /whatsapp/i, /cell/i, /tel/i]),
      email:       best([/^email$/i, /email.?address/i, /e-?mail/i]),
      service:     best([/^tags?$/i, /service/i, /product/i, /interest/i, /topic/i]),
      destination: best([/destination/i, /country/i, /city/i, /where/i]),
      travelDate:  best([/travel.?date/i, /depart/i, /trip.?date/i, /journey/i]),
      details:     best([/note/i, /detail/i, /message/i, /comment/i, /description/i]),
      createdAt:   best([/created/i, /date.?added/i, /joined/i, /registered/i]),
    }
  }

  // ── File select ───────────────────────────────────────────────────────────
  function handleFile(f: File) {
    setError('')
    setParseResult(null)
    setMapping({ ...EMPTY_MAPPING })
    setFile(f)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  // ── Step 1 → 2: parse headers ────────────────────────────────────────────
  const doParse = useCallback(async () => {
    if (!file) return
    setParsing(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res  = await fetch('/api/admin/leads/import/parse', { method: 'POST', body: fd })
      const data = await res.json() as ParseResult & { error?: string }
      if (!res.ok) { setError(data.error ?? 'Parse failed'); return }
      setParseResult(data)
      setMapping(guessMapping(data.headers))
      setStep(2)
    } catch {
      setError('Upload failed — check your connection')
    } finally {
      setParsing(false)
    }
  }, [file])

  // ── Step 3 → 4: confirm import ────────────────────────────────────────────
  const doImport = useCallback(async () => {
    if (!file) return
    setImporting(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mapping', JSON.stringify(mapping))
    fd.append('source', source)
    try {
      const res  = await fetch('/api/admin/leads/import/confirm', { method: 'POST', body: fd })
      const data = await res.json() as ImportResult & { error?: string }
      if (!res.ok) { setError(data.error ?? 'Import failed'); return }
      setImportResult(data)
      setStep(5)
    } catch {
      setError('Import failed — check your connection')
    } finally {
      setImporting(false)
    }
  }, [file, mapping, source])

  const canProceedMapping = mapping.name && (mapping.contact || mapping.email)

  // ── Access gate ───────────────────────────────────────────────────────────
  if (isSuperAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Super admin access required</p>
          <Link href="/admin/leads" className="text-sm text-[#C9A84C] hover:underline mt-2 inline-block">
            ← Back to Leads
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center gap-4">
          <Link href="/admin/leads"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">Import Leads from CSV</h1>
            <p className="text-sm text-gray-500">Sleekflow, Zendesk, or any CSV export</p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-gray-100 px-8 py-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          {(['Upload', 'Preview', 'Map Columns', 'Confirm', 'Done'] as const).map((label, i) => {
            const s = (i + 1) as Step
            const active = step === s
            const done   = step > s
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors
                  ${done   ? 'bg-green-500 text-white'
                  : active ? 'bg-[#0B1F3A] text-[#C9A84C]'
                  :          'bg-gray-100 text-gray-400'}`}>
                  {done ? <Check className="w-3 h-3" /> : s}
                </div>
                <span className={active ? 'text-[#0B1F3A]' : done ? 'text-green-600' : 'text-gray-400'}>{label}</span>
                {i < 4 && <span className="text-gray-200">→</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-8 py-8 max-w-3xl">

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-[#0B1F3A] mb-1">Upload your CSV file</h2>
              <p className="text-sm text-gray-500">We'll detect the columns and let you map them to lead fields.</p>
            </div>

            {/* Source selector */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">
                Source platform
              </label>
              <div className="flex gap-2">
                {SOURCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSource(opt.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all
                      ${source === opt.value
                        ? 'bg-[#0B1F3A] text-[#C9A84C] border-[#0B1F3A]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-all
                ${dragOver  ? 'border-amber-400 bg-amber-50'
                : file       ? 'border-green-400 bg-green-50'
                :              'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleInputChange} />
              {file ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                    <p className="text-xs text-green-600 mt-0.5">{(file.size / 1024).toFixed(0)} KB — click to replace</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">
                      Drop CSV here or <span className="text-[#C9A84C] underline">click to browse</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">CSV files only · max 20 MB</p>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={doParse}
              disabled={!file || parsing}
              className="w-full py-3 bg-[#0B1F3A] text-[#C9A84C] font-bold rounded-xl hover:bg-[#0d2548] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {parsing ? <><Loader2 className="w-4 h-4 animate-spin" /> Detecting columns…</> : <>Preview columns <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}

        {/* ── STEP 2: Preview ── */}
        {step === 2 && parseResult && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#0B1F3A]">Column preview</h2>
                  <p className="text-sm text-gray-500">
                    {parseResult.totalRows.toLocaleString()} rows detected · {parseResult.headers.length} columns
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
                  {SOURCE_OPTIONS.find(o => o.value === source)?.label}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {parseResult.headers.map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap border-b border-gray-100">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parseResult.previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        {parseResult.headers.map(h => (
                          <td key={h} className="px-3 py-2 text-gray-600 max-w-[180px] truncate">
                            {row[h] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                ← Back
              </button>
              <button onClick={() => setStep(3)}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-[#C9A84C] font-bold rounded-xl hover:bg-[#0d2548] flex items-center justify-center gap-2">
                Map columns <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Column mapping ── */}
        {step === 3 && parseResult && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-[#0B1F3A] mb-1">Map columns</h2>
              <p className="text-sm text-gray-500 mb-6">
                Match your CSV headers to lead fields. We've pre-filled likely matches.
              </p>

              <div className="space-y-3">
                {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map(field => (
                  <div key={field} className="flex items-center gap-4">
                    <label className="w-44 text-sm font-medium text-gray-700 flex-shrink-0">
                      {FIELD_LABELS[field]}
                    </label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || null }))}
                      className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 transition
                        ${mapping[field] ? 'border-green-300 bg-green-50/30' : 'border-gray-200'}`}
                    >
                      <option value="">— Don't import —</option>
                      {parseResult.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!canProceedMapping && (
                <p className="mt-4 text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Name is required, plus at least one of Contact/Phone or Email.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                ← Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canProceedMapping}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-[#C9A84C] font-bold rounded-xl hover:bg-[#0d2548] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                Review &amp; confirm <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Confirm ── */}
        {step === 4 && parseResult && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-[#0B1F3A] mb-4">Ready to import</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">File</span>
                  <span className="font-medium text-gray-800">{file?.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">Source</span>
                  <span className="font-medium text-gray-800">{SOURCE_OPTIONS.find(o => o.value === source)?.label}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">Rows to process</span>
                  <span className="font-bold text-[#0B1F3A]">{parseResult.totalRows.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">Status assigned to all</span>
                  <span className="font-medium text-blue-600">New</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {(Object.keys(mapping) as (keyof ColumnMapping)[]).filter(k => mapping[k]).map(field => (
                  <div key={field} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-400">{FIELD_LABELS[field].replace(' *','').replace(' (optional)','')}</span>
                    <span className="text-gray-200">←</span>
                    <span className="font-medium text-gray-700 truncate">{mapping[field]}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                ⚠️ Duplicate contacts (matching phone or email in existing leads or portal accounts) will be skipped automatically.
                All imported leads default to status <strong>New</strong> for staff triage.
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} disabled={importing}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                ← Back
              </button>
              <button onClick={doImport} disabled={importing}
                className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                  : <>Import {parseResult.totalRows.toLocaleString()} rows</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Results ── */}
        {step === 5 && importResult && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-[#0B1F3A]">Import complete</h2>
              <p className="text-gray-500 text-sm mt-1">Batch ID: <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{importResult.importBatchId}</code></p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-2xl p-4">
                <p className="text-3xl font-bold text-green-700">{importResult.imported.toLocaleString()}</p>
                <p className="text-xs text-green-600 font-medium mt-1">Imported</p>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4">
                <p className="text-3xl font-bold text-amber-600">{importResult.skippedDuplicates.toLocaleString()}</p>
                <p className="text-xs text-amber-600 font-medium mt-1">Duplicates skipped</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-3xl font-bold text-gray-500">{importResult.skippedInvalid.toLocaleString()}</p>
                <p className="text-xs text-gray-500 font-medium mt-1">Invalid rows skipped</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="text-left bg-red-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-600 mb-2">First {importResult.errors.length} skipped rows:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-500">Row {e.row}: {e.reason}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href={`/admin/leads?importBatchId=${importResult.importBatchId}`}
                className="flex-1 py-3 bg-[#0B1F3A] text-[#C9A84C] font-bold rounded-xl hover:bg-[#0d2548] transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" /> View imported leads
              </Link>
              <button
                onClick={() => { setStep(1); setFile(null); setParseResult(null); setMapping({ ...EMPTY_MAPPING }); setImportResult(null) }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Import another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
