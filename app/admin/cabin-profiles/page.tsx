'use client'

import { useState, useRef, useEffect } from 'react'

interface CabinProfile {
  cabinClass:  string
  label:       string
  headline:    string
  subheadline: string
  imageUrl:    string
  badgeText:   string
  badgeColor:  string
  features:    string[]
}

const CABINS: { key: string; name: string; icon: string }[] = [
  { key: 'ECONOMY',  name: 'Economy',       icon: '✈' },
  { key: 'BUSINESS', name: 'Business',      icon: '★' },
  { key: 'FIRST',    name: 'First Class',   icon: '✦' },
]

const DEFAULT_PROFILES: Record<string, CabinProfile> = {
  ECONOMY: {
    cabinClass: 'ECONOMY', label: 'Economy Class',
    headline: 'Comfortable travel at great value',
    subheadline: 'Everything you need for a great journey',
    imageUrl: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?w=1200&h=700&fit=crop&q=85',
    badgeText: 'Economy', badgeColor: '#6B7280',
    features: ['Ergonomic reclining seats', 'Personal entertainment screen', 'USB charging at every seat', 'Complimentary meal service', '23kg checked baggage included'],
  },
  BUSINESS: {
    cabinClass: 'BUSINESS', label: 'Business Class',
    headline: 'Where every flight feels like an arrival',
    subheadline: 'Flat-bed suites, fine dining and dedicated service',
    imageUrl: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=1200&h=700&fit=crop&q=85',
    badgeText: '★ Business', badgeColor: '#C9A84C',
    features: ['Lie-flat bed up to 78"', 'Private suite with closing door', 'Dedicated check-in & fast track', 'Fine dining with sommelier service', 'Exclusive airport lounge access'],
  },
  FIRST: {
    cabinClass: 'FIRST', label: 'First Class',
    headline: 'An experience beyond the journey',
    subheadline: 'Private suites, personal butler and onboard shower spa',
    imageUrl: 'https://images.unsplash.com/photo-1559117207-f5157de3c88e?w=600&h=380&fit=crop&q=85',
    badgeText: '✦ First Class', badgeColor: '#0B1F3A',
    features: ['Private enclosed suite with sliding door', 'Personal onboard butler', 'Onboard shower spa', 'Custom menu by Michelin-star chefs', 'Chauffeur transfer to & from airport'],
  },
}

