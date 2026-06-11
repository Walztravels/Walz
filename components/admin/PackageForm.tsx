'use client'

import { useState, useRef } from 'react'
import { Plus, X, Loader2, GripVertical } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TravelPackage {
  id: string
  slug: string
  title: string
  destination: string
  country_iso2: string
  tagline: string
  description: string
  highlights: string[]
  inclusions: string[]
  exclusions: string[]
  itinerary: { day: number; title: string; description: string }[]
  images: string[]
  duration_days: number
  duration_nights: number
  price_per_person: number
  currency: string
  original_price: number | null
  deposit_amount: number | null
  package_type: 'group' | 'private' | 'honeymoon' | 'corporate'
  departure_date: string | null
  return_date: string | null
  total_seats: number | null
  seats_booked: number
  departure_city: string
  visa_included: boolean
  flight_included: boolean
  hotel_included: boolean
  hotel_rating: number | null
  meals: string
  is_featured: boolean
  is_active: boolean
  seo_title: string
  seo_description: string
  display_order: number
  created_at: string
  updated_at: string
}

interface Props {
  initialData?: Partial<TravelPackage>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: Record<string, any>) => Promise<void>
  isLoading: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">
      {children}
    </h2>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

const inputCls =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] text-gray-700 bg-white'

const selectCls =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white text-gray-700'

// ── Main Component ────────────────────────────────────────────────────────────

