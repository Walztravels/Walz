'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Save, Plus, Trash2, GripVertical, RefreshCw, CheckCircle,
  ToggleLeft, ToggleRight, X, Upload, ChevronDown, ChevronUp,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'about' | 'homepage' | 'general'

interface TimelineEvent {
  id: string; icon: string; title: string; description: string; order: number; active: boolean
}

interface SiteContentMap { [key: string]: { label: string; value: string; group: string } }

interface TeamMember {
  id: string; name: string; role: string; bio: string | null; photoUrl: string | null; whatsapp: string | null; order: number; active: boolean
}

const ICONS = ['plane', 'landmark', 'leaf', 'globe'] as const
const ICON_LABELS: Record<string, string> = { plane: '✈️ Plane', landmark: '🏛️ Landmark', leaf: '🍁 Leaf', globe: '🌍 Globe' }

const EMPTY_MILESTONE: Omit<TimelineEvent, 'id'> = { icon: 'plane', title: '', description: '', order: 0, active: true }
const EMPTY_MEMBER: Omit<TeamMember, 'id'> = { name: '', role: '', bio: null, photoUrl: null, whatsapp: null, order: 0, active: true }

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SaveBadge({ saved }: { saved: boolean }) {
  if (!saved) return null
  return (
    <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
      <CheckCircle className="w-4 h-4" /> Saved
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContentManagerPage() {
  const [tab, setTab] = useState<Tab>('about')

  // About tab state
  const [timeline, setTimeline]         = useState<TimelineEvent[]>([])
  const [tlLoading, setTlLoading]       = useState(true)
  const [tlSaving, setTlSaving]         = useState(false)
  const [tlSaved, setTlSaved]           = useState(false)
  const [newMilestone, setNewMilestone] = useState(false)
  const [newMilestoneData, setNewMilestoneData] = useState<Omit<TimelineEvent, 'id'>>({ ...EMPTY_MILESTONE })
  const dragIndexRef = useRef<number | null>(null)

  // Site content state
  const [content, setContent]     = useState<SiteContentMap>({})
  const [ctLoading, setCtLoading] = useState(true)
  const [ctSaving, setCtSaving]   = useState<string | null>(null)
  const [ctSaved, setCtSaved]     = useState<string | null>(null)
  const [ctValues, setCtValues]   = useState<Record<string, string>>({})

  // Team state
  const [team, setTeam]           = useState<TeamMember[]>([])
  const [tmLoading, setTmLoading] = useState(true)
  const [tmSaving, setTmSaving]   = useState(false)
  const [tmSaved, setTmSaved]     = useState(false)
  const [newMember, setNewMember] = useState(false)
  const [newMemberData, setNewMemberData] = useState<Omit<TeamMember, 'id'>>({ ...EMPTY_MEMBER })
  const [tmUploading, setTmUploading] = useState(false)
  const teamPhotoRef = useRef<HTMLInputElement>(null)

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadTimeline = useCallback(async () => {
    setTlLoading(true)
    const r = await fetch('/api/admin/content/timeline')
    const d: TimelineEvent[] = await r.json()
    setTimeline(d)
    setTlLoading(false)
  }, [])

  const loadContent = useCallback(async () => {
    setCtLoading(true)
    const r = await fetch('/api/admin/content/site')
    const d: SiteContentMap = await r.json()
    setContent(d)
    const init: Record<string, string> = {}
    for (const [k, v] of Object.entries(d)) init[k] = v.value
    setCtValues(init)
    setCtLoading(false)
  }, [])

  const loadTeam = useCallback(async () => {
    setTmLoading(true)
    const r = await fetch('/api/admin/content/team')
    const d: TeamMember[] = await r.json()
    setTeam(d)
    setTmLoading(false)
  }, [])

  useEffect(() => { void loadTimeline(); void loadContent(); void loadTeam() }, [loadTimeline, loadContent, loadTeam])

  // ── Timeline ────────────────────────────────────────────────────────────────

  async function saveTimeline() {
    setTlSaving(true)
    await Promise.all(timeline.map((e, i) =>
      fetch('/api/admin/content/timeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...e, order: i }),
      })
    ))
    setTlSaving(false); setTlSaved(true); setTimeout(() => setTlSaved(false), 3000)
  }

  async function addMilestone() {
    if (!newMilestoneData.title.trim()) return
    await fetch('/api/admin/content/timeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newMilestoneData, order: timeline.length }),
    })
    setNewMilestone(false); setNewMilestoneData({ ...EMPTY_MILESTONE }); void loadTimeline()
  }

  async function deleteMilestone(id: string) {
    if (!confirm('Delete this milestone?')) return
    await fetch('/api/admin/content/timeline', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    void loadTimeline()
  }

  async function toggleMilestone(e: TimelineEvent) {
    await fetch('/api/admin/content/timeline', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, active: !e.active }),
    })
    void loadTimeline()
  }

  function handleTlDragStart(i: number) { dragIndexRef.current = i }
  function handleTlDragOver(ev: React.DragEvent, i: number) {
    ev.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === i) return
    const next = [...timeline]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    dragIndexRef.current = i
    setTimeline(next)
  }

  // ── Site content ────────────────────────────────────────────────────────────

  async function saveContentGroup(group: string) {
    const keys = Object.entries(content).filter(([, v]) => v.group === group).map(([k]) => k)
    const payload: Record<string, string> = {}
    for (const k of keys) payload[k] = ctValues[k] ?? ''
    setCtSaving(group)
    await fetch('/api/admin/content/site', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setCtSaving(null); setCtSaved(group); setTimeout(() => setCtSaved(null), 3000)
  }

  // ── Team ────────────────────────────────────────────────────────────────────

  async function addTeamMember() {
    if (!newMemberData.name.trim()) return
    await fetch('/api/admin/content/team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newMemberData, order: team.length }),
    })
    setNewMember(false); setNewMemberData({ ...EMPTY_MEMBER }); void loadTeam()
  }

  async function deleteMember(id: string) {
    if (!confirm('Delete this team member?')) return
    await fetch('/api/admin/content/team', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    void loadTeam()
  }

  async function toggleMember(m: TeamMember) {
    await fetch('/api/admin/content/team', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, active: !m.active }),
    })
    void loadTeam()
  }

  async function saveMemberField(id: string, key: string, value: string) {
    await fetch('/api/admin/content/team', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [key]: value }),
    })
  }

  async function handleTeamPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setTmUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('key', `team_${Date.now()}`)
    form.append('label', `Team photo — ${newMemberData.name || 'member'}`)
    const res = await fetch('/api/admin/images', { method: 'POST', body: form })
    if (res.ok) {
      const { url } = await res.json() as { url: string }
      setNewMemberData((m) => ({ ...m, photoUrl: url }))
    }
    setTmUploading(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Content Manager</h1>
        <p className="text-gray-500 text-sm mt-1">Manage website text, timelines, team and homepage content.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 max-w-sm">
        {(['about', 'homepage', 'general'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold capitalize transition-all ${
              tab === t ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-gray-500 hover:text-[#0B1F3A]'
            }`}
          >
            {t === 'about' ? 'About Page' : t === 'homepage' ? 'Homepage' : 'General'}
          </button>
        ))}
      </div>

      {/* ── ABOUT TAB ─────────────────────────────────────────────────────── */}
      {tab === 'about' && (
        <div className="space-y-8 max-w-3xl">

          {/* Company story */}
          {!ctLoading && (['about'] as const).map(() => {
            const aboutKeys = Object.entries(content).filter(([, v]) => v.group === 'about')
            return (
              <div key="about-block" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-[#0B1F3A]">Company Story</h2>
                  <SaveBadge saved={ctSaved === 'about'} />
                </div>
                <div className="px-6 py-5 space-y-5">
                  {aboutKeys.map(([key, meta]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">{meta.label}</label>
                      <textarea
                        value={ctValues[key] ?? ''}
                        onChange={(e) => setCtValues((v) => ({ ...v, [key]: e.target.value }))}
                        rows={7}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C9A84C] resize-y"
                      />
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-5">
                  <button
                    onClick={() => saveContentGroup('about')}
                    disabled={ctSaving === 'about'}
                    className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    {ctSaving === 'about' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Story
                  </button>
                </div>
              </div>
            )
          })}

          {/* Timeline milestones */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#0B1F3A]">Journey Milestones</h2>
                <p className="text-xs text-gray-400 mt-0.5">Drag to reorder · changes saved per milestone</p>
              </div>
              <div className="flex items-center gap-3">
                <SaveBadge saved={tlSaved} />
                <button
                  onClick={() => setNewMilestone(true)}
                  className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add milestone
                </button>
              </div>
            </div>

            {tlLoading ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {timeline.map((event, i) => (
                  <div
                    key={event.id}
                    draggable
                    onDragStart={() => handleTlDragStart(i)}
                    onDragOver={(ev) => handleTlDragOver(ev, i)}
                    className="px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-gray-300 mt-1 cursor-grab flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <select
                            value={event.icon}
                            onChange={async (e) => {
                              const next = timeline.map((ev, j) => j === i ? { ...ev, icon: e.target.value } : ev)
                              setTimeline(next)
                            }}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-[#C9A84C]"
                          >
                            {ICONS.map((ic) => <option key={ic} value={ic}>{ICON_LABELS[ic]}</option>)}
                          </select>
                          <input
                            value={event.title}
                            onChange={(e) => setTimeline(timeline.map((ev, j) => j === i ? { ...ev, title: e.target.value } : ev))}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#C9A84C] font-medium"
                            placeholder="Milestone title"
                          />
                        </div>
                        <textarea
                          value={event.description}
                          onChange={(e) => setTimeline(timeline.map((ev, j) => j === i ? { ...ev, description: e.target.value } : ev))}
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none text-gray-600"
                          placeholder="Description…"
                        />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => toggleMilestone(event)}>
                          {event.active
                            ? <ToggleRight className="w-5 h-5 text-green-500" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                        </button>
                        <button onClick={() => deleteMilestone(event.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new milestone form */}
            {newMilestone && (
              <div className="px-6 py-4 border-t border-gray-100 bg-amber-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-[#0B1F3A]">New Milestone</p>
                  <button onClick={() => setNewMilestone(false)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <select
                      value={newMilestoneData.icon}
                      onChange={(e) => setNewMilestoneData((m) => ({ ...m, icon: e.target.value }))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-[#C9A84C]"
                    >
                      {ICONS.map((ic) => <option key={ic} value={ic}>{ICON_LABELS[ic]}</option>)}
                    </select>
                    <input
                      value={newMilestoneData.title}
                      onChange={(e) => setNewMilestoneData((m) => ({ ...m, title: e.target.value }))}
                      placeholder="Milestone title"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <textarea
                    value={newMilestoneData.description}
                    onChange={(e) => setNewMilestoneData((m) => ({ ...m, description: e.target.value }))}
                    rows={3}
                    placeholder="Description…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none"
                  />
                  <button
                    onClick={addMilestone}
                    className="bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2 rounded-lg text-sm font-semibold"
                  >
                    Add Milestone
                  </button>
                </div>
              </div>
            )}

            {timeline.length > 0 && !tlLoading && (
              <div className="px-6 pb-5 pt-4 border-t border-gray-100 flex items-center gap-4">
                <button
                  onClick={saveTimeline}
                  disabled={tlSaving}
                  className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {tlSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All Milestones
                </button>
                <SaveBadge saved={tlSaved} />
              </div>
            )}
          </div>

          {/* Stats */}
          {!ctLoading && (() => {
            const statsKeys = [
              { key: 'stats_markets',   label: 'Markets Served' },
              { key: 'stats_approval',  label: 'Visa Approval Rate' },
              { key: 'stats_countries', label: 'Countries Covered' },
              { key: 'stats_support',   label: 'Support Hours' },
            ]
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-[#0B1F3A]">Stats Section</h2>
                  <p className="text-xs text-gray-400">Displayed on About page and homepage</p>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-4">
                  {statsKeys.map(({ label }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                      <input
                        type="text"
                        defaultValue={label === 'Markets Served' ? '6' : label === 'Visa Approval Rate' ? '90%+' : label === 'Countries Covered' ? '199' : '24/7'}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                        placeholder={label}
                      />
                    </div>
                  ))}
                </div>
                <p className="px-6 pb-4 text-xs text-gray-400">Note: Stats are currently hardcoded. These fields are for reference.</p>
              </div>
            )
          })()}

          {/* Team Members */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#0B1F3A]">Team Members</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manage public-facing team profiles</p>
              </div>
              <button
                onClick={() => setNewMember(true)}
                className="flex items-center gap-1.5 text-xs text-[#C9A84C] hover:text-[#0B1F3A] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add member
              </button>
            </div>

            {tmLoading ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : team.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No team members yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {team.map((m) => (
                  <div key={m.id} className="px-6 py-4 flex items-start gap-4">
                    {/* Photo */}
                    <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                      {m.photoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg font-bold">{m.name.charAt(0)}</div>}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[#0B1F3A] text-sm">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.role}</div>
                      {m.bio && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.bio}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleMember(m)}>
                        {m.active
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </button>
                      <button onClick={() => deleteMember(m.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new team member */}
            {newMember && (
              <div className="px-6 py-5 border-t border-gray-100 bg-amber-50">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-[#0B1F3A]">New Team Member</p>
                  <button onClick={() => setNewMember(false)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                    <input value={newMemberData.name} onChange={(e) => setNewMemberData((m) => ({ ...m, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" placeholder="Full name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Role *</label>
                    <input value={newMemberData.role} onChange={(e) => setNewMemberData((m) => ({ ...m, role: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" placeholder="Job title" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bio</label>
                    <textarea value={newMemberData.bio ?? ''} onChange={(e) => setNewMemberData((m) => ({ ...m, bio: e.target.value || null }))} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none" placeholder="Short bio…" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp</label>
                    <input value={newMemberData.whatsapp ?? ''} onChange={(e) => setNewMemberData((m) => ({ ...m, whatsapp: e.target.value || null }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" placeholder="+44..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Photo</label>
                    <input ref={teamPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleTeamPhotoUpload} />
                    {newMemberData.photoUrl ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={newMemberData.photoUrl} alt="Team member photo preview" className="w-10 h-10 rounded-lg object-cover" />
                        <button onClick={() => setNewMemberData((m) => ({ ...m, photoUrl: null }))} className="text-red-400 text-xs">Remove</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => teamPhotoRef.current?.click()}
                        disabled={tmUploading}
                        className="flex items-center gap-1.5 border border-gray-200 hover:border-[#C9A84C] text-gray-500 hover:text-[#C9A84C] px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {tmUploading ? 'Uploading…' : 'Upload photo'}
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={addTeamMember} className="bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2 rounded-lg text-sm font-semibold">
                  Add Member
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HOMEPAGE TAB ───────────────────────────────────────────────────── */}
      {tab === 'homepage' && (
        <div className="space-y-6 max-w-2xl">
          {!ctLoading && (() => {
            const homeKeys = Object.entries(content).filter(([, v]) => v.group === 'homepage')
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-[#0B1F3A]">Hero Content</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Text shown in the homepage hero section</p>
                  </div>
                  <SaveBadge saved={ctSaved === 'homepage'} />
                </div>
                <div className="px-6 py-5 space-y-4">
                  {homeKeys.map(([key, meta]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">{meta.label}</label>
                      <input
                        value={ctValues[key] ?? ''}
                        onChange={(e) => setCtValues((v) => ({ ...v, [key]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-5">
                  <button
                    onClick={() => saveContentGroup('homepage')}
                    disabled={ctSaving === 'homepage'}
                    className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    {ctSaving === 'homepage' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Hero Content
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── GENERAL TAB ────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <div className="space-y-6 max-w-2xl">
          {!ctLoading && (() => {
            const genKeys = Object.entries(content).filter(([, v]) => v.group === 'general')
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-[#0B1F3A]">Brand & SEO</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Global brand language and meta tags</p>
                  </div>
                  <SaveBadge saved={ctSaved === 'general'} />
                </div>
                <div className="px-6 py-5 space-y-4">
                  {genKeys.map(([key, meta]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">{meta.label}</label>
                      {key.includes('pitch') || key.includes('description') ? (
                        <textarea
                          value={ctValues[key] ?? ''}
                          onChange={(e) => setCtValues((v) => ({ ...v, [key]: e.target.value }))}
                          rows={4}
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C] resize-none"
                        />
                      ) : (
                        <input
                          value={ctValues[key] ?? ''}
                          onChange={(e) => setCtValues((v) => ({ ...v, [key]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-5">
                  <button
                    onClick={() => saveContentGroup('general')}
                    disabled={ctSaving === 'general'}
                    className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  >
                    {ctSaving === 'general' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
