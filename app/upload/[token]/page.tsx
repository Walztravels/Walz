'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Upload, CheckCircle, AlertCircle, FileText,
  Clock, Loader2, X, CloudUpload,
} from 'lucide-react'

interface RequestedDoc {
  name:         string
  description?: string
  required?:    boolean
  category?:    string
}

interface UploadRecord {
  id:         string
  docName:    string
  fileName:   string
  fileSize:   number | null
  uploadedAt: string
  status:     string
}

interface RequestData {
  clientName:    string
  clientEmail:   string
  requestedDocs: RequestedDoc[]
  message:       string | null
  deadline:      string | null
  expiresAt:     string
  status:        string
  uploads:       UploadRecord[]
}

export default function ClientUploadPage() {
  const { token }              = useParams() as { token: string }
  const [data, setData]        = useState<RequestData | null>(null)
  const [pageError, setPageError] = useState('')
  const [loading, setLoading]  = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploaded, setUploaded]   = useState<Set<string>>(new Set())
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function load() {
    const res = await fetch(`/api/upload/${token}`)
    const d   = await res.json()
    if (d.error) {
      setPageError(d.error)
    } else {
      setData(d)
      setUploaded(new Set(d.uploads.map((u: UploadRecord) => u.docName)))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function handleUpload(doc: RequestedDoc, file: File) {
    setUploading(doc.name)
    try {
      const form = new FormData()
      form.append('file',     file)
      form.append('docName',  doc.name)
      form.append('category', doc.category ?? 'General')

      const res    = await fetch(`/api/upload/${token}`, { method: 'POST', body: form })
      const result = await res.json()

      if (res.ok) {
        setUploaded(prev => new Set([...prev, doc.name]))
        await load()
      } else {
        alert(result.error ?? 'Upload failed. Please try again.')
      }
    } catch {
      alert('Upload failed. Please check your connection and try again.')
    }
    setUploading(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )

  if (pageError) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[#0B1F3A] mb-2">Upload Link Unavailable</h2>
        <p className="text-gray-500 text-sm mb-6">{pageError}</p>
        <a href="https://wa.me/447398753797"
          className="bg-green-500 text-white font-bold px-6 py-3 rounded-xl text-sm inline-block hover:bg-green-600 transition-colors">
          Contact Walz Travels on WhatsApp
        </a>
      </div>
    </div>
  )

  if (!data) return null

  const requiredDocs = data.requestedDocs.filter(d => d.required !== false)
  const allDone      = requiredDocs.every(d => uploaded.has(d.name))

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/walz-logo.svg" alt="Walz Travels" className="h-7 w-auto brightness-0 invert" />
          <div className="w-px h-6 bg-white/20" />
          <p className="text-white/60 text-sm font-medium">Document Upload Portal</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">

        {/* Greeting card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h1 className="text-xl font-bold text-[#0B1F3A] mb-1">Hi {data.clientName} 👋</h1>
          <p className="text-gray-500 text-sm">
            Your Walz Travels visa team needs you to upload the documents listed below.
            No login required — just choose each file and upload.
          </p>

          {data.message && (
            <div className="mt-3 bg-[#F5F0E8] rounded-xl p-3 border-l-4 border-[#C9A84C]">
              <p className="text-[#0B1F3A] text-sm">{data.message}</p>
            </div>
          )}

          {data.deadline && (
            <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm font-medium">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Deadline: <strong>
                {new Date(data.deadline).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </strong></span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploaded.size} of {data.requestedDocs.length} document(s) uploaded</span>
          </div>
        </div>

        {/* All complete banner */}
        {allDone && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-800">All required documents received!</p>
              <p className="text-green-700 text-sm">
                Your visa team has been notified and will review your documents shortly.
              </p>
            </div>
          </div>
        )}

        {/* Document cards */}
        {data.requestedDocs.map((doc, i) => {
          const isDone      = uploaded.has(doc.name)
          const isUploading = uploading === doc.name
          const prevUpload  = data.uploads.find(u => u.docName === doc.name)

          return (
            <div key={i} className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all ${
              isDone ? 'border-green-200' : 'border-transparent'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                    <span className="font-bold text-[#0B1F3A] text-sm">{doc.name}</span>
                    {doc.required !== false
                      ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">Required</span>
                      : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Optional</span>
                    }
                  </div>
                  {doc.description && (
                    <p className="text-gray-400 text-xs mt-1.5 ml-6">{doc.description}</p>
                  )}
                </div>
                {isDone && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />}
              </div>

              {isDone ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-green-700 text-xs font-semibold truncate">
                      {prevUpload?.fileName ?? 'File received'}
                    </p>
                    {prevUpload?.fileSize && (
                      <p className="text-green-600 text-[10px]">
                        {(prevUpload.fileSize / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setUploaded(prev => { const n = new Set(prev); n.delete(doc.name); return n })}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Upload a different file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={el => { fileRefs.current[doc.name] = el }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(doc, file)
                      // reset so same file can be re-picked if needed
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => fileRefs.current[doc.name]?.click()}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] hover:bg-[#162d52] text-white text-sm font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isUploading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                      : <><CloudUpload className="w-4 h-4" /> Choose File to Upload</>
                    }
                  </button>
                  <p className="text-gray-400 text-xs text-center mt-1.5">
                    PDF, JPG, PNG, HEIC, Word — max 10 MB
                  </p>
                </div>
              )}
            </div>
          )
        })}

        {/* Help footer */}
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
          <p className="text-gray-400 text-sm mb-2">Having trouble uploading?</p>
          <a href="https://wa.me/447398753797"
            className="text-[#C9A84C] font-semibold text-sm hover:underline">
            💬 WhatsApp us: +44 7398 753797
          </a>
          <p className="text-gray-300 text-xs mt-2">
            Link expires {new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}
