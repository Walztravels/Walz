'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Plus, Send, Eye, EyeOff, X, Download,
} from 'lucide-react'
import Link from 'next/link'

const STAGES = [
  { key: 'ENQUIRY',            label: 'Enquiry Received',     emoji: '📋', color: 'bg-gray-100 text-gray-600' },
  { key: 'DOCUMENTS_PENDING',  label: 'Documents Pending',    emoji: '📄', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'DOCUMENTS_RECEIVED', label: 'Documents Received',   emoji: '✅', color: 'bg-blue-100 text-blue-700' },
  { key: 'PROCESSING',         label: 'Processing',           emoji: '🔄', color: 'bg-purple-100 text-purple-700' },
  { key: 'SUBMITTED',          label: 'Submitted to Embassy', emoji: '📮', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'AWAITING_DECISION',  label: 'Awaiting Decision',    emoji: '⏳', color: 'bg-orange-100 text-orange-700' },
  { key: 'APPROVED',           label: 'Visa Approved',        emoji: '🎉', color: 'bg-green-100 text-green-700' },
  { key: 'REJECTED',           label: 'Application Refused',  emoji: '❌', color: 'bg-red-100 text-red-700' },
  { key: 'COMPLETED',          label: 'Completed',            emoji: '✨', color: 'bg-gray-100 text-gray-600' },
]

const DEFAULT_MESSAGES: Record<string, string> = {
  ENQUIRY:            'We have received your visa application enquiry. Our team will review it and be in touch shortly.',
  DOCUMENTS_PENDING:  'We need some additional documents to process your application. Please check the list below and submit them as soon as possible.',
  DOCUMENTS_RECEIVED: 'We have received all your required documents. Your application is now being prepared.',
  PROCESSING:         'Your visa application is currently being processed by our team. We will update you as soon as there is any progress.',
  SUBMITTED:          'Your visa application has been officially submitted to the embassy. The embassy will review your application and contact us with their decision.',
  AWAITING_DECISION:  'Your application is currently with the embassy awaiting their decision. Processing times vary — we will notify you as soon as we hear back.',
  APPROVED:           '🎉 Congratulations! Your visa application has been approved. Please see the details below.',
  REJECTED:           'Unfortunately, your visa application has been refused. Please do not be discouraged — we will review the refusal reasons and advise on next steps.',
  COMPLETED:          'Your visa journey is complete. Thank you for trusting Walz Travels with your application.',
}

interface Update {
  id: string; createdAt: string; type: string; title: string; message: string
  adminName: string; newStatus?: string; emailSent: boolean
  documentName?: string; documentUrl?: string; isClientVisible: boolean
}

interface Application {
  id: string; title: string; destination?: string; type: string; stage: string
  trackingToken?: string; refNumber: string
  walzFee?: number; walzCurrency?: string
  user: { name?: string; email?: string }
  updates: Update[]
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [app,       setApp]       = useState<Application | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState<string | null>(null)

