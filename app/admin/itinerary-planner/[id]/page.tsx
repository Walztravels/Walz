'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { JadeCopilot, type JadeContext, type AdminJadeTripContext } from './JadeCopilot'
import { JadeTripAuditor } from '@/components/admin/JadeTripAuditor'
import TravelersTab from '@/components/admin/itinerary/TravelersTab'
import TasksTab from '@/components/admin/itinerary/TasksTab'
import EsimTab from '@/components/admin/itinerary/EsimTab'
import { NotesTab } from '@/components/admin/itinerary/NotesTab'
import { PaymentScheduleEditor, PackageOptionsEditor } from '@/components/admin/itinerary/PricingExtras'
import ResearchTab from '@/components/admin/itinerary/ResearchTab'
import VersionHistory from '@/components/admin/itinerary/VersionHistory'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Day {
  day: number
  title: string
  description: string
  activities: string[]
  meals: string
  accommodation: string
  destination: string
  weather: string
  dressCode: string
  notes: string          // legacy — kept for backwards compat
  clientNotes: string    // shown to client on the public page
  internalNotes: string  // admin-only, never shown to client
}

interface Flight {
  id: string
  from: string
  to: string
  airline: string
  iataCode: string
  flightNumber: string
  date: string
  time: string
  arrivalTime: string
  class: string
  pnr: string
  cost: number | null         // client price (shown in pricing breakdown)
  supplierCost: number | null // internal — never shown to client
  status: string
  notes: string
  supplierId: string          // FK to Supplier
  duffelOrderId: string       // links to confirmed Duffel booking
}

interface Hotel {
  id: string
  name: string
  location: string
  websiteUrl: string
  checkIn: string
  checkOut: string
  roomType: string
  nights: number
  cost: number | null         // client price
  supplierCost: number | null // internal
  status: string
  notes: string
  image: string
  images?: string[]
  supplierId: string
  hotelbedsCancellationReference: string
}

interface Transfer {
  id: string
  type: string
  from: string
  to: string
  date: string
  time: string
  vehicle: string
  provider: string
  cost: number | null
  supplierCost: number | null
  notes: string
  image: string
  images?: string[]
  supplierId: string
}

interface Tour {
  id: string
  name: string
  location: string
  date: string
  time: string
  duration: string
  provider: string
  cost: number | null
  supplierCost: number | null
  notes: string
  image: string
  images?: string[]
  supplierId: string
}

interface Train {
  id: string
  from: string
  to: string
  date: string
  departureTime: string
  arrivalTime: string
  trainNumber: string
  class: string
  provider: string
  pnr: string
  cost: number | null
  supplierCost: number | null
  notes: string
  image: string
  supplierId: string
}

interface Ferry {
  id: string
  from: string
  to: string
  date: string
  departureTime: string
  arrivalTime: string
  operator: string
  class: string
  vessel: string
  cost: number | null
  supplierCost: number | null
  notes: string
  image: string
  supplierId: string
}

interface PriceRow {
  id: string
  item: string
  description: string
  cost: number
}

