'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { formatDateOnly, addDaysToDateOnly, parseDateOnly } from '@/lib/date-utils'
import { JadeCopilot, type JadeContext, type AdminJadeTripContext } from './JadeCopilot'
import { JadeTripAuditor } from '@/components/admin/JadeTripAuditor'
import TravelersTab from '@/components/admin/itinerary/TravelersTab'
import TasksTab from '@/components/admin/itinerary/TasksTab'
import EsimTab from '@/components/admin/itinerary/EsimTab'
import { NotesTab } from '@/components/admin/itinerary/NotesTab'
import { PaymentScheduleEditor, PackageOptionsEditor } from '@/components/admin/itinerary/PricingExtras'
import ResearchTab from '@/components/admin/itinerary/ResearchTab'
import VersionHistory from '@/components/admin/itinerary/VersionHistory'
import type { OptionGroup, OptionItem, OptionCategory, SelectionMode, PricingMode, OptionSourceType, FulfilmentItem, FulfilmentStatus, FulfilmentItemType } from '@/lib/v2/types'

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
  date?: string          // YYYY-MM-DD; overrides startDate+offset if advisor sets it
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
  airlineLogoUrl?: string     // stored airline logo URL (priority over AirHex CDN)
  imageUrl?: string           // aircraft / flight image URL
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
  viatorProductCode?: string
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
  images?: string[]
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
  images?: string[]
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
  // Convert Date objects to ISO string first; parseDateOnly strips the time part
  const s = typeof d === 'string' ? d : d.toISOString()
  return formatDateOnly(s, 'short')
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
  { id: 'options',      label: '🎛 Options' },
  { id: 'fulfilment',   label: '📦 Fulfilment' },
  { id: 'margin',       label: '📊 Margin' },
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
  GBP: '£', USD: '$', CAD: 'CA$', EUR: '€', NGN: '₦', GHS: 'GH₵', AED: 'AED ', ZAR: 'R',
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

// ─── WalzActivityFinder ───────────────────────────────────────────────────────

type WalzActivityResult = {
  productCode: string
  title: string
  location: string
  supplier: string
  heroImageUrl: string | null
  thumbImageUrl: string | null
  allImageUrls: string[]
}