  const [updateType,       setUpdateType]       = useState('STATUS_UPDATE')
  const [newStage,         setNewStage]         = useState('')
  const [title,            setTitle]            = useState('')
  const [message,          setMessage]          = useState('')
  const [sendEmail,        setSendEmail]        = useState(true)
  const [isClientVisible,  setIsClientVisible]  = useState(true)
  const [docName,          setDocName]          = useState('')
  const [docUrl,           setDocUrl]           = useState('')
  const [docType,          setDocType]          = useState('OTHER')
  const [uploading,        setUploading]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function load() {
    const r = await fetch(`/api/admin/portal/applications/${id}`)
    const d = await r.json()
    setApp(d.application)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  function handleStageChange(stage: string) {
    setNewStage(stage)
    const s = STAGES.find(s => s.key === stage)
    if (s) { setTitle(`${s.emoji} ${s.label}`); setMessage(DEFAULT_MESSAGES[stage] ?? '') }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('applicationId', id)
    const r = await fetch('/api/admin/portal/applications/upload', { method: 'POST', body: fd })
    const d = await r.json()
    if (d.url) { setDocUrl(d.url); setDocName(file.name) }
    setUploading(false)
  }

  async function submitUpdate() {
    if (!title || !message) return
    setSaving(true)
    const res = await fetch(`/api/admin/portal/applications/${id}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:            updateType,
        newStatus:       newStage || undefined,
        title,
        message,
        sendEmail,
        isClientVisible,
        documentName:    docName || undefined,
        documentUrl:     docUrl  || undefined,
        documentType:    docUrl ? docType : undefined,
      }),
    })
    const d = await res.json()
    setSaving(false)
    setShowModal(false)
    setTitle(''); setMessage(''); setNewStage('')
    setDocName(''); setDocUrl(''); setSendEmail(true); setIsClientVisible(true)
    showToast(d.emailSent ? 'Update saved + email sent' : 'Update saved')
    load()
  }

  function resetModal() {
    setShowModal(false); setTitle(''); setMessage(''); setNewStage('')
    setDocName(''); setDocUrl(''); setUpdateType('STATUS_UPDATE')
    setSendEmail(true); setIsClientVisible(true)
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>
  if (!app)    return <div className="p-6 text-gray-400 text-sm">Application not found.</div>

  const stageIdx    = STAGES.findIndex(s => s.key === app.stage)
  const currentStage = STAGES[stageIdx]
  const trackingUrl  = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/visa/track/${app.trackingToken ?? app.id}`

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B1F3A] text-white px-4 py-3 rounded-xl shadow-xl text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/portal" className="text-gray-400 hover:text-[#0B1F3A] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#0B1F3A] truncate">
            {app.user.name || app.user.email}
          </h1>
          <p className="text-gray-400 text-sm">
            {app.destination ?? app.title} · {app.refNumber}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a href={trackingUrl} target="_blank" rel="noreferrer"
            className="text-xs text-[#C9A84C] hover:underline flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> Client view
          </a>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b45f]">
            <Plus className="w-4 h-4" /> Add Update
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[#0B1F3A]">Application Status</h2>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${currentStage?.color ?? 'bg-gray-100 text-gray-600'}`}>
            {currentStage?.emoji} {currentStage?.label ?? app.stage}
          </span>
        </div>
        <div className="flex items-center">
          {STAGES.slice(0, 7).map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-bold
                ${i < stageIdx  ? 'bg-[#C9A84C] text-[#0B1F3A]'
                : i === stageIdx ? 'bg-[#0B1F3A] text-white'
                :                  'bg-gray-100 text-gray-400'}`}>
                {i < stageIdx ? '✓' : i + 1}
              </div>
              {i < 6 && <div className={`h-0.5 flex-1 ${i < stageIdx ? 'bg-[#C9A84C]' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {STAGES.slice(0, 7).map((s, i) => (
            <p key={s.key} className={`text-[9px] text-center flex-1 last:flex-none leading-tight
              ${i === stageIdx ? 'text-[#0B1F3A] font-semibold' : 'text-gray-300'}`}>
              {s.label.split(' ')[0]}
            </p>
          ))}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Client',      value: app.user.name ?? '—' },
          { label: 'Email',       value: app.user.email ?? '—' },
          { label: 'Destination', value: app.destination ?? app.title },
          { label: 'Type',        value: app.type },
          { label: 'Walz Fee',    value: app.walzFee ? `${app.walzCurrency ?? 'GBP'} ${Number(app.walzFee).toLocaleString()}` : '—' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-[#0B1F3A] truncate">{item.value}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Tracking Link</p>
          <button onClick={() => { navigator.clipboard.writeText(trackingUrl); showToast('Link copied!') }}
            className="text-sm text-[#C9A84C] hover:underline font-medium">
            Copy link
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="font-semibold text-[#0B1F3A] mb-5">
          Progress Timeline
          <span className="ml-2 text-gray-400 font-normal text-sm">({app.updates.length})</span>
        </h2>

        {app.updates.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            No updates yet — click &ldquo;Add Update&rdquo; to start the progress tracker.
          </div>
        )}

        <div className="space-y-6">
          {[...app.updates].reverse().map((u, i) => (
            <div key={u.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0
                  ${u.newStatus === 'APPROVED' ? 'bg-green-50'
                  : u.newStatus === 'REJECTED' ? 'bg-red-50'
                  : u.type === 'DOCUMENT'       ? 'bg-blue-50'
                  : 'bg-gray-50'}`}>
                  {u.type === 'DOCUMENT' ? '📎'
                   : u.newStatus ? (STAGES.find(s => s.key === u.newStatus)?.emoji ?? '🔄')
                   : '💬'}
                </div>
                {i < app.updates.length - 1 && <div className="w-0.5 flex-1 bg-gray-100 mt-2" />}
              </div>
              <div className="flex-1 pb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[#0B1F3A] text-sm">{u.title}</p>
                  {!u.isClientVisible && (
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <EyeOff className="w-2.5 h-2.5" /> Internal
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {u.adminName} · {new Date(u.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                  {u.emailSent && <span className="ml-2 text-green-500">✓ emailed</span>}
                </p>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{u.message}</p>
                {u.documentUrl && (
                  <a href={u.documentUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-xs text-[#C9A84C] bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-100">
                    <Download className="w-3.5 h-3.5" />
                    {u.documentName ?? 'Download document'}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A] text-lg">Add Progress Update</h2>
              <button onClick={resetModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Type tabs */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'STATUS_UPDATE', label: '🔄 Status',   desc: 'Change status' },
                  { key: 'NOTE',          label: '💬 Note',     desc: 'Message only' },
                  { key: 'DOCUMENT',      label: '📎 Document', desc: 'Send a file' },
                ].map(t => (
                  <button key={t.key} onClick={() => setUpdateType(t.key)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      updateType === t.key ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{t.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>

              {/* Stage selector */}
              {updateType === 'STATUS_UPDATE' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">New Stage *</label>
                  <select value={newStage} onChange={e => handleStageChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white">
                    <option value="">Select new stage…</option>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title (shown to client) *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. ✅ Documents Received"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Message *</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                  placeholder="Explain what's happening with their application…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] resize-none" />
              </div>

              {/* Document upload */}
              {(updateType === 'DOCUMENT') && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-500">Document</label>
                  <div className="flex gap-2">
                    <select value={docType} onChange={e => setDocType(e.target.value)}
                      className="w-44 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#C9A84C] bg-white">
                      <option value="EMBASSY_FORM">Embassy Form</option>
                      <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                      <option value="VISA_COPY">Visa Copy</option>
                      <option value="CHECKLIST">Document Checklist</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input type="file" ref={fileRef} className="hidden" onChange={handleFileUpload} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="flex-1 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors py-2 disabled:opacity-50">
                      {uploading ? 'Uploading…' : docName ? `✓ ${docName}` : '+ Upload file'}
                    </button>
                  </div>
                  <input value={docUrl} onChange={e => setDocUrl(e.target.value)}
                    placeholder="Or paste URL (Google Drive, Dropbox, etc.)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#C9A84C]" />
                </div>
              )}

              <div className="flex items-center gap-5 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="accent-[#C9A84C]" />
                  Email client
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!isClientVisible} onChange={e => setIsClientVisible(!e.target.checked)} className="accent-gray-400" />
                  Internal only
                </label>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={resetModal}
                className="flex-1 border border-gray-200 py-3 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={submitUpdate} disabled={saving || !title || !message}
                className="flex-1 bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl text-sm hover:bg-[#d4b45f] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? 'Saving…' : <><Send className="w-4 h-4" />{sendEmail ? 'Send + Email' : 'Save Update'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