export default function CabinProfilesAdminPage() {
  const [activeTab, setActiveTab]     = useState('ECONOMY')
  const [profiles, setProfiles]       = useState<Record<string, CabinProfile>>(DEFAULT_PROFILES)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [photoMode, setPhotoMode]     = useState<'url' | 'upload'>('url')
  const [uploading, setUploading]     = useState(false)
  const [newFeature, setNewFeature]   = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/cabin-profiles')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.profiles) && data.profiles.length > 0) {
          const map: Record<string, CabinProfile> = { ...DEFAULT_PROFILES }
          for (const p of data.profiles) {
            map[p.cabinClass] = {
              ...p,
              features: Array.isArray(p.features) ? p.features : [],
            }
          }
          setProfiles(map)
        }
      })
      .catch(() => {})
  }, [])

  const profile = profiles[activeTab] ?? DEFAULT_PROFILES[activeTab]

  function updateField(field: keyof CabinProfile, value: string | string[]) {
    setProfiles(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }))
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/cabin-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, cabinClass: activeTab }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/cabin-profiles/${activeTab}/photo`, {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        updateField('imageUrl', data.imageUrl)
      }
    } catch { /* silent */ } finally {
      setUploading(false)
    }
  }

  function addFeature() {
    const trimmed = newFeature.trim()
    if (!trimmed) return
    updateField('features', [...(profile.features ?? []), trimmed])
    setNewFeature('')
  }

  function removeFeature(i: number) {
    updateField('features', (profile.features ?? []).filter((_, idx) => idx !== i))
  }

  function moveFeature(i: number, dir: -1 | 1) {
    const arr = [...(profile.features ?? [])]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    updateField('features', arr)
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Cabin Experience Profiles</h1>
        <p className="text-[#0B1F3A]/50 text-sm mt-1">
          Manage the hero image, headline, and feature bullets shown to clients on the flight detail page.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {CABINS.map(c => (
          <button
            key={c.key}
            onClick={() => { setActiveTab(c.key); setSaved(false) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === c.key
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-[#E2D9CC] text-[#0B1F3A]/60 hover:border-[#0B1F3A]/30'
            }`}
          >
            <span>{c.icon}</span>
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — edit form */}
        <div className="space-y-5">
          {/* Image */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] overflow-hidden">
            <div className="p-4 border-b border-[#E2D9CC]">
              <h3 className="font-semibold text-[#0B1F3A] text-sm">Hero Image</h3>
            </div>
            {profile.imageUrl && (
              <div className="relative h-40 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profile.imageUrl}
                  alt="Cabin hero"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                {(['url', 'upload'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPhotoMode(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      photoMode === m ? 'bg-[#0B1F3A] text-white' : 'bg-[#F5F2EE] text-[#0B1F3A]/60'
                    }`}
                  >
                    {m === 'url' ? 'Image URL' : 'Upload file'}
                  </button>
                ))}
              </div>
              {photoMode === 'url' ? (
                <input
                  type="url"
                  value={profile.imageUrl}
                  onChange={e => updateField('imageUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                />
              ) : (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFileUpload(f)
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-2 rounded-xl border-2 border-dashed border-[#E2D9CC] text-sm text-[#0B1F3A]/40 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : 'Click to choose image'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Text fields */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-4">
            <h3 className="font-semibold text-[#0B1F3A] text-sm">Content</h3>
            {([
              { field: 'label',       label: 'Label',       placeholder: 'Economy Class'                     },
              { field: 'headline',    label: 'Headline',    placeholder: 'Comfortable travel at great value' },
              { field: 'subheadline', label: 'Subheadline', placeholder: 'Everything you need…'              },
              { field: 'badgeText',   label: 'Badge text',  placeholder: 'Economy'                           },
            ] as const).map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="block text-xs text-[#0B1F3A]/50 mb-1">{label}</label>
                <input
                  type="text"
                  value={profile[field] ?? ''}
                  onChange={e => updateField(field, e.target.value)}
                  placeholder={placeholder}
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-[#0B1F3A]/50 mb-1">Badge color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={profile.badgeColor ?? '#C9A84C'}
                  onChange={e => updateField('badgeColor', e.target.value)}
                  className="h-9 w-14 rounded-lg border border-[#E2D9CC] cursor-pointer"
                />
                <span className="text-sm text-[#0B1F3A]/60 font-mono">{profile.badgeColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — features */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
          <h3 className="font-semibold text-[#0B1F3A] text-sm mb-3">Feature Bullets</h3>
          <div className="space-y-2 mb-4 max-h-[360px] overflow-y-auto pr-1">
            {(profile.features ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#FAF7F2] rounded-xl px-3 py-2">
                <span className="text-[#C9A84C] text-sm flex-shrink-0">✓</span>
                <span className="flex-1 text-sm text-[#0B1F3A]">{f}</span>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => moveFeature(i, -1)} disabled={i === 0}
                    className="text-[#0B1F3A]/30 hover:text-[#0B1F3A] text-xs px-1 disabled:opacity-20">↑</button>
                  <button onClick={() => moveFeature(i, 1)} disabled={i === (profile.features ?? []).length - 1}
                    className="text-[#0B1F3A]/30 hover:text-[#0B1F3A] text-xs px-1 disabled:opacity-20">↓</button>
                  <button onClick={() => removeFeature(i)}
                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                </div>
              </div>
            ))}
            {(profile.features ?? []).length === 0 && (
              <p className="text-sm text-[#0B1F3A]/30 text-center py-4">No features yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFeature}
              onChange={e => setNewFeature(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFeature()}
              placeholder="Add a feature bullet…"
              className="flex-1 border border-[#E2D9CC] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
            />
            <button onClick={addFeature}
              className="px-4 py-2 rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#0B1F3A]/80 transition-colors">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6 bg-white rounded-2xl border border-[#E2D9CC] overflow-hidden">
        <div className="p-4 border-b border-[#E2D9CC] flex items-center justify-between">
          <h3 className="font-semibold text-[#0B1F3A] text-sm">Preview (as shown to client)</h3>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: profile.badgeColor }}
          >
            {profile.badgeText || 'Badge'}
          </span>
        </div>
        <div className="relative h-48 bg-gray-100">
          {profile.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/80 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5 text-white">
            <p className="text-xl font-bold">{profile.headline || 'Headline'}</p>
            <p className="text-sm text-white/70 mt-0.5">{profile.subheadline || 'Subheadline'}</p>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2">
          {(profile.features ?? []).slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-[#0B1F3A]">
              <span className="text-[#C9A84C] font-bold">✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all disabled:opacity-60"
        >
          {saving ? 'Saving…' : `Save ${CABINS.find(c => c.key === activeTab)?.name} profile`}
        </button>
        {saved && (
          <span className="text-green-600 text-sm font-medium">✓ Saved</span>
        )}
      </div>
    </div>
  )
}