function WalzActivityFinder({
  initialName,
  initialLocation,
  onSelect,
}: {
  initialName: string
  initialLocation: string
  onSelect: (productCode: string, images: string[], heroImageUrl: string | null) => void
}) {
  const [open, setOpen]             = useState(false)
  const [activityName, setActivityName] = useState(initialName)
  const [location, setLocation]     = useState(initialLocation)
  const [searching, setSearching]   = useState(false)
  const [results, setResults]       = useState<WalzActivityResult[]>([])
  const [searchError, setSearchError] = useState('')
  const [loadingCode, setLoadingCode] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!activityName.trim()) return
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const res = await fetch('/api/admin/itineraries/search-walz-activities', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: activityName.trim(), location: location.trim() }),
      })
      const data = await res.json() as { activities?: WalzActivityResult[]; error?: string }
      if (!res.ok) {
        setSearchError(data.error ?? 'Search failed')
      } else {
        const found = data.activities ?? []
        setResults(found)
        if (!found.length) setSearchError('No matching activities found. Try a different name or location.')
      }
    } catch {
      setSearchError('Search failed — check your connection')
    }
    setSearching(false)
  }

  const handleUse = async (result: WalzActivityResult) => {
    setLoadingCode(result.productCode)
    try {
      const res = await fetch('/api/admin/itineraries/walz-activity-images', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productCode: result.productCode }),
      })
      const data = await res.json() as { images?: string[]; heroImageUrl?: string | null; error?: string }
      if (res.ok && data.images?.length) {
        onSelect(result.productCode, data.images, data.heroImageUrl ?? null)
      } else {
        // Fall back to images returned in the search result
        onSelect(result.productCode, result.allImageUrls, result.heroImageUrl)
      }
    } catch {
      // Fall back to images returned in the search result
      onSelect(result.productCode, result.allImageUrls, result.heroImageUrl)
    }
    setLoadingCode(null)
    setOpen(false)
  }

  return (
    <div className="mt-2 mb-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-amber-600/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600/30 transition"
      >
        {open ? '✕ Close Activity Search' : '🔍 Find from Walz Activities'}
      </button>

      {open && (
        <div className="mt-2 p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl">
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex-1 min-w-[140px]">
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Activity Name</label>
              <input
                value={activityName}
                onChange={e => setActivityName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !searching) void handleSearch() }}
                placeholder="e.g. Desert Safari"
                className={inp + ' text-xs'}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !searching) void handleSearch() }}
                placeholder="e.g. Dubai"
                className={inp + ' text-xs'}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching || !activityName.trim()}
                className="flex items-center gap-1.5 bg-amber-600/20 text-amber-300 border border-amber-500/30 px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-600/30 transition disabled:opacity-40"
              >
                {searching
                  ? <><span className="w-3 h-3 border border-amber-300 border-t-transparent rounded-full animate-spin inline-block" />{' '}Searching…</>
                  : 'Search'}
              </button>
            </div>
          </div>

          {searchError && (
            <p className="text-red-400 text-xs mb-2">{searchError}</p>
          )}

          {results.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {results.map(r => (
                <div key={r.productCode} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.06] rounded-lg p-2">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                    {r.thumbImageUrl ? (
                      <img src={r.thumbImageUrl} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-xl">🎭</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{r.title}</p>
                    {r.location && <p className="text-white/40 text-[10px] truncate">{r.location}</p>}
                    <p className="text-amber-400/60 text-[10px]">
                      {r.allImageUrls.length} image{r.allImageUrls.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUse(r)}
                    disabled={loadingCode !== null}
                    className="flex-shrink-0 flex items-center gap-1 bg-amber-600/20 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-amber-600/30 transition disabled:opacity-40 whitespace-nowrap"
                  >
                    {loadingCode === r.productCode
                      ? <><span className="w-2.5 h-2.5 border border-amber-300 border-t-transparent rounded-full animate-spin inline-block" />{' '}Loading…</>
                      : 'Use images'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
                (itin.status === 'approved' || itin.status === 'revision_accepted') ? 'bg-green-500/20 text-green-400' :
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
        {activeTab === 'pricing'    && <PricingTab   itin={itin} onSave={save} onNavigateToOptions={() => setActiveTab('options')} />}
        {activeTab === 'options'    && <OptionsTab     itineraryId={itin.id} itineraryCurrency={itin.currency} />}
        {activeTab === 'fulfilment' && <FulfilmentTab itineraryId={itin.id} />}
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
            snapshot={itin as unknown as Record<string, unknown>}
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
          status: itin.status || undefined,
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
      {/* Acceptance card — accepted itineraries (approved or revision_accepted) */}
      {(itin.status === 'approved' || itin.status === 'revision_accepted') && snap?.acceptedBy && (
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
    let defaultDate = ''
    if (itin.startDate) {
      try { defaultDate = addDaysToDateOnly(itin.startDate, next - 1) } catch { /* leave empty */ }
    }
    const newDay: Day = {
      day: next, title: `Day ${next}`, description: '', activities: [],
      meals: '', accommodation: '', destination: '', weather: '', dressCode: '',
      notes: '', clientNotes: '', internalNotes: '',
      date: defaultDate || undefined,
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

  // Format a YYYY-MM-DD string to full weekday+date display (local time, no UTC shift)
  const fmtDayDate = (dateStr: string): string => {
    try {
      const { year, month, day } = parseDateOnly(dateStr)
      const d = new Date(year, month - 1, day)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return '' }
  }

  // Compute a display date string from itin.startDate + day offset (UTC-safe)
  const dayDate = (dayNum: number): string | null => {
    if (!itin.startDate) return null
    try {
      const dateStr = addDaysToDateOnly(itin.startDate, dayNum - 1)
      return fmtDayDate(dateStr)
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
            // Use stored day.date if set, otherwise compute from itinerary startDate + offset
            const dateStr = day.date ? fmtDayDate(day.date) : dayDate(day.day)
            // YYYY-MM-DD value for the <input type="date"> picker
            let dayInputDate = day.date || ''
            if (!dayInputDate && itin.startDate) {
              try { dayInputDate = addDaysToDateOnly(itin.startDate, day.day - 1) } catch { /* leave empty */ }
            }
            const visibleActivities = day.activities.filter(a => a.trim())
            return (
              <div key={day.day} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl overflow-hidden">

                {/* ── EDIT MODE ─────────────────────────────────────────── */}
                {editingDayId === day.day ? (
                  <div className="p-5 space-y-4">
                    <DayEditHeader day={day} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Day Title</label>
                        <input value={day.title} onChange={e => updDay(day.day, 'title', e.target.value)} placeholder={`Day ${day.day} title`} className={inp} />
                      </div>
                      <div>
                        <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">
                          Date <span className="text-white/20 font-normal normal-case">(overrides auto-computed)</span>
                        </label>
                        <input
                          type="date"
                          value={dayInputDate}
                          onChange={e => updDay(day.day, 'date', e.target.value || undefined)}
                          className={inp}
                        />
                      </div>
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

// ─── BookingMediaThumbnail ────────────────────────────────────────────────────

function BookingMediaThumbnail({
  type,
  imageUrl,
  logoUrl,
  iataCode,
}: {
  type: 'flight' | 'hotel' | 'transfer' | 'tour' | 'train' | 'ferry'
  imageUrl?: string | null
  logoUrl?: string | null
  iataCode?: string
}) {
  const FALLBACK_EMOJI: Record<string, string> = {
    flight: '✈️', hotel: '🏨', transfer: '🚗', tour: '🗺️', train: '🚂', ferry: '⛴️',
  }

  // Compute effective logo URL (for flights, try airhex CDN if no stored logo)
  const effectiveLogoUrl = logoUrl || (iataCode ? `https://content.airhex.com/content/logos/airlines_${iataCode.toUpperCase()}_200_200_s.png` : null)

  const [imgFailed, setImgFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  // Dimensions: ~220px wide, 16:9
  return (
    <div
      style={{ width: 220, minWidth: 220, aspectRatio: '16/9', position: 'relative', overflow: 'hidden', background: '#0b1525', flexShrink: 0 }}
      className="hidden sm:block"
    >
      {/* Primary image layer */}
      {imageUrl && !imgFailed ? (
        <img
          src={imageUrl}
          alt="booking media"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        /* Dark gradient fallback background */
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0d1e35 0%, #0b1525 100%)' }} />
      )}

      {/* Logo badge — bottom-left, white pill */}
      {effectiveLogoUrl && !logoFailed && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'white', borderRadius: 6, padding: '3px 8px', display: 'flex', alignItems: 'center', maxWidth: 90 }}>
          <img
            src={effectiveLogoUrl}
            alt="airline logo"
            style={{ height: 22, maxWidth: 80, objectFit: 'contain', display: 'block' }}
            onError={() => setLogoFailed(true)}
          />
        </div>
      )}

      {/* Emoji fallback — centered, when no image AND no usable logo */}
      {(!imageUrl || imgFailed) && (!effectiveLogoUrl || logoFailed) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
          {FALLBACK_EMOJI[type] || '📦'}
        </div>
      )}
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
  const [logoLoading, setLogoLoading] = useState(false)
  const [logoMsg, setLogoMsg] = useState('')
  const logoFileRef = useRef<HTMLInputElement>(null)

  const saveWithFlights = async (updatedFlights: Flight[]) => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({
        flights: JSON.stringify(updatedFlights),
        hotels: JSON.stringify(hotels),
        transfers: JSON.stringify(transfers),
        tours: JSON.stringify(tours),
        trains: JSON.stringify(trains),
        ferries: JSON.stringify(ferries),
      })
    } catch {
      setSaveError('Save failed — check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

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
      supplierId: '', duffelOrderId: '', airlineLogoUrl: undefined, imageUrl: '',
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
      cost: null, supplierCost: null, notes: '', image: '', images: [], supplierId: '',
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
      cost: null, supplierCost: null, notes: '', image: '', images: [], supplierId: '',
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
                        <div>
                          <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">IATA Code</label>
                          <input value={f.iataCode} onChange={e => updFlight(f.id, 'iataCode', e.target.value.toUpperCase())} placeholder="EK" maxLength={3} className={inp} />
                          {f.iataCode && !f.airlineLogoUrl && (
                            <button
                              type="button"
                              disabled={logoLoading}
                              onClick={async () => {
                                setLogoLoading(true)
                                setLogoMsg('')
                                try {
                                  const res = await fetch('/api/admin/airlines/logo', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ iataCode: f.iataCode }),
                                  })
                                  const data = await res.json() as { logoUrl?: string; error?: string }
                                  if (data.logoUrl) {
                                    const upd = flights.map(fl => fl.id === f.id ? { ...fl, airlineLogoUrl: data.logoUrl } : fl)
                                    setFlights(upd)
                                    await saveWithFlights(upd)
                                    setLogoMsg('✓ Logo resolved')
                                  } else {
                                    setLogoMsg(`Logo not found for ${f.iataCode}`)
                                  }
                                } catch {
                                  setLogoMsg('Failed to resolve logo')
                                }
                                setLogoLoading(false)
                              }}
                              className="mt-1 text-[10px] text-amber-400/60 hover:text-amber-400 transition block disabled:opacity-40"
                            >
                              Auto-resolve logo?
                            </button>
                          )}
                        </div>
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
                      {/* Airline Logo Management */}
                      <div className="mt-3 p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
                        <label className="text-white/30 text-[10px] font-bold uppercase block mb-2">Airline Logo</label>
                        <div className="flex items-start gap-3 flex-wrap">
                          <div className="flex-shrink-0 w-[120px] h-[60px] bg-white rounded-lg flex items-center justify-center overflow-hidden">
                            {(f.airlineLogoUrl || f.iataCode)
                              ? <img
                                  src={f.airlineLogoUrl || `https://content.airhex.com/content/logos/airlines_${f.iataCode.toUpperCase()}_350_100_r.png`}
                                  alt={f.airline || f.iataCode}
                                  className="max-w-full max-h-full object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              : <span className="text-2xl">✈️</span>}
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <button
                              type="button"
                              disabled={logoLoading || !f.iataCode}
                              onClick={async () => {
                                setLogoLoading(true)
                                setLogoMsg('')
                                try {
                                  const res = await fetch('/api/admin/airlines/logo', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ iataCode: f.iataCode }),
                                  })
                                  const data = await res.json() as { logoUrl?: string; error?: string }
                                  if (data.logoUrl) {
                                    const upd = flights.map(fl => fl.id === f.id ? { ...fl, airlineLogoUrl: data.logoUrl } : fl)
                                    setFlights(upd)
                                    await saveWithFlights(upd)
                                    setLogoMsg('✓ Logo resolved')
                                  } else {
                                    setLogoMsg(`Logo not found for ${f.iataCode}`)
                                  }
                                } catch {
                                  setLogoMsg('Failed to resolve logo')
                                }
                                setLogoLoading(false)
                              }}
                              className="flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600/30 transition disabled:opacity-40"
                            >
                              {logoLoading
                                ? <><span className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full animate-spin inline-block" /> Resolving…</>
                                : '🔍 Resolve Logo'}
                            </button>
                            <button
                              type="button"
                              disabled={logoLoading}
                              onClick={() => logoFileRef.current?.click()}
                              className="flex items-center gap-1.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition disabled:opacity-40"
                            >
                              {logoLoading
                                ? <><span className="w-3 h-3 border border-purple-300 border-t-transparent rounded-full animate-spin inline-block" /> Uploading…</>
                                : '⬆ Upload Logo'}
                            </button>
                            <input
                              ref={logoFileRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                setLogoLoading(true)
                                setLogoMsg('')
                                const fd = new FormData()
                                fd.append('file', file)
                                fd.append('itemType', 'airline-logo')
                                fd.append('itemId', f.id || f.iataCode || 'logo')
                                try {
                                  const res = await fetch(`/api/admin/itineraries/${itin.id}/upload-item-image`, {
                                    method: 'POST',
                                    body: fd,
                                  })
                                  const data = await res.json() as { url?: string; error?: string }
                                  if (data.url) {
                                    const upd = flights.map(fl => fl.id === f.id ? { ...fl, airlineLogoUrl: data.url } : fl)
                                    setFlights(upd)
                                    await saveWithFlights(upd)
                                    setLogoMsg('✓ Logo uploaded')
                                  } else {
                                    setLogoMsg(data.error || 'Upload failed')
                                  }
                                } catch {
                                  setLogoMsg('Upload failed')
                                }
                                setLogoLoading(false)
                                e.target.value = ''
                              }}
                            />
                            {f.airlineLogoUrl && (
                              <button
                                type="button"
                                disabled={logoLoading}
                                onClick={async () => {
                                  const upd = flights.map(fl => fl.id === f.id ? { ...fl, airlineLogoUrl: undefined } : fl)
                                  setFlights(upd)
                                  await saveWithFlights(upd)
                                  setLogoMsg('Logo removed')
                                }}
                                className="flex items-center gap-1.5 bg-red-600/20 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600/30 transition disabled:opacity-40"
                              >
                                ✕ Remove Logo
                              </button>
                            )}
                          </div>
                        </div>
                        {logoMsg && (
                          <p className={`mt-1.5 text-[11px] ${logoMsg.startsWith('✓') ? 'text-green-400' : 'text-amber-400'}`}>
                            {logoMsg}
                          </p>
                        )}
                      </div>
                      {/* Aircraft Image Section */}
                      <div className="mt-3 p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
                        <label className="text-white/30 text-[10px] font-bold uppercase block mb-2">Aircraft Image</label>
                        <ImageField
                          value={f.imageUrl ?? ''}
                          label="Aircraft Image URL"
                          placeholder="https://..."
                          onChange={v => updFlight(f.id, 'imageUrl', v)}
                        />
                        <div className="flex flex-wrap gap-2 mt-2 items-center">
                          <label className="flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600/30 transition cursor-pointer">
                            ⬆ Upload Aircraft Image
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const fd = new FormData()
                                fd.append('file', file)
                                fd.append('itemType', 'flight')
                                fd.append('itemId', f.id)
                                try {
                                  const res = await fetch(`/api/admin/itineraries/${itin.id}/upload-item-image`, {
                                    method: 'POST',
                                    body: fd,
                                  })
                                  const data = await res.json() as { url?: string; error?: string }
                                  if (data.url) {
                                    const upd = flights.map(fl => fl.id === f.id ? { ...fl, imageUrl: data.url } : fl)
                                    setFlights(upd)
                                    await saveWithFlights(upd)
                                  }
                                } catch { /* silent */ }
                                e.target.value = ''
                              }}
                            />
                          </label>
                          {f.imageUrl && (
                            <button
                              type="button"
                              onClick={async () => {
                                const upd = flights.map(fl => fl.id === f.id ? { ...fl, imageUrl: '' } : fl)
                                setFlights(upd)
                                await saveWithFlights(upd)
                              }}
                              className="text-red-400/60 hover:text-red-400 text-xs transition"
                            >
                              Remove Image
                            </button>
                          )}
                        </div>
                      </div>
                      {(f.cost != null && f.supplierCost != null && f.cost > 0 && f.supplierCost > 0) && (
                        <div className="mt-2 px-3 py-2 bg-white/[0.03] rounded-lg flex items-center gap-4 text-xs">
                          <span className="text-white/40">Margin:</span>
                          <span className={`font-bold ${(f.cost - f.supplierCost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{sym}{(f.cost - f.supplierCost).toLocaleString()} ({f.supplierCost > 0 ? Math.round(((f.cost - f.supplierCost) / f.cost) * 100) : 0}%)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="flight" imageUrl={f.imageUrl} logoUrl={f.airlineLogoUrl} iataCode={f.iataCode} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="hotel" imageUrl={(h.images?.[0] || h.image) || null} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="transfer" imageUrl={(t.images?.[0] || t.image) || null} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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
                      <WalzActivityFinder
                        initialName={t.name}
                        initialLocation={t.location || itin.destination}
                        onSelect={(productCode, images, heroImageUrl) => {
                          updTour(t.id, 'viatorProductCode', productCode)
                          updTour(t.id, 'images', images)
                          updTour(t.id, 'image', heroImageUrl ?? images[0] ?? '')
                          void handleSave()
                        }}
                      />
                      <MultiImageGallery itinId={itin.id} itemType="tour" itemId={t.id} images={t.images ?? (t.image ? [t.image] : [])} destination={t.location || itin.destination} onImagesChange={imgs => { updTour(t.id, 'images', imgs); updTour(t.id, 'image', imgs[0] ?? '') }} autoSave={handleSave} />
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="tour" imageUrl={(t.images?.[0] || t.image) || null} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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
                      <MultiImageGallery
                        itinId={itin.id}
                        itemType="train"
                        itemId={t.id}
                        images={t.images ?? (t.image ? [t.image] : [])}
                        destination={itin.destination}
                        onImagesChange={imgs => { updTrain(t.id, 'images', imgs); updTrain(t.id, 'image', imgs[0] ?? '') }}
                        autoSave={handleSave}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="train" imageUrl={(t.images?.[0] || t.image) || null} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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
                      <MultiImageGallery
                        itinId={itin.id}
                        itemType="ferry"
                        itemId={fe.id}
                        images={fe.images ?? (fe.image ? [fe.image] : [])}
                        destination={itin.destination}
                        onImagesChange={imgs => { updFerry(fe.id, 'images', imgs); updFerry(fe.id, 'image', imgs[0] ?? '') }}
                        autoSave={handleSave}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row overflow-hidden">
                      <BookingMediaThumbnail type="ferry" imageUrl={(fe.images?.[0] || fe.image) || null} />
                      <div className="flex-1 min-w-0 flex items-center gap-4 p-4">
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

function PricingTab({ itin, onSave, onNavigateToOptions }: { itin: ItineraryData; onSave: (u: Record<string, unknown>) => Promise<void>; onNavigateToOptions?: () => void }) {
  const [rows, setRows] = useState<PriceRow[]>(safeParse<PriceRow[]>(itin.priceBreakdown, []))
  const [deposit, setDeposit] = useState<string>(itin.deposit != null ? String(itin.deposit) : '')
  const [depositEnabled, setDepositEnabled] = useState(itin.deposit != null && itin.deposit > 0)
  const [depositDue, setDepositDue] = useState(itin.depositDue ? itin.depositDue.split('T')[0] : '')
  const [balanceDue, setBalanceDue] = useState(itin.balanceDue ? itin.balanceDue.split('T')[0] : '')
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState<string>(itin.currency || 'GBP')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)

  const sym = CURRENCY_SYM[currency] || ''

  // ── Auto-calculated trip component costs ──────────────────────────────────────
  const { bookingComponents, bookingItemDetails } = useMemo(() => {
    type BookingItem = { label: string; amount: number }
    const sumCost = (arr: { cost?: number | null }[]) => arr.reduce((s, x) => s + (x.cost ?? 0), 0)

    const rawFlights   = safeParse<{ airline?: string; from?: string; to?: string; flightNumber?: string; cost?: number | null }[]>(itin.flights, [])
    const rawHotels    = safeParse<{ name?: string; location?: string; cost?: number | null }[]>(itin.hotels, [])
    const rawTransfers = safeParse<{ type?: string; from?: string; to?: string; cost?: number | null }[]>(itin.transfers || '[]', [])
    const rawTours     = safeParse<{ name?: string; cost?: number | null }[]>(itin.tours || '[]', [])
    const rawTrains    = safeParse<{ from?: string; to?: string; cost?: number | null }[]>(itin.trains || '[]', [])
    const rawFerries   = safeParse<{ from?: string; to?: string; cost?: number | null }[]>(itin.ferries || '[]', [])

    const components = [
      { label: 'Flights',            total: sumCost(rawFlights) },
      { label: 'Hotels',             total: sumCost(rawHotels) },
      { label: 'Transfers',          total: sumCost(rawTransfers) },
      { label: 'Tours & Activities', total: sumCost(rawTours) },
      { label: 'Trains',             total: sumCost(rawTrains) },
      { label: 'Ferries',            total: sumCost(rawFerries) },
    ].filter(c => c.total > 0)

    const details: Record<string, BookingItem[]> = {
      'Flights':            rawFlights.filter(f => (f.cost ?? 0) > 0).map(f => ({ label: [f.from, f.to].filter(Boolean).join('→') || f.airline || f.flightNumber || 'Flight', amount: f.cost! })),
      'Hotels':             rawHotels.filter(h => (h.cost ?? 0) > 0).map(h => ({ label: h.name || h.location || 'Hotel', amount: h.cost! })),
      'Transfers':          rawTransfers.filter(t => (t.cost ?? 0) > 0).map(t => ({ label: t.type || [t.from, t.to].filter(Boolean).join('→') || 'Transfer', amount: t.cost! })),
      'Tours & Activities': rawTours.filter(t => (t.cost ?? 0) > 0).map(t => ({ label: t.name || 'Experience', amount: t.cost! })),
      'Trains':             rawTrains.filter(t => (t.cost ?? 0) > 0).map(t => ({ label: [t.from, t.to].filter(Boolean).join('→') || 'Train', amount: t.cost! })),
      'Ferries':            rawFerries.filter(f => (f.cost ?? 0) > 0).map(f => ({ label: [f.from, f.to].filter(Boolean).join('→') || 'Ferry', amount: f.cost! })),
    }

    return { bookingComponents: components, bookingItemDetails: details }
  }, [itin.flights, itin.hotels, itin.transfers, itin.tours, itin.trains, itin.ferries])

  const bookingCostTotal = bookingComponents.reduce((s, c) => s + c.total, 0)
  const manualRowsTotal  = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0)
  const derivedTotal     = bookingCostTotal + manualRowsTotal

  const addRow    = () => setRows(prev => [...prev, { id: uid(), item: '', description: '', cost: 0 }])
  const updRow    = (id: string, field: keyof PriceRow, value: unknown) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))

  const toggleCategory = (label: string) =>
    setExpandedCategories(prev => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next })

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      priceBreakdown: JSON.stringify(rows),
      totalPrice: derivedTotal > 0 ? derivedTotal : null,
      deposit: depositEnabled && deposit !== '' ? Number(deposit) : null,
      depositDue: depositEnabled && depositDue ? depositDue : null,
      balanceDue: balanceDue || null,
      currency,
    })
    setSaving(false)
  }

  const pricingSnap    = parseSnap(itin.selectedOption)
  const currentTotal   = derivedTotal > 0 ? derivedTotal : null
  const acceptedTotalNum = pricingSnap?.acceptedTotal ?? null
  const isItinAccepted = itin.status === 'approved' || itin.status === 'revision_accepted'
  const isSent         = itin.status === 'proposal' || itin.status === 'revision_sent'
  const hasDivergence  = isItinAccepted && acceptedTotalNum != null && currentTotal != null && Math.abs(acceptedTotalNum - currentTotal) > 0.01
  const depositNum     = depositEnabled && deposit !== '' ? Number(deposit) : 0
  const balance        = Math.max(0, derivedTotal - depositNum)

  return (
    <div className="max-w-3xl space-y-4">

      {/* Accepted total + divergence warning */}
      {isItinAccepted && pricingSnap?.acceptedBy && (
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

      {/* ── SECTION 1: TRIP PRICE ────────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base">Trip Price</h2>
          <span className="text-xs text-white/30 bg-white/5 border border-white/10 px-2 py-1 rounded-lg">Auto from bookings</span>
        </div>

        {bookingComponents.length === 0 ? (
          <p className="text-white/30 text-sm">No booking costs yet. Add client prices to flights, hotels, transfers, tours, trains and ferries.</p>
        ) : (
          <div>
            {bookingComponents.map(c => {
              const items = bookingItemDetails[c.label] ?? []
              const isOpen = expandedCategories.has(c.label)
              return (
                <div key={c.label}>
                  <button
                    onClick={() => toggleCategory(c.label)}
                    className="w-full flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-white/25 text-[10px] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      <span className="text-white/70 text-sm">{c.label}</span>
                    </div>
                    <span className="text-white text-sm font-mono tabular-nums">{sym}{c.total.toLocaleString()}</span>
                  </button>
                  {isOpen && items.length > 0 && (
                    <div className="ml-5 mb-1 border-l border-white/[0.06] pl-3">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between py-1.5 text-xs text-white/35">
                          <span className="truncate pr-4">{item.label}</span>
                          <span className="font-mono tabular-nums flex-shrink-0">{sym}{item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="border-t border-white/10 pt-3 mt-2 flex items-center justify-between px-2">
              <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Component Total</span>
              <span className="text-white font-bold font-mono tabular-nums">{sym}{bookingCostTotal.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: ADJUSTMENTS ───────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base">Adjustments</h2>
          <button onClick={addRow} className="text-amber-400 text-sm hover:text-amber-300 transition font-semibold">+ Add</button>
        </div>

        {rows.length === 0 ? (
          <p className="text-white/20 text-xs">No adjustments — service fees, discounts, extra items. <button onClick={addRow} className="text-amber-400 hover:text-amber-300 transition ml-1">Add one →</button></p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <input
                  value={r.item}
                  onChange={e => updRow(r.id, 'item', e.target.value)}
                  placeholder="Service fee, discount…"
                  className={`${inp} flex-1 min-w-0`}
                />
                <div className="relative flex-shrink-0 w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none">{sym}</span>
                  <input
                    type="number"
                    value={r.cost}
                    onChange={e => updRow(r.id, 'cost', Number(e.target.value))}
                    className={`${inp} pl-7 text-right tabular-nums`}
                  />
                </div>
                <button onClick={() => removeRow(r.id)} className="text-white/20 hover:text-red-400 transition flex-shrink-0 text-sm">✕</button>
              </div>
            ))}
            {manualRowsTotal !== 0 && (
              <div className="flex justify-end pt-1 pr-9">
                <span className="text-white/50 text-sm font-mono tabular-nums">{manualRowsTotal < 0 ? '−' : '+'}{sym}{Math.abs(manualRowsTotal).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 3: CLIENT TOTAL ──────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] border border-[#C9A84C]/20 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[11px] font-bold uppercase tracking-wider mb-1">Client Total</p>
            <p className="text-white/40 text-xs">
              {bookingCostTotal > 0 && <span>Components {sym}{bookingCostTotal.toLocaleString()}</span>}
              {bookingCostTotal > 0 && manualRowsTotal !== 0 && <span className="mx-1">+</span>}
              {manualRowsTotal !== 0 && <span>Adjustments {manualRowsTotal < 0 ? '−' : ''}{sym}{Math.abs(manualRowsTotal).toLocaleString()}</span>}
            </p>
          </div>
          <p className="text-amber-400 text-3xl font-bold tabular-nums">{sym}{derivedTotal.toLocaleString()}</p>
        </div>

      </div>

      {/* ── SECTION 4: PAYMENT TERMS ─────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-5">Payment Terms</h2>

        <div className="mb-5">
          <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Billing Currency</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            disabled={isItinAccepted}
            className={`${sel} ${isItinAccepted ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {Object.entries(CURRENCY_SYM).map(([code, s]) => (
              <option key={code} value={code}>{s} {code}</option>
            ))}
          </select>
          {isItinAccepted && (
            <p className="text-white/30 text-xs mt-1.5">Currency locked — proposal accepted. Use revision workflow to change.</p>
          )}
          {isSent && currency !== (itin.currency || 'GBP') && (
            <p className="text-amber-400/80 text-xs mt-1.5">⚠️ Currency changed from {itin.currency || 'GBP'}. This proposal was already sent — existing numeric amounts are NOT converted. Re-send required before client can accept.</p>
          )}
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3 cursor-pointer select-none mb-3">
            <input
              type="checkbox"
              checked={depositEnabled}
              onChange={e => { setDepositEnabled(e.target.checked); if (!e.target.checked) setDeposit('') }}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-white/70 text-sm font-medium">Require deposit</span>
          </label>

          {depositEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-7">
              <div>
                <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Amount ({sym})</label>
                <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Deposit Due</label>
                <input type="date" value={depositDue} onChange={e => setDepositDue(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Balance Due</label>
                <input type="date" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} className={inp} />
              </div>
            </div>
          )}

          {!depositEnabled && (
            <div className="pl-7">
              <label className="text-white/40 text-xs font-bold uppercase tracking-wider block mb-1.5">Balance Due Date</label>
              <input type="date" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} className={`${inp} max-w-xs`} />
            </div>
          )}
        </div>

        {depositEnabled && depositNum > 0 && derivedTotal > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex justify-between items-center text-sm pl-7">
            <span className="text-white/30">Balance (auto)</span>
            <span className="text-white/60 font-mono tabular-nums">{sym}{balance.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* ── Payment Plan — collapsed by default ──────────────────────────────── */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowPaymentPlan(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className="text-white/70 font-semibold text-sm">{showPaymentPlan ? '▼' : '+'} Payment Plan</span>
          <span className="text-white/30 text-xs">{showPaymentPlan ? 'Collapse' : 'Set milestone schedule'}</span>
        </button>
        {showPaymentPlan && (
          <div className="px-6 pb-6 border-t border-white/[0.06]">
            <PaymentScheduleEditor itinId={itin.id} currency={itin.currency || 'GBP'} />
          </div>
        )}
      </div>

      {/* ── Package Options — link to Options tab ────────────────────────────── */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-3.5 flex items-center justify-between">
        <p className="text-white/30 text-sm">Package options are managed in the Options tab</p>
        {onNavigateToOptions && (
          <button onClick={onNavigateToOptions} className="text-amber-400/70 hover:text-amber-400 text-sm transition font-medium flex-shrink-0 ml-4">
            Options tab →
          </button>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Pricing'}
        </button>
      </div>
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

// ─── Options Tab ─────────────────────────────────────────────────────────────

const OPTION_CATEGORIES: OptionCategory[] = ['FLIGHT', 'HOTEL', 'ROOM', 'TRANSFER', 'ACTIVITY', 'INSURANCE', 'ADDON', 'OTHER']
const OPTION_SOURCE_TYPES: OptionSourceType[] = ['MANUAL', 'FLIGHT_BOOKING', 'HOTEL_BOOKING', 'TRANSFER_BOOKING', 'TOUR_BOOKING']

const CATEGORY_COLORS: Record<OptionCategory, string> = {
  FLIGHT:    'bg-blue-500/20 text-blue-300',
  HOTEL:     'bg-purple-500/20 text-purple-300',
  ROOM:      'bg-indigo-500/20 text-indigo-300',
  TRANSFER:  'bg-amber-500/20 text-amber-300',
  ACTIVITY:  'bg-green-500/20 text-green-300',
  INSURANCE: 'bg-red-500/20 text-red-300',
  ADDON:     'bg-orange-500/20 text-orange-300',
  OTHER:     'bg-white/10 text-white/40',
}

function OptionsTab({ itineraryId, itineraryCurrency }: { itineraryId: string; itineraryCurrency: string }) {
  const [groups, setGroups]               = useState<OptionGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [editingGroup, setEditingGroup]   = useState<OptionGroup | null>(null)
  const [items, setItems]                 = useState<OptionItem[]>([])
  const [editingItem, setEditingItem]     = useState<OptionItem | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingItems, setLoadingItems]   = useState(false)
  const [savingGroup, setSavingGroup]     = useState(false)
  const [savingItem, setSavingItem]       = useState(false)
  const [groupMsg, setGroupMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [itemMsg, setItemMsg]             = useState<{ ok: boolean; text: string } | null>(null)

  // ── API helpers ────────────────────────────────────────────────────────────

  const loadGroups = async () => {
    setLoadingGroups(true)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itineraryId}/option-groups`)
      const data = await res.json() as { groups?: OptionGroup[] } | OptionGroup[]
      setGroups(Array.isArray(data) ? data : (data as { groups?: OptionGroup[] }).groups ?? [])
    } catch {
      setGroupMsg({ ok: false, text: 'Failed to load option groups' })
    }
    setLoadingGroups(false)
  }

  const loadItems = async (groupId: string) => {
    setLoadingItems(true)
    setItemMsg(null)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${groupId}/items`)
      const data = await res.json() as { items?: OptionItem[] } | OptionItem[]
      setItems(Array.isArray(data) ? data : (data as { items?: OptionItem[] }).items ?? [])
    } catch {
      setItemMsg({ ok: false, text: 'Failed to load items' })
    }
    setLoadingItems(false)
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { void loadGroups() }, [itineraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedGroupId) {
      setEditingGroup(null)
      setItems([])
      setEditingItem(null)
      return
    }
    const found = groups.find(g => g.id === selectedGroupId)
    if (found) setEditingGroup({ ...found })
    void loadItems(selectedGroupId)
  }, [selectedGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Group operations ───────────────────────────────────────────────────────

  const handleAddGroup = async () => {
    setGroupMsg(null)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itineraryId}/option-groups`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                  'New Group',
          category:              'OTHER' as OptionCategory,
          selectionMode:         'SINGLE' as SelectionMode,
          pricingMode:           'ADD_ON' as PricingMode,
          required:              false,
          minSelections:         0,
          maxSelections:         1,
          active:                true,
          clientVisible:         true,
          lockedAfterAcceptance: false,
          sortOrder:             groups.length,
        }),
      })
      const data = await res.json() as { group?: OptionGroup } | OptionGroup
      const newGroup = (data as { group?: OptionGroup }).group ?? data as OptionGroup
      await loadGroups()
      setSelectedGroupId(newGroup.id)
    } catch {
      setGroupMsg({ ok: false, text: 'Failed to create group' })
    }
  }

  const handleSaveGroup = async () => {
    if (!editingGroup) return
    setSavingGroup(true)
    setGroupMsg(null)
    try {
      await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${editingGroup.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editingGroup),
      })
      await loadGroups()
      setGroupMsg({ ok: true, text: 'Saved' })
      setTimeout(() => setGroupMsg(null), 2000)
    } catch {
      setGroupMsg({ ok: false, text: 'Failed to save group' })
    }
    setSavingGroup(false)
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Delete this option group and all its items? This cannot be undone.')) return
    setGroupMsg(null)
    try {
      await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${groupId}`, { method: 'DELETE' })
      setSelectedGroupId(null)
      setEditingGroup(null)
      setItems([])
      await loadGroups()
    } catch {
      setGroupMsg({ ok: false, text: 'Failed to delete group' })
    }
  }

  // ── Item operations ────────────────────────────────────────────────────────

  const handleAddItem = async () => {
    if (!selectedGroupId) return
    setItemMsg(null)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${selectedGroupId}/items`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:             'New Option',
          description:      '',
          clientPrice:      0,
          currency:         itineraryCurrency || 'GBP',
          priceAdjustment:  0,
          recommended:      false,
          defaultSelected:  false,
          clientSelectable: true,
          active:           true,
          sortOrder:        items.length,
          imageUrl:         '',
          supplierCost:     null,
          internalMargin:   null,
          sourceType:       null,
        }),
      })
      const data    = await res.json() as { item?: OptionItem } | OptionItem
      const newItem = (data as { item?: OptionItem }).item ?? data as OptionItem
      await loadItems(selectedGroupId)
      setEditingItem(newItem)
    } catch {
      setItemMsg({ ok: false, text: 'Failed to create item' })
    }
  }

  const handleSaveItem = async () => {
    if (!editingItem || !selectedGroupId) return
    setSavingItem(true)
    setItemMsg(null)
    try {
      await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${selectedGroupId}/items/${editingItem.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editingItem),
      })
      await loadItems(selectedGroupId)
      setEditingItem(null)
      setItemMsg({ ok: true, text: 'Saved' })
      setTimeout(() => setItemMsg(null), 2000)
    } catch {
      setItemMsg({ ok: false, text: 'Failed to save item' })
    }
    setSavingItem(false)
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedGroupId) return
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    setItemMsg(null)
    try {
      await fetch(`/api/admin/itineraries/${itineraryId}/option-groups/${selectedGroupId}/items/${itemId}`, { method: 'DELETE' })
      if (editingItem?.id === itemId) setEditingItem(null)
      await loadItems(selectedGroupId)
    } catch {
      setItemMsg({ ok: false, text: 'Failed to delete item' })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white font-bold text-lg">Option Groups</h2>
        <p className="text-white/30 text-xs">Build choices that clients can select when reviewing their proposal</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Group list ──────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Groups</h3>
              <button
                onClick={() => { void handleAddGroup() }}
                className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition"
              >
                + Add Group
              </button>
            </div>

            {groupMsg && !selectedGroupId && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${groupMsg.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {groupMsg.text}
              </div>
            )}

            {loadingGroups ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-4xl mb-3">🎛</p>
                <p className="text-white/30 text-sm">No option groups yet</p>
                <p className="text-white/20 text-xs mt-1">Add a group to offer client choices</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition ${
                      selectedGroupId === g.id
                        ? 'bg-white/10 border-amber-500/30'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-white text-xs font-semibold leading-snug">{g.name}</span>
                      {g.required && (
                        <span className="flex-shrink-0 text-[9px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">REQ</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[g.category]}`}>
                        {g.category}
                      </span>
                      <span className="text-[9px] font-bold bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">
                        {g.selectionMode}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Group detail + items ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {!selectedGroupId ? (
            <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-10 text-center">
              <p className="text-white/30 text-sm">Select a group from the left to view its settings and items</p>
            </div>
          ) : editingGroup ? (
            <>
              {/* Group settings form */}
              <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-white font-bold text-sm">Group Settings</h3>
                  <div className="flex items-center gap-2">
                    {groupMsg && (
                      <span className={`text-xs ${groupMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{groupMsg.ok ? '✓' : '⚠'} {groupMsg.text}</span>
                    )}
                    <button
                      onClick={() => { void handleSaveGroup() }}
                      disabled={savingGroup}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {savingGroup
                        ? <><div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</>
                        : '✓ Save Group'}
                    </button>
                    <button
                      onClick={() => { void handleDeleteGroup(editingGroup.id) }}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Name</label>
                    <input
                      value={editingGroup.name}
                      onChange={e => setEditingGroup(g => g ? { ...g, name: e.target.value } : g)}
                      placeholder="e.g. Room Type"
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Category</label>
                    <select
                      value={editingGroup.category}
                      onChange={e => setEditingGroup(g => g ? { ...g, category: e.target.value as OptionCategory } : g)}
                      className={sel}
                    >
                      {OPTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-white/40 text-[10px] font-bold uppercase block mb-2">Selection Mode</label>
                    <div className="flex gap-4">
                      {(['SINGLE', 'MULTIPLE'] as SelectionMode[]).map(m => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`sel-${editingGroup.id}`}
                            checked={editingGroup.selectionMode === m}
                            onChange={() => setEditingGroup(g => g ? { ...g, selectionMode: m } : g)}
                            className="accent-amber-500"
                          />
                          <span className="text-white/70 text-xs">{m}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-white/40 text-[10px] font-bold uppercase block mb-2">Pricing Mode</label>
                    <div className="flex gap-4">
                      {(['REPLACEMENT', 'ADD_ON'] as PricingMode[]).map(m => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`pm-${editingGroup.id}`}
                            checked={editingGroup.pricingMode === m}
                            onChange={() => setEditingGroup(g => g ? { ...g, pricingMode: m } : g)}
                            className="accent-amber-500"
                          />
                          <span className="text-white/70 text-xs">{m}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {editingGroup.selectionMode === 'MULTIPLE' && (
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Min Selections</label>
                      <input
                        type="number"
                        min="0"
                        value={editingGroup.minSelections}
                        onChange={e => setEditingGroup(g => g ? { ...g, minSelections: Number(e.target.value) } : g)}
                        className={inp}
                      />
                    </div>
                    <div>
                      <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Max Selections</label>
                      <input
                        type="number"
                        min="1"
                        value={editingGroup.maxSelections}
                        onChange={e => setEditingGroup(g => g ? { ...g, maxSelections: Number(e.target.value) } : g)}
                        className={inp}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingGroup.required} onChange={e => setEditingGroup(g => g ? { ...g, required: e.target.checked } : g)} className="accent-amber-500" />
                    <span className="text-white/70 text-xs">Required</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingGroup.clientVisible} onChange={e => setEditingGroup(g => g ? { ...g, clientVisible: e.target.checked } : g)} className="accent-amber-500" />
                    <span className="text-white/70 text-xs">Client Visible</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingGroup.lockedAfterAcceptance} onChange={e => setEditingGroup(g => g ? { ...g, lockedAfterAcceptance: e.target.checked } : g)} className="accent-amber-500" />
                    <span className="text-white/70 text-xs">Locked After Acceptance</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingGroup.active} onChange={e => setEditingGroup(g => g ? { ...g, active: e.target.checked } : g)} className="accent-amber-500" />
                    <span className="text-white/70 text-xs">Active</span>
                  </label>
                </div>
              </div>

              {/* Items section */}
              <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-bold text-sm">Items</h3>
                  <div className="flex items-center gap-2">
                    {itemMsg && (
                      <span className={`text-xs ${itemMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{itemMsg.ok ? '✓' : '⚠'} {itemMsg.text}</span>
                    )}
                    <button
                      onClick={() => { void handleAddItem() }}
                      className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold px-3 py-1.5 rounded-lg text-xs transition"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                {loadingItems ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-white/30 text-sm">No items yet</p>
                    <button onClick={() => { void handleAddItem() }} className="text-amber-400 text-xs mt-2 hover:text-amber-300 transition">+ Add first item</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map(item => (
                      <div key={item.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden">
                        {editingItem?.id === item.id ? (
                          /* ── Inline item editor ── */
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
                              <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">✏️ Editing: {item.name || 'New Item'}</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { void handleSaveItem() }}
                                  disabled={savingItem}
                                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition disabled:opacity-50"
                                >
                                  {savingItem ? 'Saving…' : '✓ Done'}
                                </button>
                                <button
                                  onClick={() => { void handleDeleteItem(item.id) }}
                                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Name</label>
                                <input
                                  value={editingItem.name}
                                  onChange={e => setEditingItem(i => i ? { ...i, name: e.target.value } : i)}
                                  placeholder="Option name"
                                  className={inp}
                                />
                              </div>
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Description</label>
                                <input
                                  value={editingItem.description ?? ''}
                                  onChange={e => setEditingItem(i => i ? { ...i, description: e.target.value } : i)}
                                  placeholder="Short description"
                                  className={inp}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price</label>
                                <input
                                  type="number"
                                  value={editingItem.clientPrice}
                                  onChange={e => setEditingItem(i => i ? { ...i, clientPrice: Number(e.target.value) } : i)}
                                  placeholder="0.00"
                                  className={inp}
                                />
                              </div>
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Currency</label>
                                <select
                                  value={editingItem.currency}
                                  onChange={e => setEditingItem(i => i ? { ...i, currency: e.target.value } : i)}
                                  className={sel}
                                >
                                  {['GBP', 'USD', 'EUR', 'NGN', 'GHS', 'AED'].map(c => <option key={c}>{c}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">
                                  {editingGroup.pricingMode === 'REPLACEMENT' ? 'Price Delta' : 'Add-on Price'}
                                </label>
                                <input
                                  type="number"
                                  value={editingItem.priceAdjustment}
                                  onChange={e => setEditingItem(i => i ? { ...i, priceAdjustment: Number(e.target.value) } : i)}
                                  placeholder="0.00"
                                  className={inp}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Image URL</label>
                                {editingItem.imageUrl && (
                                  <div className="mb-1.5 rounded-lg overflow-hidden h-16 bg-white/5">
                                    <img src={editingItem.imageUrl} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                  </div>
                                )}
                                <input
                                  value={editingItem.imageUrl ?? ''}
                                  onChange={e => setEditingItem(i => i ? { ...i, imageUrl: e.target.value } : i)}
                                  placeholder="https://…"
                                  className={inp}
                                />
                              </div>
                              <div>
                                <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Quote Expires At</label>
                                <input
                                  type="date"
                                  value={editingItem.quoteExpiresAt ? editingItem.quoteExpiresAt.split('T')[0] : ''}
                                  onChange={e => setEditingItem(i => i ? { ...i, quoteExpiresAt: e.target.value || undefined } : i)}
                                  className={inp}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost <span className="text-white/20 font-normal normal-case">— Internal</span></label>
                                <input
                                  type="number"
                                  value={editingItem.supplierCost ?? ''}
                                  onChange={e => setEditingItem(i => i ? { ...i, supplierCost: e.target.value ? Number(e.target.value) : null } : i)}
                                  placeholder="0.00"
                                  className={inp}
                                />
                              </div>
                              <div>
                                <label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Internal Margin <span className="text-white/20 font-normal normal-case">— Internal</span></label>
                                <input
                                  type="number"
                                  value={editingItem.internalMargin ?? ''}
                                  onChange={e => setEditingItem(i => i ? { ...i, internalMargin: e.target.value ? Number(e.target.value) : null } : i)}
                                  placeholder="0.00"
                                  className={inp}
                                />
                              </div>
                            </div>

                            <div className="mb-4">
                              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Source Type</label>
                              <select
                                value={editingItem.sourceType ?? ''}
                                onChange={e => setEditingItem(i => i ? { ...i, sourceType: e.target.value ? e.target.value as OptionSourceType : null } : i)}
                                className={sel}
                              >
                                <option value="">— None —</option>
                                {OPTION_SOURCE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                              </select>
                            </div>

                            <div className="flex flex-wrap gap-5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={editingItem.recommended} onChange={e => setEditingItem(i => i ? { ...i, recommended: e.target.checked } : i)} className="accent-amber-500" />
                                <span className="text-white/70 text-xs">Recommended</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={editingItem.defaultSelected} onChange={e => setEditingItem(i => i ? { ...i, defaultSelected: e.target.checked } : i)} className="accent-amber-500" />
                                <span className="text-white/70 text-xs">Default Selected</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={editingItem.clientSelectable} onChange={e => setEditingItem(i => i ? { ...i, clientSelectable: e.target.checked } : i)} className="accent-amber-500" />
                                <span className="text-white/70 text-xs">Client Selectable</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={editingItem.active} onChange={e => setEditingItem(i => i ? { ...i, active: e.target.checked } : i)} className="accent-amber-500" />
                                <span className="text-white/70 text-xs">Active</span>
                              </label>
                            </div>
                          </div>
                        ) : (
                          /* ── Item summary row ── */
                          <div className="flex items-center gap-3 p-3">
                            {item.imageUrl && (
                              <div className="flex-shrink-0 w-12 h-10 rounded-lg overflow-hidden bg-white/5">
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="text-white text-sm font-medium">{item.name}</span>
                                {item.recommended && (
                                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">RECOMMENDED</span>
                                )}
                                {item.defaultSelected && (
                                  <span className="text-[9px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/40">
                                {editingGroup.pricingMode === 'ADD_ON'
                                  ? <span>+{item.currency} {item.clientPrice.toLocaleString()}</span>
                                  : <span>Δ {item.currency} {item.priceAdjustment.toLocaleString()}</span>
                                }
                                {item.quoteExpiresAt && (
                                  <span className="text-amber-400/60">Expires {item.quoteExpiresAt.split('T')[0]}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setEditingItem({ ...item })}
                              className="flex-shrink-0 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
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
                  <div key={i} className="bg-gray-50 rounded-lg overflow-hidden mb-1.5">
                    {(t.images?.[0] || t.image) && (
                      <img src={t.images?.[0] || t.image} alt={t.type || 'Transfer'} className="w-full h-16 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <div className="p-2 flex justify-between">
                      <p className="text-gray-700 text-xs">{t.from} → {t.to} · {t.type}</p>
                      {t.date && <p className="text-gray-400 text-xs">{fmtDate(t.date)}</p>}
                    </div>
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
        {/* Acceptance premium card — replaces send emphasis for accepted itineraries */}
        {(itin.status === 'approved' || itin.status === 'revision_accepted') && (() => {
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

          {(itin.status === 'approved' || itin.status === 'revision_accepted') ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <p className="text-green-400 text-xs font-semibold">✅ This itinerary has already been accepted.</p>
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

// ─── Fulfilment Tab ───────────────────────────────────────────────────────────

const FULFILMENT_ITEM_TYPES: FulfilmentItemType[] = [
  'FLIGHT', 'HOTEL', 'TRANSFER', 'TOUR', 'TRAIN', 'FERRY', 'ESIM', 'OTHER',
]
const FULFILMENT_STATUSES: FulfilmentStatus[] = [
  'PENDING', 'IN_PROGRESS', 'BOOKED', 'CONFIRMED', 'FAILED', 'CANCELLED',
]

const FULFILMENT_TYPE_COLOURS: Record<FulfilmentItemType, string> = {
  FLIGHT:   'bg-sky-500/20 text-sky-300 border-sky-500/30',
  HOTEL:    'bg-purple-500/20 text-purple-300 border-purple-500/30',
  TRANSFER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  TOUR:     'bg-green-500/20 text-green-300 border-green-500/30',
  TRAIN:    'bg-orange-500/20 text-orange-300 border-orange-500/30',
  FERRY:    'bg-teal-500/20 text-teal-300 border-teal-500/30',
  ESIM:     'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  OTHER:    'bg-white/10 text-white/50 border-white/20',
}

const FULFILMENT_STATUS_COLOURS: Record<FulfilmentStatus, string> = {
  PENDING:     'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BOOKED:      'bg-purple-500/20 text-purple-300 border-purple-500/30',
  CONFIRMED:   'bg-green-500/20 text-green-300 border-green-500/30',
  FAILED:      'bg-red-500/20 text-red-300 border-red-500/30',
  CANCELLED:   'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const FULFILMENT_TYPE_ICONS: Record<FulfilmentItemType, string> = {
  FLIGHT: '✈️', HOTEL: '🏨', TRANSFER: '🚗', TOUR: '🎭',
  TRAIN: '🚂', FERRY: '⛴️', ESIM: '📶', OTHER: '📦',
}

const COMPLETED_STATUSES: FulfilmentStatus[] = ['CONFIRMED', 'BOOKED']

interface FulfilmentFormState {
  type:              FulfilmentItemType
  description:       string
  status:            FulfilmentStatus
  supplierReference: string
  clientReference:   string
  assignedTo:        string
  notes:             string
  completedAt:       string
}

const EMPTY_FORM: FulfilmentFormState = {
  type:              'OTHER',
  description:       '',
  status:            'PENDING',
  supplierReference: '',
  clientReference:   '',
  assignedTo:        '',
  notes:             '',
  completedAt:       '',
}

function fulfilmentFormToBody(form: FulfilmentFormState) {
  return {
    type:              form.type,
    description:       form.description,
    status:            form.status,
    supplierReference: form.supplierReference.trim() || null,
    clientReference:   form.clientReference.trim()   || null,
    assignedTo:        form.assignedTo.trim()         || null,
    notes:             form.notes.trim()              || null,
    completedAt:       form.completedAt               || null,
  }
}

function FulfilmentTab({ itineraryId }: { itineraryId: string }) {
  const [items, setItems]               = useState<FulfilmentItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<FulfilmentFormState>(EMPTY_FORM)
  const [showCreate, setShowCreate]     = useState(false)
  const [createForm, setCreateForm]     = useState<FulfilmentFormState>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [msg, setMsg]                   = useState<{ ok: boolean; text: string } | null>(null)

  const apiBase = `/api/admin/itineraries/${itineraryId}/fulfilment`

  const loadItems = async () => {
    setLoading(true)
    try {
      const res  = await fetch(apiBase)
      const data = await res.json() as { items?: FulfilmentItem[] } | FulfilmentItem[]
      setItems(Array.isArray(data) ? data : (data as { items?: FulfilmentItem[] }).items ?? [])
    } catch {
      setMsg({ ok: false, text: 'Failed to load fulfilment items' })
    }
    setLoading(false)
  }

  useEffect(() => { void loadItems() }, [itineraryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill completedAt when status becomes CONFIRMED or BOOKED
  const handleStatusChange = (
    status: FulfilmentStatus,
    form: FulfilmentFormState,
    setForm: (f: FulfilmentFormState) => void,
  ) => {
    const completedAt =
      COMPLETED_STATUSES.includes(status) && !form.completedAt
        ? new Date().toISOString().slice(0, 16)
        : form.completedAt
    setForm({ ...form, status, completedAt })
  }

  const openEdit = (item: FulfilmentItem) => {
    setShowCreate(false)
    setEditingId(item.id)
    setEditForm({
      type:              item.type,
      description:       item.description,
      status:            item.status,
      supplierReference: item.supplierReference ?? '',
      clientReference:   item.clientReference   ?? '',
      assignedTo:        item.assignedTo         ?? '',
      notes:             item.notes              ?? '',
      completedAt:       item.completedAt        ? item.completedAt.slice(0, 16) : '',
    })
    setMsg(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(apiBase, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId: editingId, ...fulfilmentFormToBody(editForm) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMsg({ ok: true, text: 'Saved' })
      setEditingId(null)
      void loadItems()
    } catch {
      setMsg({ ok: false, text: 'Save failed — try again' })
    }
    setSaving(false)
  }

  const handleDelete = async (itemId: string) => {
    if (!window.confirm('Delete this work item? This cannot be undone.')) return
    setDeleting(true)
    setMsg(null)
    try {
      const res = await fetch(apiBase, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingId(null)
      void loadItems()
    } catch {
      setMsg({ ok: false, text: 'Delete failed — try again' })
    }
    setDeleting(false)
  }

  const handleCreate = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(apiBase, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fulfilmentFormToBody(createForm)),
      })
      if (!res.ok) throw new Error(await res.text())
      setMsg({ ok: true, text: 'Work item created' })
      setShowCreate(false)
      setCreateForm(EMPTY_FORM)
      void loadItems()
    } catch {
      setMsg({ ok: false, text: 'Create failed — try again' })
    }
    setSaving(false)
  }

  // ── Reusable field editor ──────────────────────────────────────────────────

  function FulfilmentFields({
    form,
    setForm,
  }: {
    form: FulfilmentFormState
    setForm: (f: FulfilmentFormState) => void
  }) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as FulfilmentItemType })}
              className={sel}
            >
              {FULFILMENT_ITEM_TYPES.map(t => (
                <option key={t} value={t}>{FULFILMENT_TYPE_ICONS[t]} {t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => handleStatusChange(e.target.value as FulfilmentStatus, form, setForm)}
              className={sel}
            >
              {FULFILMENT_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Description</label>
          <input
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. EK 001 LHR→DXB, 2 pax, Business Class"
            className={inp}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Assigned To</label>
            <input
              value={form.assignedTo}
              onChange={e => setForm({ ...form, assignedTo: e.target.value })}
              placeholder="Advisor name or email"
              className={inp}
            />
          </div>
          <div>
            <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Client Reference</label>
            <input
              value={form.clientReference}
              onChange={e => setForm({ ...form, clientReference: e.target.value })}
              placeholder="Ref shown to client"
              className={inp}
            />
          </div>
        </div>

        <div>
          <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">
            Supplier Ref (PNR/Confirmation) — only record AFTER confirmed booking with supplier
          </label>
          <input
            value={form.supplierReference}
            onChange={e => setForm({ ...form, supplierReference: e.target.value })}
            placeholder="e.g. ABC123 — leave blank until booking is confirmed"
            className={inp}
          />
        </div>

        <div>
          <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Internal notes for this work item…"
            rows={3}
            className={ta}
          />
        </div>

        <div>
          <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">
            Completed At (auto-filled when status set to BOOKED or CONFIRMED)
          </label>
          <input
            type="datetime-local"
            value={form.completedAt}
            onChange={e => setForm({ ...form, completedAt: e.target.value })}
            className={inp}
          />
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base">📦 Fulfilment</h2>
          <p className="text-white/30 text-xs mt-0.5">Post-acceptance booking work items</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setCreateForm(EMPTY_FORM); setMsg(null) }}
          className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-xl text-sm font-bold hover:bg-amber-500/30 transition"
        >
          + Add Work Item
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.ok ? 'bg-green-500/15 text-green-400 border border-green-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'}`}>
          {msg.ok ? `✓ ${msg.text}` : `✕ ${msg.text}`}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white/5 border border-amber-500/30 rounded-2xl p-6">
          <h3 className="text-amber-400 font-bold text-sm mb-4">New Work Item</h3>
          <FulfilmentFields form={createForm} setForm={setCreateForm} />
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleCreate}
              disabled={saving || !createForm.description.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setMsg(null) }}
              className="bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 font-bold px-5 py-2.5 rounded-xl text-sm transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-white/40 text-sm">No fulfilment items yet</p>
          <p className="text-white/20 text-xs mt-1">Click "+ Add Work Item" to create the first one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id}>
              {/* Item row */}
              <button
                onClick={() => editingId === item.id ? setEditingId(null) : openEdit(item)}
                className={`w-full text-left bg-white/5 border rounded-2xl p-4 transition hover:bg-white/[0.07] ${editingId === item.id ? 'border-amber-500/40' : 'border-white/[0.08]'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 border text-[10px] font-bold px-2 py-0.5 rounded-full ${FULFILMENT_TYPE_COLOURS[item.type]}`}>
                        {FULFILMENT_TYPE_ICONS[item.type]} {item.type}
                      </span>
                      <span className={`inline-flex border text-[10px] font-bold px-2 py-0.5 rounded-full ${FULFILMENT_STATUS_COLOURS[item.status]}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium truncate">{item.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {item.assignedTo && (
                        <span className="text-white/30 text-xs">👤 {item.assignedTo}</span>
                      )}
                      {item.supplierReference && (
                        <span className="text-white/30 text-xs">🔖 {item.supplierReference}</span>
                      )}
                      {item.clientReference && (
                        <span className="text-white/30 text-xs">🏷 {item.clientReference}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-white/20 text-xs mt-1 shrink-0">{editingId === item.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Inline editor */}
              {editingId === item.id && (
                <div className="bg-white/[0.04] border border-amber-500/20 border-t-0 rounded-b-2xl px-6 py-5">
                  <FulfilmentFields form={editForm} setForm={setEditForm} />
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving || !editForm.description.trim()}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving…</> : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setMsg(null) }}
                      className="bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 font-bold px-5 py-2.5 rounded-xl text-sm transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleDelete(item.id)}
                      disabled={deleting}
                      className="ml-auto bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 font-bold px-4 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