interface ItineraryData {
  id: string
  referenceNumber: string
  title: string
  status: string
  type: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  destination: string
  destinations?: string
  startDate: string | null
  endDate: string | null
  duration: number | null
  numberOfTravellers: number
  tripType: string | null
  budget: number | null
  totalPrice: number | null
  deposit: number | null
  depositDue: string | null
  balanceDue: string | null
  currency: string
  notes: string | null
  overview: string | null
  days: string
  flights: string
  hotels: string
  transfers?: string
  tours?: string
  trains?: string
  ferries?: string
  inclusions: string
  exclusions: string
  terms: string | null
  priceBreakdown: string
  coverImage: string | null
  sentAt: string | null
  approvedAt: string | null
  selectedOption: string | null
  viewCount: number
  createdAt: string
  updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

type SnapBrief = {
  acceptedBy?: string
  acceptedAt?: string
  acceptedTotal?: number | null
  deposit?: number | null
  selectedOptionIds?: string[]
  options?: { id: string; label: string; price: number | null; currency: string }[]
}
function parseSnap(raw: string | null | undefined): SnapBrief | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return null
    return p as SnapBrief
  } catch { return null }
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function fmtDate(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(d?: string | Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TERMS = `BOOKING & PAYMENT TERMS

DEPOSIT REQUIRED: A non-refundable deposit of 25% of the total package cost is required to secure your booking. Your dates are not confirmed until the deposit is received.

BALANCE PAYMENT: The remaining balance is due no later than 8 weeks (56 days) before your departure date. Failure to pay by this date may result in cancellation without refund.

CANCELLATION POLICY:
• More than 60 days before departure — Deposit forfeited
• 31–60 days before departure — 50% of total package cost
• 15–30 days before departure — 75% of total package cost
• Fewer than 15 days before departure — 100% of total package cost

TRAVEL INSURANCE: We strongly recommend comprehensive travel insurance covering trip cancellation, medical emergencies, lost baggage, and personal liability. This should be obtained at the time of booking.

AMENDMENTS: Changes to confirmed bookings are subject to availability and may incur supplier fees plus an administration fee of £50 per booking.

ITINERARY CHANGES: Walz Travels reserves the right to modify itineraries due to circumstances beyond our control, including adverse weather, political events, airline schedule changes, or natural disasters. We will endeavour to provide alternatives of equal or greater value.

PASSPORT & VISA RESPONSIBILITY: It is the sole responsibility of each traveller to ensure their passport is valid for at least 6 months beyond the return date, and to obtain all necessary visas and travel documentation. Walz Travels can assist with visa guidance but accepts no liability for refused applications.

HEALTH & SPECIAL REQUIREMENTS: Please inform us of any medical conditions, dietary requirements, or mobility needs at the time of booking.

By approving this itinerary, you confirm you have read, understood, and agreed to these terms and conditions.

Walz Travels Ltd | thewalztechs@gmail.com | walztravels.com`

const TABS = [
  { id: 'overview',   label: '📋 Overview' },
  { id: 'days',       label: '📅 Day by Day' },
  { id: 'bookings',   label: '🗂️ Bookings' },
  { id: 'travelers',  label: '👥 Travelers' },
  { id: 'tasks',      label: '✅ Tasks' },
  { id: 'esim',       label: '📶 eSIM' },
  { id: 'pricing',    label: '💰 Pricing' },
  { id: 'margin',     label: '📊 Margin' },
  { id: 'research',   label: '🔍 Research' },
  { id: 'versions',   label: '🕓 Versions' },
  { id: 'notes',      label: '📝 Notes' },
  { id: 'preview',    label: '👁 Preview & Send' },
]

const BOOKING_TABS = [
  { id: 'flights',   label: '✈️ Flights' },
  { id: 'hotels',    label: '🏨 Hotels' },
  { id: 'transfers', label: '🚗 Transfers' },
  { id: 'tours',     label: '🎭 Tours' },
  { id: 'trains',    label: '🚂 Trains' },
  { id: 'ferries',   label: '⛴️ Ferries' },
]

const STATUS_LABELS: Record<string, string> = {
  draft:    '✏️ Draft',
  proposal: '📨 Sent to Client',
  approved: '✅ Approved',
  live:     '🗺️ Live Trip',
  archived: '📁 Archived',
}

const CURRENCY_SYM: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: '₵', AED: 'AED ',
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50'
const ta  = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 resize-none'
const sel = 'w-full bg-[#0b1525] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50'

// ─── ImageField ───────────────────────────────────────────────────────────────

function ImageField({ value, onChange, label = 'Image URL', placeholder = 'https://…' }: {
  value: string
  onChange: (v: string) => void
  label?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">{label}</label>
      {value && (
        <div className="mb-2 rounded-lg overflow-hidden h-20 bg-white/5">
          <img src={value} alt="Image field preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inp} />
    </div>
  )
}

// ─── MultiImageGallery ────────────────────────────────────────────────────────

function MultiImageGallery({
  itinId,
  itemType,
  itemId,
  images,
  websiteUrl,
  destination,
  onImagesChange,
  autoSave,
}: {
  itinId:          string
  itemType:        'hotel' | 'tour' | 'transfer' | 'train' | 'ferry'
  itemId:          string
  images:          string[]
  websiteUrl?:     string
  destination?:    string
  onImagesChange:  (imgs: string[]) => void
  autoSave?:       () => void
}) {
  const [fetching, setFetching]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [urlInput, setUrlInput]     = useState('')
  const [fetchMsg, setFetchMsg]     = useState('')
  const [failedImgs, setFailedImgs] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const addUrls = (newUrls: string[]) => {
    const deduped = [...new Set([...images, ...newUrls.filter(Boolean)])]
    onImagesChange(deduped)
  }
  const removeImg = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx))
  }

  const handleFetch = async () => {
    setFetching(true)
    setFetchMsg('')
    try {
      const res = await fetch('/api/admin/itineraries/fetch-item-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, url: websiteUrl, destination }),
      })
      const data = await res.json() as { urls?: string[]; source?: string; error?: string }
      if (data.urls && data.urls.length > 0) {
        addUrls(data.urls)
        setFetchMsg(`✓ ${data.urls.length} images fetched (${data.source ?? ''})`)
        autoSave?.()
      } else {
        setFetchMsg('No images found. Try uploading instead.')
      }
    } catch {
      setFetchMsg('Fetch failed')
    }
    setFetching(false)
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const results = await Promise.all(
      Array.from(files).map(async (file) => {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('itemType', itemType)
        fd.append('itemId', itemId)
        try {
          const res = await fetch(`/api/admin/itineraries/${itinId}/upload-item-image`, {
            method: 'POST',
            body: fd,
          })
          const data = await res.json() as { url?: string; error?: string }
          return data.url ?? null
        } catch { return null }
      })
    )
    const uploaded = results.filter((u): u is string => u !== null)
    if (uploaded.length) {
      addUrls(uploaded)
      autoSave?.()
    }
    setUploading(false)
  }

  const handleUrlAdd = () => {
    const url = urlInput.trim()
    if (url) { addUrls([url]); setUrlInput('') }
  }

  return (
    <div className="mt-3">
      <label className="text-white/30 text-[10px] font-bold uppercase block mb-2">Images</label>

      {/* Thumbnail grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {images.map((src, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden bg-white/5 aspect-video">
              {failedImgs.has(idx) ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/30 text-xs gap-1">
                  <span className="text-xl">🖼</span>
                  <span>Failed to load</span>
                </div>
              ) : (
                <img
                  src={src}
                  alt={`img-${idx}`}
                  className="w-full h-full object-cover"
                  onError={() => setFailedImgs(prev => new Set(prev).add(idx))}
                />
              )}
              <button
                onClick={() => removeImg(idx)}
                className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-500/80"
              >
                ✕
              </button>
              {idx === 0 && (
                <div className="absolute bottom-1 left-1 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  COVER
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions row */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={handleFetch}
          disabled={fetching || (!websiteUrl && !destination)}
          className="flex items-center gap-1.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition disabled:opacity-40"
        >
          {fetching
            ? <><span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin inline-block" /> Fetching…</>
            : '🔍 Fetch from Website'}
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600/30 transition disabled:opacity-40"
        >
          {uploading
            ? <><span className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full animate-spin inline-block" /> Uploading…</>
            : '⬆ Upload Images'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={e => void handleUpload(e.target.files)}
        />
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUrlAdd()}
          placeholder="Or paste image URL…"
          className={inp + ' flex-1 text-xs'}
        />
        <button
          onClick={handleUrlAdd}
          disabled={!urlInput.trim()}
          className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-3 rounded-lg text-xs font-bold transition disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {fetchMsg && (
        <p className={`mt-1.5 text-[11px] ${fetchMsg.startsWith('✓') ? 'text-green-400' : 'text-amber-400'}`}>
          {fetchMsg}
        </p>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItineraryBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const [itin, setItin] = useState<ItineraryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showCopilot, setShowCopilot] = useState(false)
  const [flightSearchHint, setFlightSearchHint] = useState<{ type: string; destination: string; date: string } | null>(null)
  const [jadeContext, setJadeContext] = useState<JadeContext>({ activeTab: 'overview' })

  // Reset context when tab changes; child components enrich it via onContextChange
  useEffect(() => {
    setJadeContext({ activeTab })
  }, [activeTab])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/itineraries/${id}`)
    const data = await res.json()
    setItin(data.itinerary)
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setShowCopilot(true)
      setFlightSearchHint(e.detail as { type: string; destination: string; date: string })
    }
    window.addEventListener('jade-open-search', handler as EventListener)
    return () => window.removeEventListener('jade-open-search', handler as EventListener)
  }, [])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/itineraries/${id}`)
    const data = await res.json()
    if (data.itinerary) setItin(data.itinerary)
  }, [id])

  const save = useCallback(async (updates: Record<string, unknown>) => {
    if (!id) return
    setSaving(true)
    const res = await fetch(`/api/admin/itineraries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (data.itinerary) {
      setItin(data.itinerary)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    }
    setSaving(false)
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!itin) return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center text-white/40">
      Itinerary not found
    </div>
  )

  return (
    <>
    <div className={`min-h-screen bg-[#060f1e] text-white transition-all duration-300 ${showCopilot ? 'mr-[420px]' : ''}`}>
      <div className="border-b border-white/[0.08] px-6 py-4 sticky top-0 bg-[#060f1e] z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <a href="/admin/itinerary-planner" className="text-white/30 hover:text-white text-sm transition">
                ← Itineraries
              </a>
              <div>
                <h1 className="text-white font-bold text-base">{itin.title}</h1>
                <p className="text-white/30 text-xs">{itin.clientName} · {itin.destination} · {itin.referenceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {saving && <span className="text-white/30 text-xs animate-pulse">Saving…</span>}
              {saveMsg && !saving && <span className="text-green-400 text-xs">✓ {saveMsg}</span>}
              <button
                onClick={() => setShowCopilot(prev => !prev)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                  showCopilot
                    ? 'bg-amber-500 text-black'
                    : 'bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30'
                }`}
              >
                ✨ Jade Copilot
                {showCopilot && <span className="bg-black/20 text-[10px] px-1.5 py-0.5 rounded-full">ON</span>}
              </button>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                itin.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                itin.status === 'proposal' ? 'bg-blue-500/20 text-blue-400' :
                'bg-white/10 text-white/50'
              }`}>
                {STATUS_LABELS[itin.status] || itin.status}
              </span>
              {itin.status === 'draft' && (
                <button
                  onClick={() => setActiveTab('preview')}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition"
                >
                  Send to Client →
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview'   && <OverviewTab  itin={itin} onSave={save} />}
        {activeTab === 'days'       && <DaysTab      itin={itin} onSave={save} onContextChange={setJadeContext} />}
        {activeTab === 'bookings'   && <BookingsTab  itin={itin} onSave={save} onContextChange={setJadeContext} />}
        {activeTab === 'travelers'  && (
          <TravelersTab
            itinId={itin.id}
            currency={itin.currency || 'GBP'}
            destination={itin.destination}
            startDate={itin.startDate}
            numberOfTravellers={itin.numberOfTravellers}
          />
        )}
        {activeTab === 'tasks' && (
          <TasksTab
            itinId={itin.id}
            itinSummary={{
              destination: itin.destination,
              startDate: itin.startDate,
              endDate: itin.endDate,
              numberOfTravellers: itin.numberOfTravellers,
            }}
          />
        )}
        {activeTab === 'esim' && (
          <EsimTab
            itinId={itin.id}
            destination={itin.destination}
            destinations={itin.destinations || '[]'}
            numberOfTravellers={itin.numberOfTravellers}
            startDate={itin.startDate}
            endDate={itin.endDate}
            currency={itin.currency || 'GBP'}
          />
        )}
        {activeTab === 'pricing'    && <PricingTab   itin={itin} onSave={save} />}
        {activeTab === 'margin'     && <MarginTab    itin={itin} />}
        {activeTab === 'research'   && (
          <ResearchTab
            itinId={itin.id}
            destination={itin.destination}
            startDate={itin.startDate}
            endDate={itin.endDate}
            numberOfTravellers={itin.numberOfTravellers}
          />
        )}
        {activeTab === 'versions'   && (
          <VersionHistory
            itinId={itin.id}
            onRestore={(snapshot) => {
              setItin(prev => prev ? { ...prev, ...snapshot } as typeof prev : prev)
            }}
          />
        )}
        {activeTab === 'notes'      && <NotesTab     itinId={itin.id} />}
        {activeTab === 'preview'    && (
          <PreviewTab
            itin={itin}
            onSave={save}
            onSent={() => setItin(prev => prev ? { ...prev, status: 'proposal', sentAt: new Date().toISOString() } : prev)}
          />
        )}
      </div>
    </div>

    {showCopilot && (
      <JadeCopilot
        itinerary={({
          id: itin.id,
          title: itin.title || undefined,
          destination: itin.destination || undefined,
          currency: itin.currency || undefined,
          numberOfTravellers: itin.numberOfTravellers,
        }) satisfies AdminJadeTripContext}
        onItineraryUpdate={refresh}
        onClose={() => setShowCopilot(false)}
        initialSearchHint={flightSearchHint}
        onSearchHintConsumed={() => setFlightSearchHint(null)}
        jadeContext={jadeContext}
      />
    )}
    </>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    title: itin.title || '',
    destination: itin.destination || '',
    overview: itin.overview || '',
    coverImage: itin.coverImage || '',
    startDate: itin.startDate ? itin.startDate.split('T')[0] : '',
    endDate: itin.endDate ? itin.endDate.split('T')[0] : '',
    duration: itin.duration ?? '',
    numberOfTravellers: itin.numberOfTravellers || 1,
    tripType: itin.tripType || 'leisure',
    currency: itin.currency || 'GBP',
    budget: itin.budget ?? '',
    notes: itin.notes || '',
    terms: itin.terms || '',
    clientName: itin.clientName || '',
    clientEmail: itin.clientEmail || '',
    clientPhone: itin.clientPhone || '',
  })
  const [destinations, setDestinations] = useState<string[]>(safeParse<string[]>(itin.destinations || '[]', []))
  const [newDest, setNewDest] = useState('')
  const [inclusions, setInclusions] = useState<string[]>(safeParse<string[]>(itin.inclusions, []))
  const [exclusions, setExclusions] = useState<string[]>(safeParse<string[]>(itin.exclusions, []))
  const [newInc, setNewInc] = useState('')
  const [newExc, setNewExc] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetchingCover, setFetchingCover] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadCoverErr, setUploadCoverErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const coverFileRef = useRef<HTMLInputElement>(null)

  const upd = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      ...form,
      destinations: JSON.stringify(destinations),
      duration: form.duration !== '' ? Number(form.duration) : null,
      budget: form.budget !== '' ? Number(form.budget) : null,
      numberOfTravellers: Number(form.numberOfTravellers),
      inclusions: JSON.stringify(inclusions),
      exclusions: JSON.stringify(exclusions),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    })
    setSaving(false)
  }

  const handleAutoCover = async () => {
    setFetchingCover(true)
    try {
      const res = await fetch('/api/admin/itineraries/cover-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: form.destination, destinations }),
      })
      const data = await res.json()
      if (data.url) upd('coverImage', data.url)
    } catch {}
    setFetchingCover(false)
  }

  const handleCoverUpload = async (file: File) => {
    setUploadCoverErr('')
    setUploadingCover(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/admin/itineraries/${itin.id}/upload-image`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        upd('coverImage', data.url)
        await onSave({ coverImage: data.url })
      } else {
        setUploadCoverErr(data.error || 'Upload failed')
      }
    } catch {
      setUploadCoverErr('Network error during upload')
    }
    setUploadingCover(false)
  }

  const onCoverDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleCoverUpload(file)
  }

  const addDest = () => {
    if (newDest.trim()) { setDestinations(p => [...p, newDest.trim()]); setNewDest('') }
  }
  const addInc = () => { if (newInc.trim()) { setInclusions(p => [...p, newInc.trim()]); setNewInc('') } }
  const addExc = () => { if (newExc.trim()) { setExclusions(p => [...p, newExc.trim()]); setNewExc('') } }

  const snap = parseSnap(itin.selectedOption)
  const sym = CURRENCY_SYM[itin.currency] || ''

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Acceptance card — approved itineraries only */}
      {itin.status === 'approved' && snap?.acceptedBy && (
        <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-400 text-lg">✅</span>
            <h2 className="text-green-400 font-bold text-base">Proposal Accepted</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-1">Accepted By</p>
              <p className="text-white text-sm font-semibold">{snap.acceptedBy}</p>
            </div>
            {snap.acceptedAt && (
              <div>
                <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-1">Accepted On</p>
                <p className="text-white text-sm">{fmtDateTime(snap.acceptedAt)}</p>
              </div>
            )}
            {snap.acceptedTotal != null && (
              <div>
                <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-1">Accepted Total</p>
                <p className="text-amber-400 text-sm font-bold">{sym}{Number(snap.acceptedTotal).toLocaleString()}</p>
              </div>
            )}
            {snap.options && snap.options.length > 0 && (
              <div>
                <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-1">Package</p>
                <p className="text-white text-sm">{snap.options.map(o => o.label).join(', ')}</p>
              </div>
            )}
          </div>
          {itin.approvedAt && (
            <p className="text-white/20 text-xs mt-3">System timestamp: {fmtDateTime(itin.approvedAt)}</p>
          )}
        </div>
      )}

      {/* Client Info */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Client Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Client Name</label>
            <input value={form.clientName} onChange={e => upd('clientName', e.target.value)} placeholder="Full name" className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Email</label>
            <input type="email" value={form.clientEmail} onChange={e => upd('clientEmail', e.target.value)} placeholder="email@example.com" className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Phone</label>
            <input value={form.clientPhone} onChange={e => upd('clientPhone', e.target.value)} placeholder="+44 7…" className={inp} />
          </div>
        </div>
      </div>

      {/* Trip Info */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Trip Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Trip Title</label>
            <input value={form.title} onChange={e => upd('title', e.target.value)} placeholder="e.g. Dubai Luxury Escape 2026" className={inp} />
          </div>

          {/* Multi-destination */}
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Destinations</label>
            {destinations.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {destinations.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs px-3 py-1.5 rounded-full">
                    <span>📍 {d}</span>
                    <button onClick={() => setDestinations(p => p.filter((_, j) => j !== i))} className="text-amber-400/50 hover:text-amber-400 transition">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newDest}
                onChange={e => setNewDest(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDest()}
                placeholder="Add a destination (e.g. Dubai, UAE)…"
                className={inp + ' flex-1'}
              />
              <button onClick={addDest} className="bg-amber-500/20 text-amber-400 px-4 rounded-xl hover:bg-amber-500/30 transition text-sm font-bold">+</button>
            </div>
            <p className="text-white/20 text-xs mt-1.5">Used for multi-stop trips — AI will generate the route automatically</p>
          </div>

          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Primary Destination</label>
            <input value={form.destination} onChange={e => upd('destination', e.target.value)} placeholder="e.g. Dubai, UAE" className={inp} />
          </div>

          {/* Cover Image — drag & drop or URL */}
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Cover Image</label>

            {/* Drop zone / preview */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onCoverDrop}
              onClick={() => coverFileRef.current?.click()}
              className={`relative mb-2 rounded-xl overflow-hidden cursor-pointer transition-all border-2 border-dashed
                ${dragOver ? 'border-amber-400 bg-amber-500/10' : 'border-white/15 hover:border-white/30'}
                ${form.coverImage ? 'h-36' : 'h-24'}`}
            >
              {form.coverImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.coverImage}
                    alt="Cover"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="text-white text-xs font-semibold">🖼 Replace image</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-1.5 select-none">
                  {uploadingCover
                    ? <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    : <span className="text-2xl">{dragOver ? '📂' : '🖼'}</span>}
                  <p className="text-white/40 text-xs font-medium">
                    {uploadingCover ? 'Uploading…' : dragOver ? 'Drop to upload' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-white/20 text-[10px]">JPEG · PNG · WebP · up to 8 MB</p>
                </div>
              )}
              {uploadingCover && form.coverImage && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={coverFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleCoverUpload(f); e.target.value = '' }}
            />

            {uploadCoverErr && <p className="text-red-400 text-xs mb-2">{uploadCoverErr}</p>}

            {/* URL input fallback + Auto */}
            <div className="flex gap-2">
              <input
                value={form.coverImage}
                onChange={e => upd('coverImage', e.target.value)}
                placeholder="Or paste an image URL…"
                className={inp + ' flex-1 text-xs'}
              />
              <button
                onClick={handleAutoCover}
                disabled={fetchingCover}
                className="bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 rounded-xl hover:bg-purple-600/30 transition text-xs font-bold whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
              >
                {fetchingCover ? <span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin" /> : '✨'} Auto
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => upd('startDate', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">End Date</label>
              <input type="date" value={form.endDate} onChange={e => upd('endDate', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Duration (days)</label>
              <input type="number" min="1" value={form.duration} onChange={e => upd('duration', e.target.value)} placeholder="7" className={inp} />
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Travellers</label>
              <input type="number" min="1" value={form.numberOfTravellers} onChange={e => upd('numberOfTravellers', e.target.value)} className={inp} />
            </div>
          </div>
          {form.startDate && form.destination && (
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-blue-300 text-xs font-bold">✈ Dates set for {form.destination}</p>
                <p className="text-white/40 text-[11px]">Search live flights for this trip</p>
              </div>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jade-open-search', { detail: { type: 'flights', destination: form.destination, date: form.startDate } }))
                }}
                className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-500/30 transition"
              >
                Search Flights →
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Trip Type</label>
              <select value={form.tripType} onChange={e => upd('tripType', e.target.value)} className={sel}>
                <option value="leisure">🏖️ Leisure</option>
                <option value="honeymoon">💍 Honeymoon</option>
                <option value="group">👥 Group</option>
                <option value="business">💼 Business</option>
                <option value="family">👨‍👩‍👧‍👦 Family</option>
                <option value="solo">🎒 Solo</option>
                <option value="visa_trip">🛂 Visa Trip</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Currency</label>
              <select value={form.currency} onChange={e => upd('currency', e.target.value)} className={sel}>
                <option value="GBP">🇬🇧 GBP</option>
                <option value="NGN">🇳🇬 NGN</option>
                <option value="GHS">🇬🇭 GHS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="AED">🇦🇪 AED</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Budget</label>
              <input type="number" value={form.budget} onChange={e => upd('budget', e.target.value)} placeholder="Optional" className={inp} />
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Trip Overview</h2>
        <textarea
          value={form.overview}
          onChange={e => upd('overview', e.target.value)}
          placeholder="Write an engaging overview of this trip for the client…"
          rows={4}
          className={ta}
        />
      </div>

      {/* Inclusions & Exclusions */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">Inclusions &amp; Exclusions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-green-400 text-xs font-bold uppercase tracking-wider block mb-3">✅ Included</label>
            <div className="space-y-2 mb-3">
              {inclusions.map((inc, i) => (
                <div key={i} className="flex items-center gap-2 bg-green-500/10 rounded-lg px-3 py-2">
                  <span className="text-green-400 text-xs flex-1">{inc}</span>
                  <button onClick={() => setInclusions(p => p.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newInc} onChange={e => setNewInc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addInc()} placeholder="Add inclusion…" className={inp + ' flex-1'} />
              <button onClick={addInc} className="bg-green-500/20 text-green-400 px-3 rounded-xl hover:bg-green-500/30 transition text-sm font-bold">+</button>
            </div>
          </div>
          <div>
            <label className="text-red-400 text-xs font-bold uppercase tracking-wider block mb-3">❌ Not Included</label>
            <div className="space-y-2 mb-3">
              {exclusions.map((exc, i) => (
                <div key={i} className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                  <span className="text-red-300 text-xs flex-1">{exc}</span>
                  <button onClick={() => setExclusions(p => p.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newExc} onChange={e => setNewExc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExc()} placeholder="Add exclusion…" className={inp + ' flex-1'} />
              <button onClick={addExc} className="bg-red-500/20 text-red-400 px-3 rounded-xl hover:bg-red-500/30 transition text-sm font-bold">+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Terms & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-base">Terms &amp; Conditions</h2>
            <button
              onClick={() => upd('terms', DEFAULT_TERMS)}
              className="text-amber-400 text-xs hover:text-amber-300 transition font-medium border border-amber-500/30 px-3 py-1.5 rounded-lg hover:border-amber-500/50"
            >
              Load Default Terms
            </button>
          </div>
          <textarea value={form.terms} onChange={e => upd('terms', e.target.value)} placeholder="Payment terms, cancellation policy, etc." rows={8} className={ta} />
        </div>
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <h2 className="text-white font-bold text-base mb-4">Internal Notes</h2>
          <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Internal notes (not shown to client)…" rows={8} className={ta} />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Overview'}
        </button>
      </div>
    </div>
  )
}

// ─── Days Tab ────────────────────────────────────────────────────────────────

function DaysTab({ itin, onSave, onContextChange }: {
  itin: ItineraryData
  onSave: (u: Record<string, unknown>) => Promise<void>
  onContextChange?: (ctx: JadeContext) => void
}) {

  // ── State ─────────────────────────────────────────────────────────────────
  const [days, setDays] = useState<Day[]>(safeParse<Day[]>(itin.days, []))
  const [editingDayId, setEditingDayId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')

  // Sync when Jade Copilot (or any external save) updates itin.days in parent
  useEffect(() => {
    if (!generating) {
      const fresh = safeParse<Day[]>(itin.days, [])
      setDays(fresh)
      // Don't force editor open on Jade sync
    }
  }, [itin.days]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update Jade context when editing state changes
  useEffect(() => {
    if (!onContextChange) return
    if (!editingDayId) {
      onContextChange({ activeTab: 'days' })
      return
    }
    const day = days.find(d => d.day === editingDayId)
    onContextChange({ activeTab: 'days', dayNumber: editingDayId, dayTitle: day?.title || `Day ${editingDayId}` })
  }, [editingDayId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data helpers ──────────────────────────────────────────────────────────
  const updDay = (dayNum: number, field: keyof Day, value: unknown) =>
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, [field]: value } : d))

  const addDay = () => {
    const next = days.length > 0 ? Math.max(...days.map(d => d.day)) + 1 : 1
    const newDay: Day = {
      day: next, title: `Day ${next}`, description: '', activities: [],
      meals: '', accommodation: '', destination: '', weather: '', dressCode: '',
      notes: '', clientNotes: '', internalNotes: '',
    }
    setDays(prev => [...prev, newDay])
    setEditingDayId(next)
  }

  const removeDay = (dayNum: number) => {
    if (!window.confirm('Remove this day? This cannot be undone until you cancel without saving.')) return
    setDays(prev => prev.filter(d => d.day !== dayNum).map((d, i) => ({ ...d, day: i + 1 })))
    setEditingDayId(null)
  }

  const moveDay = (dayNum: number, dir: 'up' | 'down') => {
    const idx = days.findIndex(d => d.day === dayNum)
    const canMove = dir === 'up' ? idx > 0 : idx < days.length - 1
    if (!canMove) return
    setDays(prev => {
      const i = prev.findIndex(d => d.day === dayNum)
      const next = [...prev]
      const swap = dir === 'up' ? i - 1 : i + 1
      ;[next[i], next[swap]] = [next[swap], next[i]]
      return next.map((d, j) => ({ ...d, day: j + 1 }))
    })
    // Keep the editor tracking the moved day after renumber
    if (editingDayId === dayNum) {
      setEditingDayId(dir === 'up' ? dayNum - 1 : dayNum + 1)
    }
  }

  const addActivity = (dayNum: number) =>
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, activities: [...d.activities, ''] } : d))

  const updActivity = (dayNum: number, idx: number, val: string) =>
    setDays(prev => prev.map(d => {
      if (d.day !== dayNum) return d
      const acts = [...d.activities]; acts[idx] = val
      return { ...d, activities: acts }
    }))

  const removeActivity = (dayNum: number, idx: number) =>
    setDays(prev => prev.map(d => {
      if (d.day !== dayNum) return d
      return { ...d, activities: d.activities.filter((_, i) => i !== idx) }
    }))

  // ── Save helpers ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ days: JSON.stringify(days) })
    } catch (e) {
      setSaveError('Save failed — check your connection and try again.')
      throw e
    } finally {
      setSaving(false)
    }
  }

  const doneEditing = async () => {
    try { await handleSave(); setEditingDayId(null) } catch { /* saveError is set; editor stays open */ }
  }

  const switchToDay = async (newDayId: number) => {
    if (editingDayId === null || editingDayId === newDayId) {
      setEditingDayId(newDayId)
      return
    }
    try { await handleSave(); setEditingDayId(newDayId) } catch { /* saveError shown; stay on current day */ }
  }

  // ── Jade AI generation ────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true)
    setGenMsg('Generating with Jade AI…')
    try {
      const res = await fetch('/api/admin/itineraries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: itin.destination,
          destinations: safeParse<string[]>(itin.destinations || '[]', []),
          duration: itin.duration || days.length || 7,
          tripType: itin.tripType,
          numberOfTravellers: itin.numberOfTravellers,
          budget: itin.budget,
          notes: itin.notes,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setGenMsg(`❌ ${data.error}`)
      } else if (data.days && Array.isArray(data.days)) {
        setDays(data.days)
        setEditingDayId(null)
        setGenMsg('✓ Generated! Review and save.')
        const extras: Record<string, unknown> = { days: JSON.stringify(data.days) }
        if (data.overview) extras.overview = data.overview
        if (data.inclusions) extras.inclusions = JSON.stringify(data.inclusions)
        if (data.exclusions) extras.exclusions = JSON.stringify(data.exclusions)
        await onSave(extras)
      } else {
        setGenMsg('AI returned unexpected data. Try again.')
      }
    } catch {
      setGenMsg('Generation failed. Check your connection and try again.')
    }
    setGenerating(false)
  }

  // ── Display-only helpers ──────────────────────────────────────────────────

  // Icon detection — never persisted to the database
  const actIcon = (text: string): string => {
    const t = text.toLowerCase()
    if (/flight|airport|arrival|departure/.test(t)) return '✈'
    if (/hotel|check.?in|accommodation/.test(t)) return '🏨'
    if (/transfer|chauffeur|driver|pickup|shuttle/.test(t)) return '🚘'
    if (/\btrain\b|\brailway\b/.test(t)) return '🚆'
    if (/\bferry\b/.test(t)) return '⛴'
    if (/\bcruise\b/.test(t)) return '🛥'
    if (/\btour\b|sightseeing/.test(t)) return '🗺'
    if (/\bmuseum\b|\bgallery\b/.test(t)) return '🏛'
    if (/restaurant|dinner|lunch|breakfast|dining/.test(t)) return '🍽'
    if (/shopping|market|souk|bazaar/.test(t)) return '🛍'
    if (/\bmeeting\b|conference/.test(t)) return '🤝'
    if (/free time|leisure|relax|\bspa\b|\bpool\b/.test(t)) return '☕'
    return ''
  }

  // Extract optional leading time from activity string: "14:30 Dinner" → { time: "14:30", body: "Dinner" }
  const parseAct = (text: string): { time: string | null; body: string } => {
    const m = text.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)/i)
    if (m) return { time: m[1].trim(), body: m[2].trim() }
    return { time: null, body: text }
  }

  // Compute a display date string from itin.startDate + day offset
  const dayDate = (dayNum: number): string | null => {
    if (!itin.startDate) return null
    try {
      const base = new Date(itin.startDate)
      if (isNaN(base.getTime())) return null
      base.setDate(base.getDate() + dayNum - 1)
      return base.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return null }
  }

  // ── Day editor header (closes over saving/saveError/doneEditing) ──────────
  const DayEditHeader = ({ day }: { day: Day }) => (
    <div className="mb-4 pb-3 border-b border-white/[0.08]">
      <div className="flex items-center justify-between">
        <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">
          ✏️ Editing: Day {day.day}{day.title && day.title !== `Day ${day.day}` ? ` — ${day.title}` : ''}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={doneEditing} disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition disabled:opacity-50">
            {saving ? 'Saving…' : '✓ Done'}
          </button>
          <button type="button" onClick={() => removeDay(day.day)}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition">
            Remove
          </button>
        </div>
      </div>
      {saveError && (
        <p className="mt-2 text-red-400 text-xs flex items-center gap-1.5">
          <span>⚠</span> {saveError}
          <button type="button" onClick={doneEditing} className="underline ml-1 hover:text-red-300 transition">Retry</button>
        </p>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white font-bold text-lg">Day-by-Day Itinerary</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-bold px-4 py-2 rounded-xl text-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            {generating
              ? <><div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" /> Generating…</>
              : '✨ Generate with Jade AI'}
          </button>
          <button type="button" onClick={addDay} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">
            + Add Day
          </button>
        </div>
      </div>

      {/* Jade generation message */}
      {genMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${genMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {genMsg}
        </div>
      )}

      {/* Empty state */}
      {days.length === 0 ? (
        <div className="bg-white/5 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-white/40 mb-2">No days yet</p>
          <p className="text-white/20 text-sm mb-6">Add days manually or let Jade AI generate the full itinerary</p>
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={addDay} className="bg-amber-500 text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-amber-400 transition">+ Add Day</button>
            <button type="button" onClick={handleGenerate} disabled={generating} className="bg-purple-600/20 text-purple-300 border border-purple-500/30 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-purple-600/30 transition">✨ Generate with AI</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dateStr = dayDate(day.day)
            const visibleActivities = day.activities.filter(a => a.trim())
            return (
              <div key={day.day} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl overflow-hidden">

                {/* ── EDIT MODE ─────────────────────────────────────────── */}
                {editingDayId === day.day ? (
                  <div className="p-5 space-y-4">
                    <DayEditHeader day={day} />

                    <div>
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Day Title</label>
                      <input value={day.title} onChange={e => updDay(day.day, 'title', e.target.value)} placeholder={`Day ${day.day} title`} className={inp} />
                    </div>

                    <div>
                      <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Description</label>
                      <textarea value={day.description} onChange={e => updDay(day.day, 'description', e.target.value)} placeholder="What happens on this day…" rows={3} className={ta} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Location / City</label>
                        <input value={day.destination || ''} onChange={e => updDay(day.day, 'destination', e.target.value)} placeholder="e.g. Dubai" className={inp} />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Weather</label>
                        <input value={day.weather || ''} onChange={e => updDay(day.day, 'weather', e.target.value)} placeholder="e.g. Warm 28°C, sunny" className={inp} />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Dress Code</label>
                        <input value={day.dressCode || ''} onChange={e => updDay(day.day, 'dressCode', e.target.value)} placeholder="e.g. Smart casual" className={inp} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider">Activities</label>
                        <button type="button" onClick={() => addActivity(day.day)} className="text-amber-400 text-xs hover:text-amber-300 transition">+ Add</button>
                      </div>
                      <div className="space-y-2">
                        {day.activities.map((act, ai) => (
                          <div key={ai} className="flex gap-2">
                            <input value={act} onChange={e => updActivity(day.day, ai, e.target.value)} placeholder={`Activity ${ai + 1}`} className={inp + ' flex-1'} />
                            <button type="button" onClick={() => removeActivity(day.day, ai)} className="text-white/20 hover:text-red-400 px-2 transition">✕</button>
                          </div>
                        ))}
                        {day.activities.length === 0 && (
                          <button type="button" onClick={() => addActivity(day.day)} className="w-full border border-dashed border-white/10 rounded-xl py-2.5 text-white/20 text-sm hover:border-amber-500/30 hover:text-amber-400/50 transition">
                            + Add activity
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Accommodation</label>
                        <input value={day.accommodation} onChange={e => updDay(day.day, 'accommodation', e.target.value)} placeholder="Hotel name" className={inp} />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Meals</label>
                        <input value={day.meals} onChange={e => updDay(day.day, 'meals', e.target.value)} placeholder="B / L / D" className={inp} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-green-400/70 text-xs font-bold uppercase tracking-wider block mb-1.5">
                          Client Notes <span className="text-white/20 font-normal normal-case">(shown to client)</span>
                        </label>
                        <input value={day.clientNotes || ''} onChange={e => updDay(day.day, 'clientNotes', e.target.value)} placeholder="Tips, highlights shown on the client page…" className={inp} />
                      </div>
                      <div>
                        <label className="text-amber-400/70 text-xs font-bold uppercase tracking-wider block mb-1.5">
                          Internal Notes <span className="text-white/20 font-normal normal-case">(admin only)</span>
                        </label>
                        <input value={day.internalNotes || ''} onChange={e => updDay(day.day, 'internalNotes', e.target.value)} placeholder="Supplier instructions, margins, internal reminders…" className={inp} />
                      </div>
                    </div>
                  </div>

                ) : (
                  /* ── SUMMARY VIEW ──────────────────────────────────────── */
                  <div className="p-5">

                    {/* Header */}
                    <div className="flex items-start gap-4">
                      {/* Day number badge */}
                      <div className="flex-shrink-0 w-12 text-center pt-0.5">
                        <p className="text-amber-500/50 text-[9px] font-bold uppercase tracking-widest leading-none">DAY</p>
                        <p className="text-amber-400 text-2xl font-bold leading-tight">{day.day}</p>
                      </div>

                      {/* Title, date, location */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm leading-snug tracking-wide uppercase">
                          {day.title && day.title !== `Day ${day.day}` ? day.title : `Day ${day.day}`}
                        </p>
                        {dateStr && <p className="text-white/30 text-xs mt-0.5">{dateStr}</p>}
                        {day.destination && (
                          <p className="text-amber-400/60 text-xs mt-0.5 font-medium">📍 {day.destination}</p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveDay(day.day, 'up')}
                          className="text-white/20 hover:text-white/50 w-7 h-7 flex items-center justify-center rounded text-sm hover:bg-white/5 transition"
                          aria-label={`Move day ${day.day} up`}
                        >↑</button>
                        <button
                          type="button"
                          onClick={() => moveDay(day.day, 'down')}
                          className="text-white/20 hover:text-white/50 w-7 h-7 flex items-center justify-center rounded text-sm hover:bg-white/5 transition"
                          aria-label={`Move day ${day.day} down`}
                        >↓</button>
                        <button
                          type="button"
                          aria-expanded={false}
                          onClick={() => { void switchToDay(day.day) }}
                          className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold transition ml-1"
                        >Edit Day</button>
                      </div>
                    </div>

                    {/* Weather + dress badges */}
                    {(day.weather || day.dressCode) && (
                      <div className="flex gap-3 mt-2.5 flex-wrap">
                        {day.weather && <span className="text-white/35 text-xs">🌤 {day.weather}</span>}
                        {day.dressCode && <span className="text-white/35 text-xs">👔 {day.dressCode}</span>}
                      </div>
                    )}

                    {/* Description */}
                    {day.description && (
                      <p className="mt-3 text-white/50 text-sm leading-relaxed line-clamp-3">{day.description}</p>
                    )}

                    {/* Activities timeline */}
                    {visibleActivities.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        {visibleActivities.map((act, i) => {
                          const { time, body } = parseAct(act)
                          const icon = actIcon(act)
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-white/25 text-[10px] font-mono tabular-nums w-10 flex-shrink-0 pt-0.5 text-right leading-none">
                                {time ?? ''}
                              </span>
                              <span className="text-[13px] flex-shrink-0 leading-none pt-px">{icon || '·'}</span>
                              <span className="text-white/65 text-xs leading-relaxed">{body}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Intentional empty day */}
                    {visibleActivities.length === 0 && !day.description && (
                      <div className="mt-3 flex items-center gap-3">
                        <p className="text-white/20 text-sm italic">No activities planned yet.</p>
                        <button
                          type="button"
                          onClick={() => { void switchToDay(day.day) }}
                          className="text-amber-400/50 text-xs hover:text-amber-400 transition"
                        >+ Add plans</button>
                      </div>
                    )}

                    {/* Accommodation + meals footer */}
                    {(day.accommodation || day.meals) && (
                      <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center gap-4 flex-wrap">
                        {day.accommodation && (
                          <span className="text-white/35 text-xs">🏨 {day.accommodation}</span>
                        )}
                        {day.meals && (
                          <span className="text-white/35 text-xs">🍽 {day.meals}</span>
                        )}
                      </div>
                    )}

                    {/* Client note (shown to client, visible in summary) */}
                    {day.clientNotes && (
                      <div className="mt-3 px-3 py-2 bg-green-500/[0.06] border border-green-500/[0.12] rounded-lg">
                        <p className="text-green-400/50 text-[9px] font-bold uppercase tracking-wider mb-0.5">Client Note</p>
                        <p className="text-white/45 text-xs leading-relaxed">{day.clientNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex justify-between mt-6">
        <button type="button" onClick={addDay} className="border border-white/10 text-white/50 px-5 py-2.5 rounded-xl text-sm hover:text-white hover:border-white/20 transition">
          + Add Day
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Itinerary'}
        </button>
      </div>
    </div>
  )
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────

interface SupplierOption { id: string; name: string; type: string }

function SupplierPicker({ value, onChange }: { value: string; onChange: (id: string, name: string) => void }) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => r.json())
      .then((d: { suppliers?: SupplierOption[] }) => setSuppliers(d.suppliers ?? []))
      .catch(() => {})
  }, [])
  return (
    <select
      value={value}
      onChange={e => {
        const s = suppliers.find(s => s.id === e.target.value)
        onChange(e.target.value, s?.name ?? '')
      }}
      className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-400"
    >
      <option value="">— No supplier —</option>
      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
    </select>
  )
}

function BookingsTab({ itin, onSave, onContextChange }: {
  itin: ItineraryData
  onSave: (u: Record<string, unknown>) => Promise<void>
  onContextChange?: (ctx: JadeContext) => void
}) {
  const [bookingTab, setBookingTab] = useState('flights')
  const [flights, setFlights] = useState<Flight[]>(safeParse<Flight[]>(itin.flights, []))
  const [hotels, setHotels] = useState<Hotel[]>(safeParse<Hotel[]>(itin.hotels, []))
  const [transfers, setTransfers] = useState<Transfer[]>(safeParse<Transfer[]>(itin.transfers || '[]', []))
  const [tours, setTours] = useState<Tour[]>(safeParse<Tour[]>(itin.tours || '[]', []))
  const [trains, setTrains] = useState<Train[]>(safeParse<Train[]>(itin.trains || '[]', []))
  const [ferries, setFerries] = useState<Ferry[]>(safeParse<Ferry[]>(itin.ferries || '[]', []))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<{ type: string; id: string } | null>(null)

  // Update Jade context when editing state or booking tab changes
  useEffect(() => {
    if (!onContextChange) return
    if (!editingId) {
      onContextChange({ activeTab: 'bookings', bookingType: bookingTab })
      return
    }
    let summary = ''
    if (editingId.type === 'flight') {
      const f = flights.find(x => x.id === editingId.id)
      if (f) summary = [f.airline, f.flightNumber, f.from && f.to ? `${f.from}→${f.to}` : ''].filter(Boolean).join(' ')
    } else if (editingId.type === 'hotel') {
      const h = hotels.find(x => x.id === editingId.id)
      if (h) summary = h.name
    } else if (editingId.type === 'transfer') {
      const t = transfers.find(x => x.id === editingId.id)
      if (t) summary = [t.from, t.to].filter(Boolean).join(' → ')
    } else if (editingId.type === 'tour') {
      const t = tours.find(x => x.id === editingId.id)
      if (t) summary = t.name
    } else if (editingId.type === 'train') {
      const t = trains.find(x => x.id === editingId.id)
      if (t) summary = [t.from, t.to].filter(Boolean).join(' → ')
    } else if (editingId.type === 'ferry') {
      const f = ferries.find(x => x.id === editingId.id)
      if (f) summary = [f.from, f.to].filter(Boolean).join(' → ')
    }
    onContextChange({ activeTab: 'bookings', bookingType: editingId.type, editingBookingSummary: summary || undefined })
  }, [editingId, bookingTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const sym = CURRENCY_SYM[itin.currency] || ''

  const counts: Record<string, number> = {
    flights: flights.length, hotels: hotels.length, transfers: transfers.length,
    tours: tours.length, trains: trains.length, ferries: ferries.length,
  }

  const isEditing = (type: string, id: string) => editingId?.type === type && editingId?.id === id
  const startEdit = (type: string, id: string) => setEditingId({ type, id })

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({
        flights: JSON.stringify(flights),
        hotels: JSON.stringify(hotels),
        transfers: JSON.stringify(transfers),
        tours: JSON.stringify(tours),
        trains: JSON.stringify(trains),
        ferries: JSON.stringify(ferries),
      })
    } catch (e) {
      setSaveError('Save failed — check your connection and try again.')
      throw e
    } finally {
      setSaving(false)
    }
  }

  const doneEditing = async () => {
    try { await handleSave(); setEditingId(null) } catch { /* saveError is set; editor stays open */ }
  }

  // ── Flights ──────────────────────────────────────────────────────────────

  const addFlight = () => {
    const newId = uid()
    setFlights(prev => [...prev, {
      id: newId, from: '', to: '', airline: '', iataCode: '', flightNumber: '',
      date: '', time: '', arrivalTime: '', class: 'Economy', pnr: '',
      cost: null, supplierCost: null, status: 'confirmed', notes: '',
      supplierId: '', duffelOrderId: '',
    }])
    setEditingId({ type: 'flight', id: newId })
  }
  const updFlight = (id: string, f: keyof Flight, v: unknown) => setFlights(prev => prev.map(fl => fl.id === id ? { ...fl, [f]: v } : fl))
  const rmFlight = (id: string) => { if (!window.confirm('Remove this flight? This cannot be undone until you cancel without saving.')) return; setFlights(prev => prev.filter(fl => fl.id !== id)); setEditingId(null) }

  // ── Hotels ───────────────────────────────────────────────────────────────

  const addHotel = () => {
    const newId = uid()
    setHotels(prev => [...prev, {
      id: newId, name: '', location: '', websiteUrl: '', checkIn: '', checkOut: '',
      roomType: '', nights: 1, cost: null, supplierCost: null, status: 'confirmed',
      notes: '', image: '', images: [], supplierId: '', hotelbedsCancellationReference: '',
    }])
    setEditingId({ type: 'hotel', id: newId })
  }
  const updHotel = (id: string, f: keyof Hotel, v: unknown) => setHotels(prev => prev.map(h => h.id === id ? { ...h, [f]: v } : h))
  const rmHotel = (id: string) => { if (!window.confirm('Remove this hotel? This cannot be undone until you cancel without saving.')) return; setHotels(prev => prev.filter(h => h.id !== id)); setEditingId(null) }

  // ── Transfers ────────────────────────────────────────────────────────────

  const addTransfer = () => {
    const newId = uid()
    setTransfers(prev => [...prev, {
      id: newId, type: 'Private Car', from: '', to: '', date: '', time: '',
      vehicle: '', provider: '', cost: null, supplierCost: null, notes: '', image: '', images: [], supplierId: '',
    }])
    setEditingId({ type: 'transfer', id: newId })
  }
  const updTransfer = (id: string, f: keyof Transfer, v: unknown) => setTransfers(prev => prev.map(t => t.id === id ? { ...t, [f]: v } : t))
  const rmTransfer = (id: string) => { if (!window.confirm('Remove this transfer? This cannot be undone until you cancel without saving.')) return; setTransfers(prev => prev.filter(t => t.id !== id)); setEditingId(null) }

  // ── Tours ─────────────────────────────────────────────────────────────────

  const addTour = () => {
    const newId = uid()
    setTours(prev => [...prev, {
      id: newId, name: '', location: '', date: '', time: '',
      duration: '', provider: '', cost: null, supplierCost: null, notes: '', image: '', images: [], supplierId: '',
    }])
    setEditingId({ type: 'tour', id: newId })
  }
  const updTour = (id: string, f: keyof Tour, v: unknown) => setTours(prev => prev.map(t => t.id === id ? { ...t, [f]: v } : t))
  const rmTour = (id: string) => { if (!window.confirm('Remove this tour? This cannot be undone until you cancel without saving.')) return; setTours(prev => prev.filter(t => t.id !== id)); setEditingId(null) }

  // ── Trains ────────────────────────────────────────────────────────────────

  const addTrain = () => {
    const newId = uid()
    setTrains(prev => [...prev, {
      id: newId, from: '', to: '', date: '', departureTime: '', arrivalTime: '',
      trainNumber: '', class: 'Standard', provider: '', pnr: '',
      cost: null, supplierCost: null, notes: '', image: '', supplierId: '',
    }])
    setEditingId({ type: 'train', id: newId })
  }
  const updTrain = (id: string, f: keyof Train, v: unknown) => setTrains(prev => prev.map(t => t.id === id ? { ...t, [f]: v } : t))
  const rmTrain = (id: string) => { if (!window.confirm('Remove this train? This cannot be undone until you cancel without saving.')) return; setTrains(prev => prev.filter(t => t.id !== id)); setEditingId(null) }

  // ── Ferries ───────────────────────────────────────────────────────────────

  const addFerry = () => {
    const newId = uid()
    setFerries(prev => [...prev, {
      id: newId, from: '', to: '', date: '', departureTime: '', arrivalTime: '',
      operator: '', class: 'Standard', vessel: '',
      cost: null, supplierCost: null, notes: '', image: '', supplierId: '',
    }])
    setEditingId({ type: 'ferry', id: newId })
  }
  const updFerry = (id: string, f: keyof Ferry, v: unknown) => setFerries(prev => prev.map(fe => fe.id === id ? { ...fe, [f]: v } : fe))
  const rmFerry = (id: string) => { if (!window.confirm('Remove this ferry? This cannot be undone until you cancel without saving.')) return; setFerries(prev => prev.filter(fe => fe.id !== id)); setEditingId(null) }

  // ── Shared card primitives ────────────────────────────────────────────────

  const editBtnCls = 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold transition'
  const rmBtnCls   = 'text-white/20 hover:text-red-400 text-xs transition px-3 py-1.5 rounded-lg hover:bg-red-500/10'

  const MarginPill = ({ cost, supplierCost: sc }: { cost: number | null; supplierCost: number | null }) => {
    if (cost == null || sc == null || cost <= 0 || sc <= 0) return null
    const m = cost - sc; const pct = Math.round((m / cost) * 100)
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{m >= 0 ? '+' : ''}{sym}{m.toLocaleString()} ({pct}%)</span>
  }

  const SBadge = ({ status }: { status: string }) => {
    const cls = status === 'confirmed' ? 'bg-green-500/15 text-green-400'
      : status === 'pending' ? 'bg-amber-500/15 text-amber-400'
      : status === 'cancelled' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/40'
    return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
  }

  const EditHeader = ({ label, onDone, onRemove }: { label: string; onDone: () => void; onRemove: () => void }) => (
    <div className="mb-4 pb-3 border-b border-white/[0.08]">
      <div className="flex items-center justify-between">
        <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">✏️ Editing: {label}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition disabled:opacity-50">
            {saving ? 'Saving…' : '✓ Done'}
          </button>
          <button type="button" onClick={onRemove} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition">
            Remove
          </button>
        </div>
      </div>
      {saveError && (
        <p className="mt-2 text-red-400 text-xs flex items-center gap-1.5">
          <span>⚠</span> {saveError}
          <button type="button" onClick={onDone} className="underline ml-1 hover:text-red-300 transition">Retry</button>
        </p>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl">
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {BOOKING_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setBookingTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
              bookingTab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
            {counts[t.id] > 0 && (
              <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Flights Section ─────────────────────────────────────────────────── */}
      {bookingTab === 'flights' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">✈️ Flights</h2>
            <button onClick={addFlight} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Flight</button>
          </div>
          {flights.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">✈️</p>
              <p className="text-white/20 text-sm mb-3">No flights added yet</p>
              <button onClick={addFlight} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first flight</button>
            </div>
          ) : (
            <div className="space-y-3">
              {flights.map(f => (
                <div key={f.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('flight', f.id) ? (
                    <div className="p-4">
                      <EditHeader
                        label={f.airline && f.flightNumber ? `${f.airline} ${f.flightNumber}` : 'New Flight'}
                        onDone={doneEditing}
                        onRemove={() => rmFlight(f.id)}
                      />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From</label><input value={f.from} onChange={e => updFlight(f.id, 'from', e.target.value)} placeholder="LHR" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To</label><input value={f.to} onChange={e => updFlight(f.id, 'to', e.target.value)} placeholder="DXB" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label><input type="date" value={f.date} onChange={e => updFlight(f.id, 'date', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Departs</label><input type="time" value={f.time} onChange={e => updFlight(f.id, 'time', e.target.value)} className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Airline</label><input value={f.airline} onChange={e => updFlight(f.id, 'airline', e.target.value)} placeholder="Emirates" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">IATA Code</label><input value={f.iataCode} onChange={e => updFlight(f.id, 'iataCode', e.target.value.toUpperCase())} placeholder="EK" maxLength={3} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Flight No.</label><input value={f.flightNumber} onChange={e => updFlight(f.id, 'flightNumber', e.target.value)} placeholder="EK001" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Arrives</label><input type="time" value={f.arrivalTime} onChange={e => updFlight(f.id, 'arrivalTime', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Class</label><select value={f.class} onChange={e => updFlight(f.id, 'class', e.target.value)} className={sel}><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First Class</option></select></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">PNR</label><input value={f.pnr} onChange={e => updFlight(f.id, 'pnr', e.target.value)} placeholder="ABC123" className={inp} /></div>
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={f.cost ?? ''} onChange={e => updFlight(f.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={f.supplierCost ?? ''} onChange={e => updFlight(f.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={f.notes} onChange={e => updFlight(f.id, 'notes', e.target.value)} placeholder="Baggage, meals…" className={inp} /></div>
                      </div>
                      <div className="mt-2"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Supplier</label><SupplierPicker value={f.supplierId} onChange={(id, name) => { updFlight(f.id, 'supplierId', id); updFlight(f.id, 'airline', name || f.airline) }} /></div>
                      {(f.cost != null && f.supplierCost != null && f.cost > 0 && f.supplierCost > 0) && (
                        <div className="mt-2 px-3 py-2 bg-white/[0.03] rounded-lg flex items-center gap-4 text-xs">
                          <span className="text-white/40">Margin:</span>
                          <span className={`font-bold ${(f.cost - f.supplierCost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{sym}{(f.cost - f.supplierCost).toLocaleString()} ({f.supplierCost > 0 ? Math.round(((f.cost - f.supplierCost) / f.cost) * 100) : 0}%)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-[72px] flex items-center justify-center">
                        {f.iataCode
                          ? <img src={`https://content.airhex.com/content/logos/airlines_${f.iataCode.toUpperCase()}_350_100_r.png`} alt={f.airline || f.iataCode} className="h-9 max-w-[72px] object-contain bg-white rounded-lg px-2 py-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <span className="text-3xl">✈️</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white font-bold text-sm">{f.airline || 'Airline'} {f.flightNumber}</span>
                          {f.status && <SBadge status={f.status} />}
                        </div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-white font-semibold text-sm font-mono">{f.from || '—'}</span>
                          <span className="text-white/30 text-xs">──✈──</span>
                          <span className="text-white font-semibold text-sm font-mono">{f.to || '—'}</span>
                          {(f.time || f.arrivalTime) && <span className="text-white/40 text-xs ml-1">{f.time}{f.arrivalTime ? ` → ${f.arrivalTime}` : ''}</span>}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {f.date && <span className="text-white/40 text-xs">{fmtDate(f.date)}</span>}
                          {f.class && <span className="text-white/40 text-xs">{f.class}</span>}
                          {f.pnr && <span className="text-white/30 text-xs font-mono">PNR: {f.pnr}</span>}
                          {f.cost != null && f.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{f.cost.toLocaleString()}</span>}
                          <MarginPill cost={f.cost} supplierCost={f.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('flight', f.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmFlight(f.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Hotels Section ──────────────────────────────────────────────────── */}
      {bookingTab === 'hotels' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">🏨 Hotels</h2>
            <button onClick={addHotel} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Hotel</button>
          </div>
          {hotels.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">🏨</p>
              <p className="text-white/20 text-sm mb-3">No hotels added yet</p>
              <button onClick={addHotel} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first hotel</button>
            </div>
          ) : (
            <div className="space-y-3">
              {hotels.map(h => (
                <div key={h.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('hotel', h.id) ? (
                    <div className="p-4">
                      <EditHeader label={h.name || 'New Hotel'} onDone={doneEditing} onRemove={() => rmHotel(h.id)} />
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Hotel Name</label><input value={h.name} onChange={e => updHotel(h.id, 'name', e.target.value)} placeholder="Burj Al Arab" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Location</label><input value={h.location} onChange={e => updHotel(h.id, 'location', e.target.value)} placeholder="Dubai, UAE" className={inp} /></div>
                      </div>
                      <div className="mb-3"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Hotel Website URL</label><input value={h.websiteUrl} onChange={e => updHotel(h.id, 'websiteUrl', e.target.value)} placeholder="https://www.burjalarab.com" className={inp} /></div>
                      <MultiImageGallery itinId={itin.id} itemType="hotel" itemId={h.id} images={h.images ?? (h.image ? [h.image] : [])} websiteUrl={h.websiteUrl} destination={h.location || itin.destination} onImagesChange={imgs => { updHotel(h.id, 'images', imgs); updHotel(h.id, 'image', imgs[0] ?? '') }} autoSave={handleSave} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Check-In</label><input type="date" value={h.checkIn} onChange={e => updHotel(h.id, 'checkIn', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Check-Out</label><input type="date" value={h.checkOut} onChange={e => updHotel(h.id, 'checkOut', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Nights</label><input type="number" min="1" value={h.nights} onChange={e => updHotel(h.id, 'nights', Number(e.target.value))} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Room Type</label><input value={h.roomType} onChange={e => updHotel(h.id, 'roomType', e.target.value)} placeholder="Deluxe Suite" className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={h.cost ?? ''} onChange={e => updHotel(h.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={h.supplierCost ?? ''} onChange={e => updHotel(h.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={h.notes} onChange={e => updHotel(h.id, 'notes', e.target.value)} placeholder="Breakfast included, pool view…" className={inp} /></div>
                      </div>
                      <div className="mt-2"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Supplier</label><SupplierPicker value={h.supplierId} onChange={(id) => updHotel(h.id, 'supplierId', id)} /></div>
                      {(h.cost != null && h.supplierCost != null && h.cost > 0 && h.supplierCost > 0) && (
                        <div className="mt-2 px-3 py-2 bg-white/[0.03] rounded-lg flex items-center gap-4 text-xs">
                          <span className="text-white/40">Margin:</span>
                          <span className={`font-bold ${(h.cost - h.supplierCost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{sym}{(h.cost - h.supplierCost).toLocaleString()} ({h.cost > 0 ? Math.round(((h.cost - h.supplierCost) / h.cost) * 100) : 0}%)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white/10">
                        {(h.image || (h.images && h.images[0]))
                          ? <img src={h.image || h.images![0]} alt={h.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-full h-full flex items-center justify-center text-2xl">🏨</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white font-bold text-sm">{h.name || 'Hotel'}</span>
                          {h.status && <SBadge status={h.status} />}
                        </div>
                        {h.location && <p className="text-white/50 text-xs mb-1">{h.location}</p>}
                        <div className="flex items-center gap-3 flex-wrap">
                          {(h.checkIn || h.checkOut) && <span className="text-white/40 text-xs">{fmtDate(h.checkIn)} → {fmtDate(h.checkOut)}{h.nights ? ` · ${h.nights}n` : ''}</span>}
                          {h.roomType && <span className="text-white/40 text-xs">{h.roomType}</span>}
                          {h.cost != null && h.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{h.cost.toLocaleString()}</span>}
                          <MarginPill cost={h.cost} supplierCost={h.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('hotel', h.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmHotel(h.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Transfers Section ───────────────────────────────────────────────── */}
      {bookingTab === 'transfers' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">🚗 Transfers</h2>
            <button onClick={addTransfer} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Transfer</button>
          </div>
          {transfers.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">🚗</p>
              <p className="text-white/20 text-sm mb-3">No transfers added yet</p>
              <button onClick={addTransfer} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first transfer</button>
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map(t => (
                <div key={t.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('transfer', t.id) ? (
                    <div className="p-4">
                      <EditHeader label={t.from && t.to ? `${t.from} → ${t.to}` : 'New Transfer'} onDone={doneEditing} onRemove={() => rmTransfer(t.id)} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Type</label><select value={t.type} onChange={e => updTransfer(t.id, 'type', e.target.value)} className={sel}><option>Private Car</option><option>Taxi</option><option>Shuttle</option><option>Minibus</option><option>Coach</option><option>Limousine</option><option>Airport Transfer</option></select></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From</label><input value={t.from} onChange={e => updTransfer(t.id, 'from', e.target.value)} placeholder="Airport / Hotel" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To</label><input value={t.to} onChange={e => updTransfer(t.id, 'to', e.target.value)} placeholder="Hotel / Venue" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label><input type="date" value={t.date} onChange={e => updTransfer(t.id, 'date', e.target.value)} className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Time</label><input type="time" value={t.time} onChange={e => updTransfer(t.id, 'time', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Vehicle</label><input value={t.vehicle} onChange={e => updTransfer(t.id, 'vehicle', e.target.value)} placeholder="Mercedes V-Class" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Provider</label><input value={t.provider} onChange={e => updTransfer(t.id, 'provider', e.target.value)} placeholder="Company name" className={inp} /></div>
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={t.cost ?? ''} onChange={e => updTransfer(t.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={t.supplierCost ?? ''} onChange={e => updTransfer(t.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={t.notes} onChange={e => updTransfer(t.id, 'notes', e.target.value)} placeholder="Meet & greet, sign…" className={inp} /></div>
                      </div>
                      <MultiImageGallery itinId={itin.id} itemType="transfer" itemId={t.id} images={t.images ?? (t.image ? [t.image] : [])} destination={t.from || itin.destination} onImagesChange={imgs => { updTransfer(t.id, 'images', imgs); updTransfer(t.id, 'image', imgs[0] ?? '') }} autoSave={handleSave} />
                      <div className="mt-2"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Supplier</label><SupplierPicker value={t.supplierId} onChange={(id) => updTransfer(t.id, 'supplierId', id)} /></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">
                        {t.type === 'Shuttle' || t.type === 'Minibus' || t.type === 'Coach' ? '🚌' : t.type === 'Airport Transfer' ? '🛫' : '🚗'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white font-bold text-sm">{t.type || 'Transfer'}</span>
                          {t.date && <span className="text-white/40 text-xs">{fmtDate(t.date)}{t.time ? ` · ${t.time}` : ''}</span>}
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white/70 text-sm">{t.from || '—'}</span>
                          <span className="text-white/30 text-xs">→</span>
                          <span className="text-white/70 text-sm">{t.to || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {t.vehicle && <span className="text-white/40 text-xs">{t.vehicle}</span>}
                          {t.provider && <span className="text-white/40 text-xs">{t.provider}</span>}
                          {t.cost != null && t.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{t.cost.toLocaleString()}</span>}
                          <MarginPill cost={t.cost} supplierCost={t.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('transfer', t.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmTransfer(t.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tours / Activities Section ──────────────────────────────────────── */}
      {bookingTab === 'tours' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">🎭 Tours &amp; Activities</h2>
            <button onClick={addTour} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Tour</button>
          </div>
          {tours.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">🎭</p>
              <p className="text-white/20 text-sm mb-3">No tours or activities added yet</p>
              <button onClick={addTour} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first tour</button>
            </div>
          ) : (
            <div className="space-y-3">
              {tours.map(t => (
                <div key={t.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('tour', t.id) ? (
                    <div className="p-4">
                      <EditHeader label={t.name || 'New Tour'} onDone={doneEditing} onRemove={() => rmTour(t.id)} />
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Tour / Activity Name</label><input value={t.name} onChange={e => updTour(t.id, 'name', e.target.value)} placeholder="Desert Safari" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Location</label><input value={t.location} onChange={e => updTour(t.id, 'location', e.target.value)} placeholder="Dubai Desert" className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label><input type="date" value={t.date} onChange={e => updTour(t.id, 'date', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Time</label><input type="time" value={t.time} onChange={e => updTour(t.id, 'time', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Duration</label><input value={t.duration} onChange={e => updTour(t.id, 'duration', e.target.value)} placeholder="3 hours" className={inp} /></div>
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={t.cost ?? ''} onChange={e => updTour(t.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Provider</label><input value={t.provider} onChange={e => updTour(t.id, 'provider', e.target.value)} placeholder="Tour operator" className={inp} /></div>
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={t.supplierCost ?? ''} onChange={e => updTour(t.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div className="col-span-2"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={t.notes} onChange={e => updTour(t.id, 'notes', e.target.value)} placeholder="What's included…" className={inp} /></div>
                      </div>
                      <div className="mt-2"><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Supplier</label><SupplierPicker value={t.supplierId} onChange={(id) => updTour(t.id, 'supplierId', id)} /></div>
                      <MultiImageGallery itinId={itin.id} itemType="tour" itemId={t.id} images={t.images ?? (t.image ? [t.image] : [])} destination={t.location || itin.destination} onImagesChange={imgs => { updTour(t.id, 'images', imgs); updTour(t.id, 'image', imgs[0] ?? '') }} autoSave={handleSave} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white/10">
                        {(t.image || (t.images && t.images[0]))
                          ? <img src={t.image || t.images![0]} alt={t.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-full h-full flex items-center justify-center text-2xl">🎭</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm mb-0.5">{t.name || 'Tour / Activity'}</p>
                        {t.location && <p className="text-white/50 text-xs mb-1">{t.location}</p>}
                        <div className="flex items-center gap-3 flex-wrap">
                          {t.date && <span className="text-white/40 text-xs">{fmtDate(t.date)}{t.time ? ` · ${t.time}` : ''}</span>}
                          {t.duration && <span className="text-white/40 text-xs">{t.duration}</span>}
                          {t.provider && <span className="text-white/40 text-xs">{t.provider}</span>}
                          {t.cost != null && t.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{t.cost.toLocaleString()}</span>}
                          <MarginPill cost={t.cost} supplierCost={t.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('tour', t.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmTour(t.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Trains Section ──────────────────────────────────────────────────── */}
      {bookingTab === 'trains' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">🚂 Trains</h2>
            <button onClick={addTrain} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Train</button>
          </div>
          {trains.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">🚂</p>
              <p className="text-white/20 text-sm mb-3">No train journeys added yet</p>
              <button onClick={addTrain} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first train</button>
            </div>
          ) : (
            <div className="space-y-3">
              {trains.map(t => (
                <div key={t.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('train', t.id) ? (
                    <div className="p-4">
                      <EditHeader label={t.from && t.to ? `${t.from} → ${t.to}` : 'New Train'} onDone={doneEditing} onRemove={() => rmTrain(t.id)} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From</label><input value={t.from} onChange={e => updTrain(t.id, 'from', e.target.value)} placeholder="London St Pancras" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To</label><input value={t.to} onChange={e => updTrain(t.id, 'to', e.target.value)} placeholder="Paris Gare du Nord" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label><input type="date" value={t.date} onChange={e => updTrain(t.id, 'date', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Departs</label><input type="time" value={t.departureTime} onChange={e => updTrain(t.id, 'departureTime', e.target.value)} className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Arrives</label><input type="time" value={t.arrivalTime} onChange={e => updTrain(t.id, 'arrivalTime', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Train / Service</label><input value={t.trainNumber} onChange={e => updTrain(t.id, 'trainNumber', e.target.value)} placeholder="9028" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Operator</label><input value={t.provider} onChange={e => updTrain(t.id, 'provider', e.target.value)} placeholder="Eurostar" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Class</label><select value={t.class} onChange={e => updTrain(t.id, 'class', e.target.value)} className={sel}><option>Standard</option><option>Standard Premier</option><option>Business Premier</option><option>First Class</option></select></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">PNR / Ref</label><input value={t.pnr} onChange={e => updTrain(t.id, 'pnr', e.target.value)} placeholder="Booking ref" className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={t.cost ?? ''} onChange={e => updTrain(t.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={t.supplierCost ?? ''} onChange={e => updTrain(t.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={t.notes} onChange={e => updTrain(t.id, 'notes', e.target.value)} placeholder="Seat number, coach…" className={inp} /></div>
                      </div>
                      <ImageField value={t.image} onChange={v => updTrain(t.id, 'image', v)} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">🚂</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white font-bold text-sm">{t.from || '—'}</span>
                          <span className="text-white/30 text-xs">→</span>
                          <span className="text-white font-bold text-sm">{t.to || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {t.date && <span className="text-white/40 text-xs">{fmtDate(t.date)}</span>}
                          {(t.departureTime || t.arrivalTime) && <span className="text-white/40 text-xs">{t.departureTime}{t.arrivalTime ? ` → ${t.arrivalTime}` : ''}</span>}
                          {(t.provider || t.trainNumber) && <span className="text-white/40 text-xs">{t.provider}{t.trainNumber ? ` ${t.trainNumber}` : ''}</span>}
                          {t.class && <span className="text-white/40 text-xs">{t.class}</span>}
                          {t.cost != null && t.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{t.cost.toLocaleString()}</span>}
                          <MarginPill cost={t.cost} supplierCost={t.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('train', t.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmTrain(t.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Ferries Section ─────────────────────────────────────────────────── */}
      {bookingTab === 'ferries' && (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base">⛴️ Ferries</h2>
            <button onClick={addFerry} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Ferry</button>
          </div>
          {ferries.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-5xl mb-3">⛴️</p>
              <p className="text-white/20 text-sm mb-3">No ferry crossings added yet</p>
              <button onClick={addFerry} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first ferry</button>
            </div>
          ) : (
            <div className="space-y-3">
              {ferries.map(fe => (
                <div key={fe.id} className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
                  {isEditing('ferry', fe.id) ? (
                    <div className="p-4">
                      <EditHeader label={fe.from && fe.to ? `${fe.from} → ${fe.to}` : 'New Ferry'} onDone={doneEditing} onRemove={() => rmFerry(fe.id)} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From</label><input value={fe.from} onChange={e => updFerry(fe.id, 'from', e.target.value)} placeholder="Port / City" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To</label><input value={fe.to} onChange={e => updFerry(fe.id, 'to', e.target.value)} placeholder="Port / City" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Date</label><input type="date" value={fe.date} onChange={e => updFerry(fe.id, 'date', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Departs</label><input type="time" value={fe.departureTime} onChange={e => updFerry(fe.id, 'departureTime', e.target.value)} className={inp} /></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Arrives</label><input type="time" value={fe.arrivalTime} onChange={e => updFerry(fe.id, 'arrivalTime', e.target.value)} className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Operator</label><input value={fe.operator} onChange={e => updFerry(fe.id, 'operator', e.target.value)} placeholder="Stena Line" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Vessel</label><input value={fe.vessel} onChange={e => updFerry(fe.id, 'vessel', e.target.value)} placeholder="MS Britannica" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Class</label><select value={fe.class} onChange={e => updFerry(fe.id, 'class', e.target.value)} className={sel}><option>Standard</option><option>Club Class</option><option>Premium</option><option>Private Cabin</option></select></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label><input type="number" value={fe.cost ?? ''} onChange={e => updFerry(fe.id, 'cost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label><input type="number" value={fe.supplierCost ?? ''} onChange={e => updFerry(fe.id, 'supplierCost', e.target.value ? Number(e.target.value) : null)} placeholder="0.00" className={inp} /></div>
                        <div><label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label><input value={fe.notes} onChange={e => updFerry(fe.id, 'notes', e.target.value)} placeholder="Cabin type, vehicle…" className={inp} /></div>
                      </div>
                      <ImageField value={fe.image} onChange={v => updFerry(fe.id, 'image', v)} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">⛴️</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white font-bold text-sm">{fe.from || '—'}</span>
                          <span className="text-white/30 text-xs">→</span>
                          <span className="text-white font-bold text-sm">{fe.to || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {fe.date && <span className="text-white/40 text-xs">{fmtDate(fe.date)}</span>}
                          {(fe.departureTime || fe.arrivalTime) && <span className="text-white/40 text-xs">{fe.departureTime}{fe.arrivalTime ? ` → ${fe.arrivalTime}` : ''}</span>}
                          {fe.operator && <span className="text-white/40 text-xs">{fe.operator}</span>}
                          {fe.vessel && <span className="text-white/40 text-xs">{fe.vessel}</span>}
                          {fe.class && <span className="text-white/40 text-xs">{fe.class}</span>}
                          {fe.cost != null && fe.cost > 0 && <span className="text-green-400 text-xs font-bold">{sym}{fe.cost.toLocaleString()}</span>}
                          <MarginPill cost={fe.cost} supplierCost={fe.supplierCost} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button type="button" aria-expanded={false} onClick={() => startEdit('ferry', fe.id)} className={editBtnCls}>Edit</button>
                        <button type="button" onClick={() => rmFerry(fe.id)} className={rmBtnCls}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save All Bookings'}
        </button>
      </div>
    </div>
  )
}

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

function PricingTab({ itin, onSave }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void> }) {
  const [rows, setRows] = useState<PriceRow[]>(safeParse<PriceRow[]>(itin.priceBreakdown, []))
  const [totalPrice, setTotalPrice] = useState<string>(itin.totalPrice != null ? String(itin.totalPrice) : '')
  const [deposit, setDeposit] = useState<string>(itin.deposit != null ? String(itin.deposit) : '')
  const [depositDue, setDepositDue] = useState(itin.depositDue ? itin.depositDue.split('T')[0] : '')
  const [balanceDue, setBalanceDue] = useState(itin.balanceDue ? itin.balanceDue.split('T')[0] : '')
  const [saving, setSaving] = useState(false)

  const sym = CURRENCY_SYM[itin.currency] || ''
  const autoTotal = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0)

  const addRow = () => setRows(prev => [...prev, { id: uid(), item: '', description: '', cost: 0 }])
  const updRow = (id: string, field: keyof PriceRow, value: unknown) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))
  const useAutoTotal = () => setTotalPrice(String(autoTotal))

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      priceBreakdown: JSON.stringify(rows),
      totalPrice: totalPrice !== '' ? Number(totalPrice) : null,
      deposit: deposit !== '' ? Number(deposit) : null,
      depositDue: depositDue || null,
      balanceDue: balanceDue || null,
    })
    setSaving(false)
  }

  const pricingSnap = parseSnap(itin.selectedOption)
  const currentTotal = totalPrice !== '' ? Number(totalPrice) : (autoTotal > 0 ? autoTotal : null)
  const acceptedTotalNum = pricingSnap?.acceptedTotal ?? null
  const hasDivergence = itin.status === 'approved' && acceptedTotalNum != null && currentTotal != null && Math.abs(acceptedTotalNum - currentTotal) > 0.01

  return (
    <div className="max-w-3xl space-y-6">
      {/* Accepted total + divergence warning — approved itineraries only */}
      {itin.status === 'approved' && pricingSnap?.acceptedBy && (
        <div className={`rounded-2xl p-5 border ${hasDivergence ? 'bg-amber-500/10 border-amber-500/30' : 'bg-green-500/10 border-green-500/25'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${hasDivergence ? 'text-amber-400' : 'text-green-400'}`}>
                {hasDivergence ? '⚠️ Price Divergence' : '✅ Accepted Total'}
              </p>
              <p className="text-white/50 text-xs">
                {pricingSnap.acceptedBy} accepted {pricingSnap.acceptedAt ? `on ${fmtDate(pricingSnap.acceptedAt)}` : 'this proposal'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">Accepted</p>
              <p className="text-amber-400 font-bold text-lg">{sym}{acceptedTotalNum != null ? Number(acceptedTotalNum).toLocaleString() : '—'}</p>
            </div>
          </div>
          {hasDivergence && currentTotal != null && (
            <div className="mt-3 pt-3 border-t border-amber-500/20 flex justify-between items-center">
              <p className="text-amber-300/70 text-xs">Any billing must use the accepted total, not the current figure.</p>
              <div className="text-right text-xs">
                <p className="text-white/30">Current: {sym}{Number(currentTotal).toLocaleString()}</p>
                <p className="text-amber-400 font-semibold">Accepted: {sym}{Number(acceptedTotalNum).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-base">Price Breakdown</h2>
          <button onClick={addRow} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-4 py-2 rounded-xl text-sm transition">+ Add Item</button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/20 text-sm mb-3">No pricing items yet</p>
            <button onClick={addRow} className="text-amber-400 text-sm hover:text-amber-300 transition">+ Add first item</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 mb-2 px-1">
              <p className="col-span-4 text-white/30 text-xs font-bold uppercase tracking-wider">Item</p>
              <p className="col-span-5 text-white/30 text-xs font-bold uppercase tracking-wider">Description</p>
              <p className="col-span-2 text-white/30 text-xs font-bold uppercase tracking-wider text-right">Cost</p>
              <p className="col-span-1" />
            </div>
            {rows.map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4">
                  <input value={r.item} onChange={e => updRow(r.id, 'item', e.target.value)} placeholder="e.g. Return Flights" className={inp} />
                </div>
                <div className="col-span-5">
                  <input value={r.description} onChange={e => updRow(r.id, 'description', e.target.value)} placeholder="Per person, economy…" className={inp} />
                </div>
                <div className="col-span-2">
                  <input type="number" value={r.cost} onChange={e => updRow(r.id, 'cost', Number(e.target.value))} placeholder="0" className={inp + ' text-right'} />
                </div>
                <div className="col-span-1 flex justify-center">
                  <button onClick={() => removeRow(r.id)} className="text-white/20 hover:text-red-400 transition">✕</button>
                </div>
              </div>
            ))}
            <div className="border-t border-white/10 mt-3 pt-3 flex justify-between items-center">
              <button onClick={useAutoTotal} className="text-amber-400 text-xs hover:text-amber-300 transition">← Use auto-total</button>
              <p className="text-white font-bold">Subtotal: {sym}{autoTotal.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-5">Payment Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Total Price ({sym})</label>
            <div className="relative">
              <input type="number" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} placeholder={`Auto: ${autoTotal.toLocaleString()}`} className={inp} />
              {totalPrice === '' && autoTotal > 0 && (
                <button onClick={useAutoTotal} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-xs hover:text-amber-300 transition px-1">
                  Use {sym}{autoTotal.toLocaleString()}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Deposit Amount ({sym})</label>
            <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="Optional" className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Deposit Due Date</label>
            <input type="date" value={depositDue} onChange={e => setDepositDue(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Balance Due Date</label>
            <input type="date" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} className={inp} />
          </div>
        </div>

        {(totalPrice || autoTotal > 0) && (
          <div className="mt-5 bg-[#0B1F3A] rounded-xl p-4 flex items-center justify-between">
            <span className="text-white font-bold">Total</span>
            <span className="text-amber-400 font-bold text-xl">{sym}{Number(totalPrice || autoTotal).toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Pricing'}
        </button>
      </div>

      <PackageOptionsEditor itinId={itin.id} currency={itin.currency || 'GBP'} />
      <PaymentScheduleEditor itinId={itin.id} currency={itin.currency || 'GBP'} />
    </div>
  )
}

// ─── Margin Tab ───────────────────────────────────────────────────────────────

type MarginRow = {
  category: string
  description: string
  client_price: number | null
  supplier_cost: number | null
}

function MarginTab({ itin }: { itin: ItineraryData }) {
  const [rows, setRows]       = useState<MarginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const sym = CURRENCY_SYM[itin.currency] || ''

  useEffect(() => {
    fetch(`/api/admin/itineraries/${itin.id}/margin`)
      .then(r => r.json())
      .then((d: { rows?: MarginRow[]; error?: string }) => {
        if (d.rows) setRows(d.rows)
        else setError(d.error ?? 'Failed to load margin data')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [itin.id])

  const totalClient   = rows.reduce((s, r) => s + (r.client_price  ?? 0), 0)
  const totalSupplier = rows.reduce((s, r) => s + (r.supplier_cost ?? 0), 0)
  const totalMargin   = totalClient - totalSupplier
  const marginPct     = totalClient > 0 ? Math.round((totalMargin / totalClient) * 100) : 0

  const fmt = (n: number | null) => n == null ? '—' : `${sym}${n.toLocaleString()}`

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-white/30">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mr-3" /> Loading…
    </div>
  )

  if (error) return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-400 text-sm">{error}</div>
  )

  return (
    <div className="max-w-4xl">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Client Revenue', value: totalClient,   color: 'text-amber-400' },
          { label: 'Supplier Cost',  value: totalSupplier, color: 'text-red-400' },
          { label: 'Gross Margin',   value: totalMargin,   color: totalMargin >= 0 ? 'text-green-400' : 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{sym}{value.toLocaleString()}</p>
            {label === 'Gross Margin' && <p className="text-white/30 text-xs mt-1">{marginPct}% of revenue</p>}
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-10 text-center">
          <p className="text-white/30 text-sm">No booking costs recorded yet.</p>
          <p className="text-white/20 text-xs mt-1">Add supplier costs to your flights, hotels, transfers, tours, trains and ferries to see margins here.</p>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">Category</th>
                <th className="text-left text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">Description</th>
                <th className="text-right text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">Client Price</th>
                <th className="text-right text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">Supplier Cost</th>
                <th className="text-right text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">Margin</th>
                <th className="text-right text-white/30 text-xs uppercase tracking-wider px-5 py-3 font-normal">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cp = r.client_price  ?? 0
                const sc = r.supplier_cost ?? 0
                const mg = cp - sc
                const pct = cp > 0 ? Math.round((mg / cp) * 100) : null
                return (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400/70">{r.category}</span>
                    </td>
                    <td className="px-5 py-3 text-white/70">{r.description || '—'}</td>
                    <td className="px-5 py-3 text-right text-white font-mono">{fmt(r.client_price)}</td>
                    <td className="px-5 py-3 text-right text-white/50 font-mono">{fmt(r.supplier_cost)}</td>
                    <td className={`px-5 py-3 text-right font-mono font-bold ${mg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {cp > 0 || sc > 0 ? `${sym}${mg.toLocaleString()}` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right font-mono text-xs ${pct == null ? 'text-white/20' : pct >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                      {pct == null ? '—' : `${pct}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/[0.12] bg-white/[0.03]">
                <td colSpan={2} className="px-5 py-3 text-white/40 text-xs font-bold uppercase">Total</td>
                <td className="px-5 py-3 text-right text-amber-400 font-bold font-mono">{sym}{totalClient.toLocaleString()}</td>
                <td className="px-5 py-3 text-right text-white/50 font-bold font-mono">{sym}{totalSupplier.toLocaleString()}</td>
                <td className={`px-5 py-3 text-right font-bold font-mono ${totalMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{sym}{totalMargin.toLocaleString()}</td>
                <td className={`px-5 py-3 text-right font-bold font-mono text-xs ${marginPct >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>{marginPct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-white/20 text-xs mt-4">
        Data is read from the normalized booking tables. Save your itinerary to sync the latest data.
      </p>
    </div>
  )
}

// ─── Preview Tab ──────────────────────────────────────────────────────────────

function PreviewTab({
  itin,
  onSave,
  onSent,
}: {
  itin: ItineraryData
  onSave: (u: Record<string, unknown>) => Promise<void>
  onSent: () => void
}) {
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [auditBlocks, setAuditBlocks] = useState(false)
  const [genningToken, setGenningToken] = useState(false)
  const [approvalUrl, setApprovalUrl] = useState('')
  const [approvalCopied, setApprovalCopied] = useState(false)

  const sym = CURRENCY_SYM[itin.currency] || ''
  const days = safeParse<Day[]>(itin.days, [])
  const flights = safeParse<Flight[]>(itin.flights, [])
  const hotels = safeParse<Hotel[]>(itin.hotels, [])
  const transfers = safeParse<Transfer[]>(itin.transfers || '[]', [])
  const tours = safeParse<Tour[]>(itin.tours || '[]', [])
  const trains = safeParse<Train[]>(itin.trains || '[]', [])
  const ferries = safeParse<Ferry[]>(itin.ferries || '[]', [])
  const inclusions = safeParse<string[]>(itin.inclusions, [])
  const exclusions = safeParse<string[]>(itin.exclusions, [])
  const priceBreakdown = safeParse<PriceRow[]>(itin.priceBreakdown, [])
  const publicUrl = `https://walztravels.com/itinerary/${itin.referenceNumber}`

  const handleSend = async () => {
    setSending(true)
    setSentMsg('')
    try {
      const res = await fetch(`/api/admin/itineraries/${itin.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSentMsg(data.emailSent ? `✅ Email sent to ${data.to}` : '✅ Status updated (email not sent)')
        onSent()
      } else {
        setSentMsg(`❌ Failed: ${data.error}`)
      }
    } catch {
      setSentMsg('❌ Network error')
    }
    setSending(false)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenApprovalLink = async () => {
    setGenningToken(true)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itin.id}/approve-token`, { method: 'POST' })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) setApprovalUrl(data.url)
      else alert(data.error ?? 'Could not generate approval link')
    } catch {
      alert('Network error generating approval link')
    }
    setGenningToken(false)
  }

  const handleCopyApproval = () => {
    if (!approvalUrl) return
    void navigator.clipboard.writeText(approvalUrl)
    setApprovalCopied(true)
    setTimeout(() => setApprovalCopied(false), 2000)
  }

  const handleStatusChange = async (newStatus: string) => {
    setStatusSaving(true)
    await onSave({ status: newStatus })
    setStatusSaving(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left: Mini preview */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-[#0B1F3A] px-5 py-3 flex items-center justify-between">
          <div className="bg-white/10 rounded-md px-3 py-1">
            <p className="text-white/50 text-[10px] font-mono truncate max-w-[180px]">walztravels.com/itinerary/{itin.referenceNumber}</p>
          </div>
          <span className="text-white/30 text-[10px]">Preview</span>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          {itin.coverImage ? (
            <div className="relative h-40">
              <img src={itin.coverImage} alt={itin.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-4">
                <h1 className="text-white text-lg font-bold">{itin.title}</h1>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-[#0B1F3A] to-[#1a3a6b] p-6">
              <h1 className="text-white text-lg font-bold mb-1">{itin.title}</h1>
              <p className="text-white/50 text-xs">📍 {itin.destination} · {itin.numberOfTravellers} traveller{itin.numberOfTravellers > 1 ? 's' : ''}</p>
              {itin.startDate && <p className="text-amber-400 text-xs mt-1">{fmtDate(itin.startDate)}{itin.endDate ? ` – ${fmtDate(itin.endDate)}` : ''}</p>}
            </div>
          )}

          <div className="p-5 space-y-4">
            {itin.overview && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-600 text-xs leading-relaxed">{itin.overview}</p>
              </div>
            )}

            {days.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">Day-by-Day ({days.length} days)</h3>
                <div className="space-y-2">
                  {days.slice(0, 3).map(d => (
                    <div key={d.day} className="bg-gray-50 rounded-lg p-3 border-l-2 border-amber-400">
                      <p className="text-amber-600 text-[10px] font-bold">DAY {d.day}</p>
                      <p className="text-gray-800 text-xs font-medium">{d.title}</p>
                      {d.destination && <p className="text-gray-400 text-[10px]">📍 {d.destination}</p>}
                    </div>
                  ))}
                  {days.length > 3 && <p className="text-gray-400 text-xs text-center">+ {days.length - 3} more days</p>}
                </div>
              </div>
            )}

            {flights.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">✈️ Flights ({flights.length})</h3>
                {flights.slice(0, 2).map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5 flex justify-between">
                    <p className="text-gray-700 text-xs">{f.from} → {f.to} · {f.airline}</p>
                    {f.date && <p className="text-gray-400 text-xs">{fmtDate(f.date)}</p>}
                  </div>
                ))}
              </div>
            )}

            {hotels.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">🏨 Hotels ({hotels.length})</h3>
                {hotels.slice(0, 2).map((h, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg overflow-hidden mb-1.5">
                    {h.images?.[0] && (
                      <img src={h.images[0]} alt={h.name} className="w-full h-16 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <div className="p-2">
                      <p className="text-gray-700 text-xs font-medium">{h.name}</p>
                      <p className="text-gray-400 text-xs">{h.location} · {h.nights} nights</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {transfers.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">🚗 Transfers ({transfers.length})</h3>
                {transfers.slice(0, 2).map((t, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5 flex justify-between">
                    <p className="text-gray-700 text-xs">{t.from} → {t.to} · {t.type}</p>
                    {t.date && <p className="text-gray-400 text-xs">{fmtDate(t.date)}</p>}
                  </div>
                ))}
              </div>
            )}

            {tours.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">🎭 Tours ({tours.length})</h3>
                {tours.slice(0, 2).map((t, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5">
                    <p className="text-gray-700 text-xs font-medium">{t.name}</p>
                    <p className="text-gray-400 text-xs">{t.location}{t.duration ? ` · ${t.duration}` : ''}</p>
                  </div>
                ))}
              </div>
            )}

            {trains.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">🚂 Trains ({trains.length})</h3>
                {trains.slice(0, 2).map((t, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5 flex justify-between">
                    <p className="text-gray-700 text-xs">{t.from} → {t.to} · {t.provider}</p>
                    {t.date && <p className="text-gray-400 text-xs">{fmtDate(t.date)}</p>}
                  </div>
                ))}
              </div>
            )}

            {ferries.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">⛴️ Ferries ({ferries.length})</h3>
                {ferries.slice(0, 2).map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2 mb-1.5 flex justify-between">
                    <p className="text-gray-700 text-xs">{f.from} → {f.to} · {f.operator}</p>
                    {f.date && <p className="text-gray-400 text-xs">{fmtDate(f.date)}</p>}
                  </div>
                ))}
              </div>
            )}

            {(inclusions.length > 0 || exclusions.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {inclusions.length > 0 && (
                  <div>
                    <p className="text-green-600 text-xs font-bold mb-1">✅ Included ({inclusions.length})</p>
                    {inclusions.slice(0, 3).map((inc, i) => <p key={i} className="text-gray-500 text-[10px] mb-0.5">✓ {inc}</p>)}
                  </div>
                )}
                {exclusions.length > 0 && (
                  <div>
                    <p className="text-red-500 text-xs font-bold mb-1">❌ Excluded ({exclusions.length})</p>
                    {exclusions.slice(0, 3).map((exc, i) => <p key={i} className="text-gray-500 text-[10px] mb-0.5">✗ {exc}</p>)}
                  </div>
                )}
              </div>
            )}

            {(priceBreakdown.length > 0 || itin.totalPrice) && (
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">💰 Pricing</h3>
                {priceBreakdown.map((r, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                    <p className="text-gray-600 text-xs">{r.item}</p>
                    <p className="text-gray-800 text-xs font-medium">{sym}{Number(r.cost).toLocaleString()}</p>
                  </div>
                ))}
                {itin.totalPrice && (
                  <div className="bg-[#0B1F3A] rounded-lg p-3 flex justify-between mt-2">
                    <p className="text-white text-xs font-bold">Total</p>
                    <p className="text-amber-400 text-sm font-bold">{sym}{Number(itin.totalPrice).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="space-y-5">
        {/* Acceptance premium card — replaces send emphasis for approved itineraries */}
        {itin.status === 'approved' && (() => {
          const previewSnap = parseSnap(itin.selectedOption)
          return previewSnap?.acceptedBy ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">✅</span>
                <h3 className="text-green-400 font-bold text-sm">Client Accepted</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/30 text-xs">Accepted by</span>
                  <span className="text-white text-xs font-semibold">{previewSnap.acceptedBy}</span>
                </div>
                {previewSnap.acceptedAt && (
                  <div className="flex justify-between">
                    <span className="text-white/30 text-xs">Accepted on</span>
                    <span className="text-white text-xs">{fmtDateTime(previewSnap.acceptedAt)}</span>
                  </div>
                )}
                {previewSnap.acceptedTotal != null && (
                  <div className="flex justify-between">
                    <span className="text-white/30 text-xs">Accepted total</span>
                    <span className="text-amber-400 text-xs font-bold">{sym}{Number(previewSnap.acceptedTotal).toLocaleString()}</span>
                  </div>
                )}
                {previewSnap.options && previewSnap.options.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/30 text-xs">Package</span>
                    <span className="text-white text-xs">{previewSnap.options.map(o => o.label).join(', ')}</span>
                  </div>
                )}
              </div>
              <p className="text-green-400/50 text-[10px] mt-3 pt-3 border-t border-green-500/20">
                Acceptance is locked — do not alter pricing without client consent.
              </p>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5">
              <p className="text-green-400 text-sm font-semibold">✅ Proposal accepted</p>
              {itin.approvedAt && <p className="text-green-400/60 text-xs mt-1">{fmtDateTime(itin.approvedAt)}</p>}
            </div>
          )
        })()}

        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-4">Status</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleStatusChange(val)}
                disabled={statusSaving || itin.status === val}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                  itin.status === val ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                } disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <JadeTripAuditor itinId={itin.id} onBlocksSend={setAuditBlocks} />

        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-1">Send to Client</h3>
          <p className="text-white/40 text-xs mb-4">
            Sends a beautifully formatted email to <span className="text-amber-400">{itin.clientEmail}</span> with the full itinerary.
          </p>

          {itin.sentAt && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
              <p className="text-blue-400 text-xs">📨 Last sent {fmtDateTime(itin.sentAt)}</p>
            </div>
          )}

          {auditBlocks && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <p className="text-red-400 text-xs font-semibold">🚫 Audit found critical issues — fix them before sending.</p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || auditBlocks}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending
              ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Sending…</>
              : `📧 Send to ${itin.clientEmail}`}
          </button>

          {sentMsg && (
            <p className={`text-sm mt-3 text-center ${sentMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
              {sentMsg}
            </p>
          )}
        </div>

        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-1">Client Approval Link</h3>
          <p className="text-white/40 text-xs mb-4">
            Generate a one-time link for {itin.clientName || 'the client'} to digitally sign and approve this itinerary.
          </p>

          {itin.status === 'approved' ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <p className="text-green-400 text-xs font-semibold">✅ This itinerary has already been approved.</p>
              {itin.approvedAt && <p className="text-green-400/60 text-xs mt-0.5">{fmtDateTime(itin.approvedAt)}</p>}
            </div>
          ) : (
            <>
              {!approvalUrl ? (
                <button
                  onClick={handleGenApprovalLink}
                  disabled={genningToken}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                >
                  {genningToken
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generating…</>
                    : '🔐 Generate Approval Link'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-white/5 rounded-xl px-3 py-2.5">
                    <p className="text-white/50 text-xs font-mono truncate">{approvalUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCopyApproval} className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-xl text-sm transition">
                      {approvalCopied ? '✓ Copied!' : '📋 Copy Link'}
                    </button>
                    <button onClick={handleGenApprovalLink} disabled={genningToken} className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50">
                      {genningToken ? '…' : '↻ Regenerate'}
                    </button>
                  </div>
                  <p className="text-white/20 text-[10px] text-center">Send this link to {itin.clientName || 'the client'} — it expires once used.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-3">Client Link</h3>
          <div className="bg-white/5 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-white/50 text-xs font-mono truncate">{publicUrl}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-2.5 rounded-xl text-sm transition">
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            <a
              href={`/itinerary/${itin.referenceNumber}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-2.5 rounded-xl text-sm transition text-center"
            >
              👁 View Live
            </a>
          </div>
        </div>

        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5 space-y-3">
          <h3 className="text-white font-bold text-sm">Itinerary Info</h3>
          <div className="space-y-2">
            {[
              ['Reference', itin.referenceNumber],
              ['Client', itin.clientName],
              ['Destination', itin.destination],
              ['Views', String(itin.viewCount)],
              ['Created', fmtDate(itin.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-white/30 text-xs">{label}</span>
                <span className="text-white text-xs font-mono">{value}</span>
              </div>
            ))}
            {itin.approvedAt && (
              <div className="flex justify-between">
                <span className="text-white/30 text-xs">Approved</span>
                <span className="text-green-400 text-xs">{fmtDateTime(itin.approvedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
