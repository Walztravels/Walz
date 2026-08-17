'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react'
import { TAGS } from '@/lib/marketing-tags'

interface Props {
  params: { token: string }
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

type FileEntry = {
  file:    File
  preview: string
  status:  FileStatus
  error?:  string
}

type PageStep = 'idle' | 'uploading' | 'done' | 'invalid'

export default function DesignUploadPage({ params }: Props) {
  const { token } = params

  const [pageStep, setPageStep] = useState<PageStep>('idle')
  const [label,    setLabel]    = useState('')
  const [tag,      setTag]      = useState('general')
  const [dragOver, setDragOver] = useState(false)
  const [errMsg,   setErrMsg]   = useState('')
  const [files,    setFiles]    = useState<FileEntry[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/upload/design/${token}`)
      .then(r => r.json())
      .then((d: { label?: string; error?: string }) => {
        if (d.error) { setPageStep('invalid'); setErrMsg(d.error) }
        else setLabel(d.label ?? 'Design uploads')
      })
      .catch(() => { setPageStep('invalid'); setErrMsg('Could not reach server.') })
  }, [token])

  function addFiles(incoming: FileList | File[]) {
    const arr     = Array.from(incoming)
    const entries = arr
      .filter(f => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024)
      .map<FileEntry>(f => ({ file: f, preview: URL.createObjectURL(f), status: 'pending' }))
    const skipped = arr.length - entries.length
    if (skipped > 0) setErrMsg(`${skipped} file(s) skipped — only JPG/PNG/WebP under 20 MB allowed.`)
    else setErrMsg('')
    setFiles(prev => [...prev, ...entries])
  }

  function removeFile(idx: number) {
    setFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  async function uploadAll() {
    if (files.length === 0) return
    setPageStep('uploading')
    setErrMsg('')

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'done') continue
      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))
      try {
        const fd = new FormData()
        fd.append('file', files[i].file)
        fd.append('tag',  tag)
        const res  = await fetch(`/api/upload/design/${token}/confirm`, { method: 'POST', body: fd })
        const data = await res.json() as { media?: { id: string }; error?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? 'Upload failed')
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f))
      } catch (e) {
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: e instanceof Error ? e.message : 'Failed' } : f
        ))
      }
    }

    setPageStep('done')
  }

  function reset() {
    files.forEach(f => URL.revokeObjectURL(f.preview))
    setFiles([])
    setErrMsg('')
    setPageStep('idle')
  }

  // ── Invalid ────────────────────────────────────────────────────────────────
  if (pageStep === 'invalid') {
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

  const doneCount  = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length
  const allDone    = pageStep === 'done'

  return (
    <Shell label={label}>

      {/* Done banner */}
      {allDone && doneCount > 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">
              {doneCount} image{doneCount !== 1 ? 's' : ''} uploaded
            </p>
            {errorCount > 0 && (
              <p className="text-xs text-red-600 mt-0.5">{errorCount} failed — see below</p>
            )}
          </div>
          <button
            onClick={reset}
            className="shrink-0 text-xs font-semibold text-green-700 underline underline-offset-2 hover:text-green-900 transition"
          >
            Upload more
          </button>
        </div>
      )}

      {/* Drop zone */}
      {pageStep !== 'done' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 p-8 text-center
            ${dragOver
              ? 'border-[#C9A84C] bg-amber-50'
              : 'border-gray-200 bg-gray-50 hover:border-[#C9A84C] hover:bg-amber-50'
            }`}
        >
          <div className="w-11 h-11 bg-[#0B1F3A]/8 rounded-2xl flex items-center justify-center">
            <Upload className="w-5 h-5 text-[#0B1F3A]" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">Drop images here</p>
            <p className="text-gray-400 text-sm mt-0.5">or click to browse — select multiple</p>
          </div>
          <p className="text-gray-400 text-xs">JPG · PNG · WebP · max 20 MB each</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition
                ${entry.status === 'done'      ? 'border-green-200 bg-green-50'
                : entry.status === 'error'     ? 'border-red-200 bg-red-50'
                : entry.status === 'uploading' ? 'border-amber-200 bg-amber-50'
                :                               'border-gray-200 bg-white'
                }`}
            >
              {/* Thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.preview}
                alt={entry.file.name}
                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100"
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{entry.file.name}</p>
                <p className="text-xs text-gray-400">{(entry.file.size / 1024).toFixed(0)} KB</p>
                {entry.status === 'error' && entry.error && (
                  <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                )}
              </div>

              {/* Status icon / remove */}
              <div className="shrink-0">
                {entry.status === 'uploading' && (
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                )}
                {entry.status === 'done' && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                {entry.status === 'error' && (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
                {entry.status === 'pending' && (
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-gray-300 hover:text-gray-500 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tag picker */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Category <span className="normal-case font-normal text-gray-400">(applies to all)</span>
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
      {pageStep !== 'done' && (
        <button
          onClick={uploadAll}
          disabled={files.filter(f => f.status === 'pending').length === 0 || pageStep === 'uploading'}
          className="w-full py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl hover:bg-[#1a3358] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {pageStep === 'uploading' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading {files.filter(f => f.status === 'done').length + 1} of {files.length}…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {files.filter(f => f.status === 'pending').length > 0
                ? `Upload ${files.filter(f => f.status === 'pending').length} image${files.filter(f => f.status === 'pending').length !== 1 ? 's' : ''}`
                : 'Upload images'
              }
            </>
          )}
        </button>
      )}

    </Shell>
  )
}

function Shell({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.walztravels.com/walz-logo.png"
            alt="Walz Travels"
            className="w-12 h-12 rounded-xl mx-auto mb-3 object-cover"
          />
          <h1 className="text-xl font-bold text-[#0B1F3A]">{label || 'Upload creative assets'}</h1>
          <p className="text-gray-400 text-sm mt-1">Walz Travels · Media Library</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}