export default function PackageForm({ initialData, onSubmit, isLoading }: Props) {
  const d = initialData ?? {}

  // Section 1 — Basics
  const [title, setTitle]           = useState(d.title ?? '')
  const [slug, setSlug]             = useState(d.slug ?? '')
  const [destination, setDest]      = useState(d.destination ?? '')
  const [countryIso2, setIso2]      = useState(d.country_iso2 ?? '')
  const [tagline, setTagline]       = useState(d.tagline ?? '')
  const [pkgType, setPkgType]       = useState<TravelPackage['package_type']>(d.package_type ?? 'group')
  const [description, setDesc]      = useState(d.description ?? '')

  // Section 2 — Images (10 slots)
  const [images, setImages]         = useState<string[]>(() => {
    const arr = d.images ?? []
    const slots = [...arr]
    while (slots.length < 10) slots.push('')
    return slots.slice(0, 10)
  })
  const [uploading, setUploading]   = useState<number | null>(null)
  const [dragSrc, setDragSrc]       = useState<number | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  // Section 3 — Pricing
  const [price, setPrice]           = useState(String(d.price_per_person ?? ''))
  const [origPrice, setOrigPrice]   = useState(String(d.original_price ?? ''))
  const [deposit, setDeposit]       = useState(String(d.deposit_amount ?? ''))
  const [currency, setCurrency]     = useState(d.currency ?? 'USD')

  // Section 4 — Group Details
  const [depCity, setDepCity]       = useState(d.departure_city ?? '')
  const [depDate, setDepDate]       = useState(d.departure_date ? d.departure_date.slice(0, 10) : '')
  const [retDate, setRetDate]       = useState(d.return_date ? d.return_date.slice(0, 10) : '')
  const [durDays, setDurDays]       = useState(String(d.duration_days ?? ''))
  const [durNights, setDurNights]   = useState(String(d.duration_nights ?? ''))
  const [totalSeats, setTotalSeats] = useState(String(d.total_seats ?? ''))
  const [hotelRating, setHotelRating] = useState(String(d.hotel_rating ?? ''))
  const [meals, setMeals]           = useState(d.meals ?? '')

  // Section 5 — Inclusions / Exclusions / Checkboxes
  const [inclusions, setInclusions] = useState<string[]>(d.inclusions?.length ? d.inclusions : [''])
  const [exclusions, setExclusions] = useState<string[]>(d.exclusions?.length ? d.exclusions : [''])
  const [flightInc, setFlightInc]   = useState(d.flight_included ?? false)
  const [hotelInc, setHotelInc]     = useState(d.hotel_included ?? false)
  const [visaInc, setVisaInc]       = useState(d.visa_included ?? false)

  // Section 6 — Highlights
  const [highlights, setHighlights] = useState<string[]>(d.highlights?.length ? d.highlights : [''])

  // Section 7 — Itinerary
  const [itinerary, setItinerary]   = useState<{ day: number; title: string; description: string }[]>(
    d.itinerary?.length ? d.itinerary : [{ day: 1, title: '', description: '' }]
  )

  // Section 8 — SEO & Settings
  const [seoTitle, setSeoTitle]     = useState(d.seo_title ?? '')
  const [seoDesc, setSeoDesc]       = useState(d.seo_description ?? '')
  const [dispOrder, setDispOrder]   = useState(String(d.display_order ?? 0))
  const [isFeatured, setIsFeatured] = useState(d.is_featured ?? false)
  const [isActive, setIsActive]     = useState(d.is_active !== undefined ? d.is_active : true)

  // ── Image helpers ──────────────────────────────────────────────────────────

  async function uploadFile(idx: number, file: File) {
    setUploading(idx)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/packages/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setImages(prev => { const a = [...prev]; a[idx] = data.url; return a })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragSrc === null || dragSrc === toIdx) return
    setImages(prev => {
      const a = [...prev]
      const tmp = a[dragSrc]
      a[dragSrc] = a[toIdx]
      a[toIdx] = tmp
      return a
    })
    setDragSrc(null)
  }

  // ── List helpers ───────────────────────────────────────────────────────────

  function addListItem(setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter(prev => [...prev, ''])
  }
  function removeListItem(setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) {
    setter(prev => prev.filter((_, i) => i !== idx))
  }
  function updateListItem(setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number, val: string) {
    setter(prev => { const a = [...prev]; a[idx] = val; return a })
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      title,
      slug,
      destination,
      country_iso2: countryIso2,
      tagline,
      package_type: pkgType,
      description,
      images: images.filter(Boolean),
      price_per_person: price ? Number(price) : undefined,
      original_price: origPrice ? Number(origPrice) : null,
      deposit_amount: deposit ? Number(deposit) : null,
      currency,
      departure_city: depCity,
      departure_date: depDate || null,
      return_date: retDate || null,
      duration_days: durDays ? Number(durDays) : null,
      duration_nights: durNights ? Number(durNights) : null,
      total_seats: totalSeats ? Number(totalSeats) : null,
      hotel_rating: hotelRating ? Number(hotelRating) : null,
      meals,
      inclusions: inclusions.filter(Boolean),
      exclusions: exclusions.filter(Boolean),
      flight_included: flightInc,
      hotel_included: hotelInc,
      visa_included: visaInc,
      highlights: highlights.filter(Boolean),
      itinerary: itinerary.filter(it => it.title || it.description),
      seo_title: seoTitle,
      seo_description: seoDesc,
      display_order: Number(dispOrder) || 0,
      is_featured: isFeatured,
      is_active: isActive,
    }
    await onSubmit(data)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">

      {/* ── Section 1: Basics ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>1. Basics</SectionHeading>
        <div className="space-y-4">

          <div>
            <Label required>Title</Label>
            <input
              className={inputCls}
              value={title}
              required
              placeholder="e.g. Dubai Luxury Escape"
              onChange={e => {
                setTitle(e.target.value)
                if (!d.slug) setSlug(toSlug(e.target.value))
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label required>Slug</Label>
              <input
                className={inputCls + ' font-mono'}
                value={slug}
                required
                placeholder="dubai-luxury-escape"
                onChange={e => setSlug(toSlug(e.target.value))}
              />
            </div>
            <div>
              <Label>Package Type</Label>
              <select className={selectCls} value={pkgType} onChange={e => setPkgType(e.target.value as TravelPackage['package_type'])}>
                <option value="group">Group</option>
                <option value="private">Private</option>
                <option value="honeymoon">Honeymoon</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Destination</Label>
              <input className={inputCls} value={destination} placeholder="Dubai, UAE" onChange={e => setDest(e.target.value)} />
            </div>
            <div>
              <Label>Country ISO2</Label>
              <input className={inputCls} value={countryIso2} maxLength={2} placeholder="AE" onChange={e => setIso2(e.target.value.toUpperCase())} />
            </div>
          </div>

          <div>
            <Label>Tagline</Label>
            <input className={inputCls} value={tagline} placeholder="Your gateway to paradise" onChange={e => setTagline(e.target.value)} />
          </div>

          <div>
            <Label>Description</Label>
            <textarea
              className={inputCls + ' resize-y'}
              value={description}
              rows={6}
              placeholder="Full package description…"
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: Images ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>2. Images</SectionHeading>
        <p className="text-xs text-gray-400 mb-4">Drag slots to reorder. Slot 1 is the cover image.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {images.map((url, idx) => (
            <div
              key={idx}
              draggable={!!url}
              onDragStart={() => setDragSrc(idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, idx)}
              className={`relative border-2 rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-[130px] transition-colors ${
                url ? 'border-[#C9A84C]/50 bg-gray-50' : 'border-dashed border-gray-200 bg-gray-50 hover:border-[#C9A84C]/40'
              }`}
            >
              {/* Slot label */}
              <div className={`absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md z-10 ${
                idx === 0 ? 'bg-[#C9A84C] text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {idx === 0 ? 'Cover (slot 1)' : `Slot ${idx + 1}`}
              </div>

              {url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover absolute inset-0" />
                  {/* drag handle */}
                  <div className="absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing bg-black/40 rounded p-0.5">
                    <GripVertical className="w-3.5 h-3.5 text-white" />
                  </div>
                  {/* remove */}
                  <button
                    type="button"
                    onClick={() => setImages(prev => { const a = [...prev]; a[idx] = ''; return a })}
                    className="absolute bottom-2 right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}

              {!url && (
                <div className="flex flex-col items-center gap-2 p-3 w-full">
                  {uploading === idx ? (
                    <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => fileRefs.current[idx]?.click()}
                        className="text-xs font-semibold text-[#0B1F3A] bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Upload
                      </button>
                      <input
                        ref={el => { fileRefs.current[idx] = el }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (file) await uploadFile(idx, file)
                          if (e.target) e.target.value = ''
                        }}
                      />
                      <input
                        type="text"
                        placeholder="or paste URL"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#C9A84C] text-gray-600"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v) {
                            setImages(prev => { const a = [...prev]; a[idx] = v; return a })
                            e.target.value = ''
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const v = (e.target as HTMLInputElement).value.trim()
                            if (v) {
                              setImages(prev => { const a = [...prev]; a[idx] = v; return a });
                              (e.target as HTMLInputElement).value = ''
                            }
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: Pricing ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>3. Pricing</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label required>Price per person</Label>
            <input type="number" className={inputCls} value={price} min="0" step="0.01" required placeholder="0.00" onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <Label>Original price</Label>
            <input type="number" className={inputCls} value={origPrice} min="0" step="0.01" placeholder="0.00" onChange={e => setOrigPrice(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Strikethrough price</p>
          </div>
          <div>
            <Label>Deposit amount</Label>
            <input type="number" className={inputCls} value={deposit} min="0" step="0.01" placeholder="0.00" onChange={e => setDeposit(e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <select className={selectCls} value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="NGN">NGN</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 4: Group Details ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>4. Group Details</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>Departure city</Label>
            <input className={inputCls} value={depCity} placeholder="London" onChange={e => setDepCity(e.target.value)} />
          </div>
          <div>
            <Label>Departure date</Label>
            <input type="date" className={inputCls} value={depDate} onChange={e => setDepDate(e.target.value)} />
          </div>
          <div>
            <Label>Return date</Label>
            <input type="date" className={inputCls} value={retDate} onChange={e => setRetDate(e.target.value)} />
          </div>
          <div>
            <Label>Duration (days)</Label>
            <input type="number" className={inputCls} value={durDays} min="1" placeholder="7" onChange={e => setDurDays(e.target.value)} />
          </div>
          <div>
            <Label>Duration (nights)</Label>
            <input type="number" className={inputCls} value={durNights} min="0" placeholder="6" onChange={e => setDurNights(e.target.value)} />
          </div>
          <div>
            <Label>Total seats</Label>
            <input type="number" className={inputCls} value={totalSeats} min="1" placeholder="20" onChange={e => setTotalSeats(e.target.value)} />
          </div>
          <div>
            <Label>Hotel rating</Label>
            <select className={selectCls} value={hotelRating} onChange={e => setHotelRating(e.target.value)}>
              <option value="">Unrated</option>
              <option value="3">3 Stars</option>
              <option value="4">4 Stars</option>
              <option value="5">5 Stars</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Meals</Label>
            <input className={inputCls} value={meals} placeholder="Breakfast daily" onChange={e => setMeals(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Section 5: Inclusions / Exclusions ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>5. Inclusions & Exclusions</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Inclusions */}
          <div>
            <Label>What&apos;s included</Label>
            <div className="space-y-2">
              {inclusions.map((val, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputCls}
                    value={val}
                    placeholder={`Inclusion ${i + 1}`}
                    onChange={e => updateListItem(setInclusions, i, e.target.value)}
                  />
                  {inclusions.length > 1 && (
                    <button type="button" onClick={() => removeListItem(setInclusions, i)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => addListItem(setInclusions)}
                className="flex items-center gap-1.5 text-xs text-[#C9A84C] font-semibold hover:text-[#b8943d] transition-colors mt-1">
                <Plus className="w-3.5 h-3.5" /> Add inclusion
              </button>
            </div>
          </div>

          {/* Exclusions */}
          <div>
            <Label>What&apos;s excluded</Label>
            <div className="space-y-2">
              {exclusions.map((val, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputCls}
                    value={val}
                    placeholder={`Exclusion ${i + 1}`}
                    onChange={e => updateListItem(setExclusions, i, e.target.value)}
                  />
                  {exclusions.length > 1 && (
                    <button type="button" onClick={() => removeListItem(setExclusions, i)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => addListItem(setExclusions)}
                className="flex items-center gap-1.5 text-xs text-[#C9A84C] font-semibold hover:text-[#b8943d] transition-colors mt-1">
                <Plus className="w-3.5 h-3.5" /> Add exclusion
              </button>
            </div>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="mt-6 flex flex-wrap gap-6">
          {([
            ['flight_included', 'Flight included', flightInc, setFlightInc],
            ['hotel_included', 'Hotel included', hotelInc, setHotelInc],
            ['visa_included', 'Visa included', visaInc, setVisaInc],
          ] as const).map(([key, label, val, setter]) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  val ? 'bg-[#C9A84C]' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${val ? 'translate-x-[18px]' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Section 6: Highlights ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>6. Highlights</SectionHeading>
        <div className="space-y-2 max-w-2xl">
          {highlights.map((val, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                value={val}
                placeholder={`Highlight ${i + 1}`}
                onChange={e => updateListItem(setHighlights, i, e.target.value)}
              />
              {highlights.length > 1 && (
                <button type="button" onClick={() => removeListItem(setHighlights, i)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => addListItem(setHighlights)}
            className="flex items-center gap-1.5 text-xs text-[#C9A84C] font-semibold hover:text-[#b8943d] transition-colors mt-1">
            <Plus className="w-3.5 h-3.5" /> Add highlight
          </button>
        </div>
      </div>

      {/* ── Section 7: Itinerary ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>7. Itinerary</SectionHeading>
        <div className="space-y-4">
          {itinerary.map((item, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider">Day {item.day}</span>
                {itinerary.length > 1 && (
                  <button type="button" onClick={() => setItinerary(prev => prev.filter((_, j) => j !== i))}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              <input
                className={inputCls}
                value={item.title}
                placeholder={`Day ${item.day} title`}
                onChange={e => setItinerary(prev => {
                  const a = [...prev]; a[i] = { ...a[i], title: e.target.value }; return a
                })}
              />
              <textarea
                className={inputCls + ' resize-y'}
                value={item.description}
                rows={3}
                placeholder={`What happens on day ${item.day}…`}
                onChange={e => setItinerary(prev => {
                  const a = [...prev]; a[i] = { ...a[i], description: e.target.value }; return a
                })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItinerary(prev => [...prev, { day: prev.length + 1, title: '', description: '' }])}
            className="flex items-center gap-1.5 text-xs text-[#C9A84C] font-semibold hover:text-[#b8943d] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add day
          </button>
        </div>
      </div>

      {/* ── Section 8: SEO & Settings ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <SectionHeading>8. SEO & Settings</SectionHeading>
        <div className="space-y-4">
          <div>
            <Label>SEO title</Label>
            <input className={inputCls} value={seoTitle} placeholder="Dubai Luxury Escape 2025 | Walz Travels" onChange={e => setSeoTitle(e.target.value)} />
          </div>
          <div>
            <Label>SEO description</Label>
            <textarea className={inputCls + ' resize-none'} value={seoDesc} rows={2}
              placeholder="Book our exclusive Dubai package…"
              onChange={e => setSeoDesc(e.target.value)} />
          </div>
          <div className="w-36">
            <Label>Display order</Label>
            <input type="number" className={inputCls} value={dispOrder} min="0" onChange={e => setDispOrder(e.target.value)} />
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6 pt-2">
            {([
              ['is_featured', 'Featured package', isFeatured, setIsFeatured],
              ['is_active', 'Active (visible)', isActive, setIsActive],
            ] as const).map(([key, label, val, setter]) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    val ? 'bg-[#C9A84C]' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${val ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 bg-[#C9A84C] hover:bg-[#b8943d] disabled:opacity-60 text-white font-bold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {isLoading ? 'Saving…' : 'Save Package'}
      </button>
    </form>
  )
}
