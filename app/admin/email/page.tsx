'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Mail, Send, Edit3, Clock, Inbox, FolderOpen,
  Hotel, Users, Map, FileText, Settings, ChevronDown,
  X, Plus, RefreshCw, Loader2, CheckCircle, AlertCircle,
  Sparkles, Eye, Reply, Paperclip, Trash2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  name?:  string
  email:  string
  type?:  string
}

interface Thread {
  id:           string
  subject:      string
  category:     string
  status:       string
  lastEmailAt:  string
  participants: Participant[]
  refType?:     string
  refId?:       string
  _count?:      { messages: number }
  messages?:    Message[]
}

interface Message {
  id:          string
  direction:   string
  from:        string
  fromName?:   string
  to:          string[]
  subject:     string
  bodyText:    string
  bodyHtml:    string
  sentAt:      string | null
  receivedAt:  string | null
  readAt:      string | null
  openCount:   number
  status:      string
}

interface ContactSuggestion {
  id:    string
  name:  string
  email: string
  type:  string
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Array<{ id: string; label: string; category: string; subject: string; body: string }> = [
  {
    id: 'hotel-booking-request',
    label: 'Hotel Booking Request',
    category: 'hotel',
    subject: 'Booking Request – [Guest Name] | [Check-in Date]',
    body: `Dear [Hotel Name] Reservations Team,

I hope this message finds you well. I am writing on behalf of Walz Travels to request availability for the following booking:

Guest Name: [Full Name]
Check-in Date: [Date]
Check-out Date: [Date]
Room Type: [Room Type]
Number of Guests: [Adults] Adults / [Children] Children
Special Requests: [Any special requirements]

Could you please confirm availability and provide your best rate? We would also appreciate knowing your cancellation policy.

We look forward to your prompt response.

Kind regards,`,
  },
  {
    id: 'hotel-rate-inquiry',
    label: 'Hotel Rate Inquiry',
    category: 'hotel',
    subject: 'Rate Inquiry – [Month/Season] | Walz Travels',
    body: `Dear [Hotel Name] Team,

I am reaching out from Walz Travels to enquire about your current rates for the upcoming [month/season].

We regularly send guests to your property and would like to discuss:
• Contract rates / corporate rates for regular bookings
• Group rates for [group size] persons
• Availability for the period [date range]
• Any current promotions or packages

Please share your rate sheet at your earliest convenience.

Best regards,`,
  },
  {
    id: 'client-welcome',
    label: 'Client Welcome',
    category: 'client',
    subject: 'Welcome to Walz Travels – Your Journey Begins Here',
    body: `Dear [Client Name],

Thank you for choosing Walz Travels! We are thrilled to be your travel partner.

Your booking reference is: [Booking Reference]

Here is a summary of your upcoming trip:
• Destination: [Destination]
• Travel Dates: [Start Date] – [End Date]
• Travellers: [Number of Travellers]

What happens next:
1. We will send your full itinerary within 24 hours
2. Our team will reach out to confirm all arrangements
3. You will receive your travel documents 72 hours before departure

If you have any questions at all, please do not hesitate to contact us. We are here to make your experience seamless.

Warm regards,`,
  },
  {
    id: 'client-followup',
    label: 'Client Follow-up',
    category: 'client',
    subject: 'Following Up on Your Travel Enquiry – Walz Travels',
    body: `Dear [Client Name],

I hope you are doing well. I wanted to follow up on the travel enquiry you submitted for [Destination].

We have put together some options based on your requirements and would love to walk you through them.

Could you spare 15–20 minutes for a quick call this week? Alternatively, I can send across the proposals by email if that is more convenient.

We are committed to finding you the best experience within your budget.

Looking forward to hearing from you.

Best regards,`,
  },
  {
    id: 'visa-update',
    label: 'Visa Status Update',
    category: 'visa',
    subject: 'Visa Application Update – [Client Name] | Walz Travels',
    body: `Dear [Client Name],

I am writing to update you on the status of your visa application.

Application Reference: [Visa Reference]
Destination Country: [Country]
Application Date: [Date]
Current Status: [Status]

[Add specific update details here]

Expected processing time: [Timeline]

Please note that you may be required to:
• [Requirement 1 if any]
• [Requirement 2 if any]

We will continue to monitor your application and update you promptly on any developments. Should you have any questions, please feel free to reach out.

Kind regards,`,
  },
  {
    id: 'payment-confirmation',
    label: 'Payment Confirmation',
    category: 'client',
    subject: 'Payment Received – Booking Confirmed | Walz Travels',
    body: `Dear [Client Name],

Thank you! We have successfully received your payment.

Booking Reference: [Reference]
Amount Paid: [Amount]
Payment Date: [Date]
Payment Method: [Method]

Your booking is now fully confirmed. Here are the next steps:
1. You will receive your detailed itinerary within 24 hours
2. Hotel and flight confirmations will be shared separately
3. All travel documents will be sent 72 hours before departure

Please keep this email for your records.

If you have any questions, we are always happy to help.

Warm regards,`,
  },
  {
    id: 'tour-confirmation',
    label: 'Tour Confirmation',
    category: 'tours',
    subject: 'Tour Confirmation – [Tour Name] | Walz Travels',
    body: `Dear [Client Name],

We are pleased to confirm your tour booking with Walz Travels.

Tour: [Tour Name]
Date: [Date]
Duration: [Duration]
Pick-up Location: [Location]
Pick-up Time: [Time]
Group Size: [Number]

What to bring:
• Valid ID / Passport
• Comfortable clothing and shoes
• [Any specific items]

Important notes:
• Please arrive 15 minutes before the scheduled pick-up time
• [Any other notes]

We cannot wait to give you an unforgettable experience!

Best regards,`,
  },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const FOLDERS = [
  { id: 'inbox',  label: 'Inbox',      icon: Inbox     },
  { id: 'sent',   label: 'Sent',       icon: Send      },
  { id: 'drafts', label: 'Drafts',     icon: Edit3     },
  { id: 'scheduled', label: 'Scheduled', icon: Clock   },
]

const CATEGORIES = [
  { id: 'hotel',  label: 'Hotels',   icon: Hotel     },
  { id: 'client', label: 'Clients',  icon: Users     },
  { id: 'tours',  label: 'Tours',    icon: Map       },
  { id: 'visa',   label: 'Visa',     icon: FileText  },
  { id: 'admin',  label: 'Admin',    icon: Settings  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d     = new Date(dateStr)
  const now   = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH  = diffMs / 3_600_000
  const diffD  = diffMs / 86_400_000

  if (diffH < 1)  return `${Math.round(diffMs / 60_000)}m ago`
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  if (diffD < 2)  return 'Yesterday'
  if (diffD < 7)  return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmailHubPage() {
  // Threads & selection
  const [threads,          setThreads]          = useState<Thread[]>([])
  const [loading,          setLoading]          = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadMessages,   setThreadMessages]   = useState<Message[]>([])
  const [threadLoading,    setThreadLoading]    = useState(false)

  // Folder / category navigation
  const [activeFolder, setActiveFolder] = useState('inbox')

  // Compose state
  const [composing, setComposing] = useState(false)
  const [compose, setCompose] = useState({
    to:        [] as string[],
    toInput:   '',
    cc:        '',
    bcc:       '',
    subject:   '',
    body:      '',
    category:  'sent',
    refType:   '',
    refId:     '',
    showCc:    false,
  })
  const [showTemplates, setShowTemplates] = useState(false)

  // Jade AI
  const [jading,     setJading]     = useState(false)
  const [jadePrompt, setJadePrompt] = useState('')

  // UI feedback
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Contact autocomplete
  const [contactSuggestions,  setContactSuggestions]  = useState<ContactSuggestion[]>([])
  const [searchingContacts,   setSearchingContacts]   = useState(false)
  const [showSuggestions,     setShowSuggestions]     = useState(false)
  const contactDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Attachments
  interface AttachmentFile { filename: string; content: string; sizeKb: number }
  const [attachments,    setAttachments]    = useState<AttachmentFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reply
  const [replyBody, setReplyBody] = useState('')
  const [replying,  setReplying]  = useState(false)

  // Search
  const [search, setSearch] = useState('')

  // ── Load threads ────────────────────────────────────────────────────────────

  const loadThreads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        category: activeFolder,
        status:   'open',
      })
      if (search) params.set('search', search)
      const res  = await fetch(`/api/admin/email/threads?${params}`)
      const data = await res.json()
      setThreads(data.threads ?? [])
    } catch {
      setError('Failed to load threads')
    } finally {
      setLoading(false)
    }
  }, [activeFolder, search])

  useEffect(() => { loadThreads() }, [loadThreads])

  // ── Load thread messages ────────────────────────────────────────────────────

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true)
    try {
      const res  = await fetch(`/api/admin/email/threads/${id}`)
      const data = await res.json()
      setThreadMessages(data.thread?.messages ?? [])
    } catch {
      setError('Failed to load thread')
    } finally {
      setThreadLoading(false)
    }
  }, [])

  const selectThread = useCallback((id: string) => {
    setSelectedThreadId(id)
    setComposing(false)
    setReplyBody('')
    loadThread(id)
  }, [loadThread])

  // ── Contact autocomplete ────────────────────────────────────────────────────

  const searchContacts = useCallback((q: string) => {
    if (contactDebounce.current) clearTimeout(contactDebounce.current)
    if (!q.trim()) { setContactSuggestions([]); setShowSuggestions(false); return }

    contactDebounce.current = setTimeout(async () => {
      setSearchingContacts(true)
      try {
        const res  = await fetch(`/api/admin/email/contacts?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setContactSuggestions(data.contacts ?? [])
        setShowSuggestions(true)
      } catch { /* silent */ } finally {
        setSearchingContacts(false)
      }
    }, 300)
  }, [])

  const addToEmail = (email: string, name?: string) => {
    if (!compose.to.includes(email)) {
      setCompose(c => ({ ...c, to: [...c.to, email], toInput: '' }))
    } else {
      setCompose(c => ({ ...c, toInput: '' }))
    }
    setContactSuggestions([])
    setShowSuggestions(false)
  }

  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && compose.toInput.includes('@')) {
      e.preventDefault()
      addToEmail(compose.toInput.trim())
    }
    if (e.key === 'Backspace' && !compose.toInput && compose.to.length > 0) {
      setCompose(c => ({ ...c, to: c.to.slice(0, -1) }))
    }
  }

  // ── Jade AI compose ─────────────────────────────────────────────────────────

  const generateWithJade = async () => {
    if (!jadePrompt.trim()) return
    setJading(true)
    setError('')
    try {
      const res  = await fetch('/api/admin/email/jade', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recipientName:  compose.to[0]?.split('@')[0] ?? 'Client',
          recipientEmail: compose.to[0] ?? '',
          purpose:        jadePrompt,
          context:        compose.body || undefined,
          refType:        compose.refType || undefined,
          refId:          compose.refId   || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Jade failed')
      setCompose(c => ({ ...c, subject: data.subject, body: data.body }))
      setJadePrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jade failed')
    } finally {
      setJading(false)
    }
  }

  // ── Jade AI reply ───────────────────────────────────────────────────────────

  const generateReplyWithJade = async () => {
    if (!selectedThreadId) return
    const thread = threads.find(t => t.id === selectedThreadId)
    if (!thread) return
    setJading(true)
    try {
      const lastMsg = threadMessages[threadMessages.length - 1]
      const res     = await fetch('/api/admin/email/jade', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recipientName:  lastMsg?.fromName ?? lastMsg?.from ?? 'Client',
          recipientEmail: lastMsg?.from ?? '',
          purpose:        `Write a professional reply to this email thread. Thread subject: "${thread.subject}". Last message: "${lastMsg?.bodyText?.slice(0, 300) ?? ''}"`,
          context:        replyBody || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Jade failed')
      setReplyBody(data.body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jade reply failed')
    } finally {
      setJading(false)
    }
  }

  // ── Send email ──────────────────────────────────────────────────────────────

  const handleSend = async () => {
    // Auto-confirm any email typed in the To input but not yet added as a tag
    let toList = compose.to
    if (compose.toInput.trim().includes('@')) {
      const pending = compose.toInput.trim()
      if (!toList.includes(pending)) toList = [...toList, pending]
      setCompose(c => ({ ...c, to: toList, toInput: '' }))
    }

    if (!toList.length || !compose.subject || !compose.body) {
      setError('Fill in To, Subject, and Body before sending')
      return
    }
    setSending(true)
    setError('')
    try {
      const res  = await fetch('/api/admin/email/compose', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          to:          toList,
          cc:          compose.cc  ? [compose.cc]  : undefined,
          bcc:         compose.bcc ? [compose.bcc] : undefined,
          subject:     compose.subject,
          bodyText:    compose.body,
          category:    compose.category,
          refType:     compose.refType || undefined,
          refId:       compose.refId   || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      setSuccess('Email sent successfully')
      setComposing(false)
      resetCompose()
      loadThreads()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  // ── Send reply ──────────────────────────────────────────────────────────────

  const handleSendReply = async () => {
    if (!replyBody.trim() || !selectedThreadId) return
    const thread = threads.find(t => t.id === selectedThreadId)
    if (!thread) return

    const participant = thread.participants[0]?.email
    if (!participant) { setError('No recipient found in thread'); return }

    setReplying(true)
    setError('')
    try {
      const res  = await fetch('/api/admin/email/compose', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          to:       [participant],
          subject:  thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`,
          bodyText: replyBody,
          threadId: selectedThreadId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Reply failed')
      setReplyBody('')
      setSuccess('Reply sent')
      loadThread(selectedThreadId)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setReplying(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string
        // dataUrl is "data:<mime>;base64,<content>" — strip the prefix
        const base64 = dataUrl.split(',')[1]
        setAttachments(prev => [
          ...prev,
          { filename: file.name, content: base64, sizeKb: Math.round(file.size / 1024) },
        ])
      }
      reader.readAsDataURL(file)
    })
    // Reset input so the same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resetCompose = () => {
    setCompose({ to: [], toInput: '', cc: '', bcc: '', subject: '', body: '', category: 'sent', refType: '', refId: '', showCc: false })
    setJadePrompt('')
    setShowTemplates(false)
    setAttachments([])
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? null

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden">

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col py-4 overflow-y-auto">

        {/* Compose button */}
        <div className="px-3 mb-4">
          <button
            onClick={() => { setComposing(true); setSelectedThreadId(null); resetCompose() }}
            className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#b8933d] text-gray-950 font-bold px-4 py-2.5 rounded-lg transition-colors text-sm"
          >
            <Plus size={16} />
            Compose
          </button>
        </div>

        {/* Folders */}
        <nav className="px-2 space-y-0.5">
          {FOLDERS.map(folder => {
            const Icon    = folder.icon
            const active  = activeFolder === folder.id && !composing
            return (
              <button
                key={folder.id}
                onClick={() => { setActiveFolder(folder.id); setComposing(false); setSelectedThreadId(null) }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-900/50 text-indigo-300 font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon size={15} />
                {folder.label}
              </button>
            )
          })}
        </nav>

        {/* Categories divider */}
        <div className="mx-3 mt-4 mb-2">
          <p className="text-[10px] font-semibold tracking-widest text-gray-600 uppercase">Categories</p>
        </div>

        <nav className="px-2 space-y-0.5">
          {CATEGORIES.map(cat => {
            const Icon   = cat.icon
            const active = activeFolder === cat.id && !composing
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveFolder(cat.id); setComposing(false); setSelectedThreadId(null) }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-900/50 text-indigo-300 font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon size={15} />
                {cat.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Thread list ──────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">

        {/* Search */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search threads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-gray-800 text-gray-200 placeholder-gray-500 text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={loadThreads}
              disabled={loading}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600">
              <Mail size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No emails in this folder</p>
            </div>
          ) : (
            threads.map(thread => {
              const latest    = thread.messages?.[0]
              const isSelected = thread.id === selectedThreadId
              const preview   = latest?.bodyText?.slice(0, 80) ?? ''
              const lastTime  = relativeTime(thread.lastEmailAt)
              const unread    = !latest?.readAt && latest?.direction === 'in'
              return (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800 transition-colors ${
                    isSelected
                      ? 'bg-indigo-900/30 border-l-2 border-l-indigo-500'
                      : 'hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {unread && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-blue-400 mt-1" />
                      )}
                      <span className={`text-sm truncate ${unread ? 'font-semibold text-white' : 'text-gray-300'}`}>
                        {thread.participants[0]?.name ?? thread.participants[0]?.email ?? 'Unknown'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{lastTime}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5 pl-4">{thread.subject}</p>
                  {preview && (
                    <p className="text-xs text-gray-600 truncate mt-0.5 pl-4">{preview}</p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-950 min-w-0">

        {/* Toast notifications */}
        {(error || success) && (
          <div className={`mx-4 mt-3 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            error ? 'bg-red-900/40 text-red-300 border border-red-800' : 'bg-green-900/40 text-green-300 border border-green-800'
          }`}>
            {error ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            <span>{error || success}</span>
            <button onClick={() => { setError(''); setSuccess('') }} className="ml-auto">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Compose pane ─────────────────────────────────────────────────── */}
        {composing && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">New Email</h2>
              <button onClick={() => { setComposing(false); resetCompose() }} className="text-gray-500 hover:text-gray-300">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* To field */}
              <div className="relative">
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">To</label>
                <div className="flex flex-wrap gap-1.5 items-center bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 min-h-[44px] focus-within:border-indigo-500">
                  {compose.to.map(email => (
                    <span key={email} className="flex items-center gap-1 bg-indigo-900/50 text-indigo-200 text-xs px-2 py-1 rounded-full">
                      {email}
                      <button onClick={() => setCompose(c => ({ ...c, to: c.to.filter(e => e !== email) }))}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={compose.toInput}
                    onChange={e => {
                      setCompose(c => ({ ...c, toInput: e.target.value }))
                      searchContacts(e.target.value)
                    }}
                    onKeyDown={handleToKeyDown}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={compose.to.length === 0 ? 'Enter email or search contacts…' : ''}
                    className="flex-1 min-w-[180px] bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
                  />
                </div>
                {/* Suggestions dropdown */}
                {showSuggestions && contactSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                    {contactSuggestions.map(c => (
                      <button
                        key={c.id}
                        onMouseDown={() => addToEmail(c.email, c.name)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700 text-left"
                      >
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          c.type === 'client' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                        }`}>
                          {c.type}
                        </span>
                        <div>
                          <p className="text-sm text-gray-200">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CC/BCC toggle */}
              {!compose.showCc ? (
                <button
                  onClick={() => setCompose(c => ({ ...c, showCc: true }))}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  + CC / BCC
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">CC</label>
                    <input
                      type="text"
                      value={compose.cc}
                      onChange={e => setCompose(c => ({ ...c, cc: e.target.value }))}
                      placeholder="cc@example.com"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">BCC</label>
                    <input
                      type="text"
                      value={compose.bcc}
                      onChange={e => setCompose(c => ({ ...c, bcc: e.target.value }))}
                      placeholder="bcc@example.com"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Subject</label>
                <input
                  type="text"
                  value={compose.subject}
                  onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                  placeholder="Email subject…"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Templates */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mb-2"
                >
                  <FolderOpen size={13} />
                  {showTemplates ? 'Hide templates' : 'Use a template'}
                  <ChevronDown size={12} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                </button>
                {showTemplates && (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden mb-3">
                    <div className="grid grid-cols-2 gap-px bg-gray-700">
                      {TEMPLATES.map(tpl => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setCompose(c => ({ ...c, subject: tpl.subject, body: tpl.body }))
                            setShowTemplates(false)
                          }}
                          className="bg-gray-900 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
                        >
                          <p className="text-xs font-medium text-gray-200">{tpl.label}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5 capitalize">{tpl.category}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Body</label>
                <textarea
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  placeholder="Write your message here…"
                  rows={10}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed resize-none"
                />
              </div>

              {/* Attachments */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <Paperclip size={13} />
                  Attach files
                </button>
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                        <Paperclip size={12} className="text-gray-500 shrink-0" />
                        <span className="text-xs text-gray-300 truncate flex-1">{att.filename}</span>
                        <span className="text-xs text-gray-500 shrink-0">{att.sizeKb} KB</span>
                        <button
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Jade AI section */}
              <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-[#C9A84C]" />
                  <h3 className="text-sm font-semibold text-[#C9A84C]">Jade AI Email Writer</h3>
                </div>
                <textarea
                  value={jadePrompt}
                  onChange={e => setJadePrompt(e.target.value)}
                  placeholder="Describe what you want Jade to write… e.g. 'Follow up on their visa appointment, reassure them about processing times, and ask for their passport copy'"
                  rows={3}
                  className="w-full bg-gray-900 border border-indigo-800/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-600 resize-none"
                />
                <button
                  onClick={generateWithJade}
                  disabled={jading || !jadePrompt.trim()}
                  className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#0d2545] disabled:opacity-50 text-[#C9A84C] font-semibold px-4 py-2 rounded-lg text-sm transition-colors border border-[#C9A84C]/30"
                >
                  {jading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {jading ? 'Jade is writing…' : '✦ Generate with Jade'}
                </button>
              </div>
            </div>

            {/* Send button */}
            <div className="px-6 py-4 border-t border-gray-800">
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#b8933d] disabled:opacity-50 text-gray-950 font-bold py-3 rounded-lg transition-colors"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        )}

        {/* ── Thread view ──────────────────────────────────────────────────── */}
        {selectedThreadId && !composing && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thread header */}
            {selectedThread && (
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                <h2 className="text-base font-semibold text-white truncate">{selectedThread.subject}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedThread.participants.map((p, i) => (
                    <span
                      key={i}
                      className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full"
                    >
                      {p.name ? `${p.name} <${p.email}>` : p.email}
                    </span>
                  ))}
                  <span className="text-xs bg-blue-900/30 text-blue-300 px-2.5 py-1 rounded-full">
                    {selectedThread._count?.messages ?? threadMessages.length} messages
                  </span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {threadLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 size={20} className="animate-spin mr-2" /> Loading messages…
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-600">
                  <p className="text-sm">No messages in this thread</p>
                </div>
              ) : (
                threadMessages.map(msg => {
                  const isOut = msg.direction === 'out'
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-xl shadow-sm ${
                          isOut
                            ? 'bg-[#0B1F3A] border border-blue-900/40'
                            : 'bg-gray-800 border border-gray-700'
                        }`}
                      >
                        {/* Message header */}
                        <div className="flex items-center justify-between gap-4 px-4 pt-3 pb-2 border-b border-white/5">
                          <div className="text-xs">
                            {isOut ? (
                              <span className="text-gray-400">
                                <span className="text-blue-300 font-medium">{msg.fromName ?? msg.from}</span>
                                {' '}&rarr; {Array.isArray(msg.to) ? msg.to.join(', ') : msg.to}
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                From: <span className="text-gray-200 font-medium">{msg.fromName ?? msg.from}</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 shrink-0">
                            {msg.openCount > 0 && (
                              <span className="flex items-center gap-1 text-green-500">
                                <Eye size={11} /> {msg.openCount}x
                              </span>
                            )}
                            <span>{relativeTime(msg.sentAt ?? msg.receivedAt)}</span>
                          </div>
                        </div>
                        {/* Body */}
                        <p className="px-4 py-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                          {msg.bodyText}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Reply bar */}
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 space-y-3">
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={generateReplyWithJade}
                  disabled={jading}
                  className="flex items-center gap-1.5 bg-[#0B1F3A] hover:bg-[#0d2545] disabled:opacity-50 text-[#C9A84C] text-xs font-semibold px-3 py-2 rounded-lg border border-[#C9A84C]/30 transition-colors"
                >
                  {jading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  ✦ Jade
                </button>
                <button
                  onClick={handleSendReply}
                  disabled={replying || !replyBody.trim()}
                  className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#b8933d] disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors ml-auto"
                >
                  {replying ? <Loader2 size={14} className="animate-spin" /> : <Reply size={14} />}
                  {replying ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {!composing && !selectedThreadId && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
            <Mail size={48} className="mb-4 opacity-30" />
            <p className="text-base font-medium">← Select a thread or compose a new email</p>
            <p className="text-sm mt-1 opacity-70">Use the Compose button to send a new email with Jade AI</p>
          </div>
        )}
      </div>
    </div>
  )
}
