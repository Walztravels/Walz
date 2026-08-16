'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react'
import { TAGS } from '@/lib/marketing-tags'

interface Props {
  params: { token: string }
}

type Step = 'idle' | 'uploading' | 'done' | 'error' | 'invalid'

export default function DesignUploadPage({ params }: Props) {
  const { token } = params

  const [step,      setStep]      = useState<Step>('idle')
  const [label,     setLabel]     = useState('')
  const [tag,       setTag]       = useState('general')
  const [dragOver,  setDragOver]  = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const [preview,   setPreview]   = useState<string | null>(null)
  const [file,      setFile]      = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/upload/design/${token}`)
      .then(r => r.json())
      .then((d: { label?: string; error?: string }) => {
        if (d.error) { setStep('invalid'); setErrMsg(d.error) }
        else setLabel(d.label ?? 'Design uploads')
      })
      .catch(() => { setStep('invalid'); setErrMsg('Could not reach server.') })
  }, [token])

  function selectFile(f: File) {
    if (!f.type.startsWith('image/')) {
      setErrMsg('Only JPG, PNG, and WebP images are accepted.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrMsg('File is too large (max 20 MB).')
      return
    }
    setErrMsg('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) selectFile(f)
  }

  async function upload() {
    if (!file) return
    setStep('uploading')
    setErrMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tag',  tag)
      const res  = await fetch(`/api/upload/design/${token}/confirm`, { method: 'POST', body: fd })
      const data = await res.json() as { media?: { id: string }; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Upload failed')
      setStep('done')
    } catch (e) {
      setStep('error')
      setErrMsg(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  function reset() {
    setFile(null); setPreview(null); setErrMsg(''); setStep('idle')
  }

  // ── Invalid / deactivated ──────────────────────────────────────────────────
  if (step === 'invalid') {
    return (
      <Shell>
        <div className="text-center py-8">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <p className="text-gray-800 font-semibold">Upload link not available</p>
          <p className="text-gray-500 text-sm mt-1">{errMsg}</p>
        </div>
      </Shell>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Shell label={label}>
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">Upload received!</p>
          <p className="text-gray-500 text-sm mt-1">The Walz Travels team has been notified.</p>
          <button
            onClick={reset}
            className="mt-6 px-5 py-2 text-sm font-semibold bg-[#0B1F3A] text-white rounded-xl hover:bg-[#1a3358] transition"
          >
            Upload another
          </button>
        </div>
      </Shell>
    )
  }

  // ── Main upload UI ────────────────────────────────────────────────────────
  return (
    <Shell label={label}>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !file && fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl transition-colors cursor-pointer
          ${file ? 'border-[#C9A84C] bg-amber-50' : dragOver
            ? 'border-[#C9A84C] bg-amber-50'
            : 'border-gray-200 bg-gray-50 hover:border-[#C9A84C] hover:bg-amber-50'
          } ${file ? 'cursor-default' : ''}`}
        style={{ minHeight: 200 }}
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="w-full rounded-2xl object-contain max-h-64"
            />
            <button
              onClick={e => { e.stopPropagation(); reset() }}
              className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-1 shadow hover:bg-white transition"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
            <div className="absolute bottom-2 left-2 right-2 text-xs text-gray-600 bg-white/80 backdrop-blur rounded-lg px-2 py-1 truncate">
              {file?.name}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="w-12 h-12 bg-[#0B1F3A]/8 rounded-2xl flex items-center justify-center">
              <Upload className="w-6 h-6 text-[#0B1F3A]" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Drop your image here</p>
              <p className="text-gray-400 text-sm mt-0.5">or click to browse</p>
            </div>
            <p className="text-gray-400 text-xs">JPG · PNG · WebP · max 20 MB</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }}
        />
      </div>

      {/* Tag picker */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Category <span className="normal-case font-normal text-gray-400">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {TAGS.map(t => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${tag === t
                  ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#0B1F3A] hover:text-[#0B1F3A]'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {errMsg && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errMsg}
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={upload}
        disabled={!file || step === 'uploading'}
        className="w-full py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl hover:bg-[#1a3358] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {step === 'uploading' ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload image
          </>
        )}
      </button>

    </Shell>
  )
}

function Shell({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo + header */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.walztravels.com/walz-logo.png"
            alt="Walz Travels"
            className="w-12 h-12 rounded-xl mx-auto mb-3 object-cover"
          />
          <h1 className="text-xl font-bold text-[#0B1F3A]">{label || 'Upload creative asset'}</h1>
          <p className="text-gray-400 text-sm mt-1">Walz Travels · Media Library</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}
