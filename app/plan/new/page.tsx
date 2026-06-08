'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  Map, Sparkles, BookOpen, ArrowRight, ArrowLeft,
  Loader2, Calendar, DollarSign, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Template = {
  id: string
  name: string
  destination: string
  description: string | null
  coverImage: string | null
  duration: number
  highlights: string[]
  category: string
}

// ── Inner component (uses useSearchParams) ────────────────────────────────
function NewTripInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedTemplate = searchParams.get('template')

  const [path, setPath] = useState<'scratch' | 'template' | 'ai' | null>(
    preselectedTemplate ? 'template' : null
  )
  const [template, setTemplate] = useState<Template | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    budget: '',
    description: '',
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/portal/login?redirect=/plan/new')
    }
  }, [status, router])

  useEffect(() => {
    if (path === 'template') fetchTemplates()
  }, [path])

  useEffect(() => {
    if (preselectedTemplate && templates.length > 0) {
      const t = templates.find(t => t.id === preselectedTemplate)
      if (t) selectTemplate(t)
    }
  }, [preselectedTemplate, templates])

  async function fetchTemplates() {
    setLoading(true)
    try {
      const res = await fetch('/api/trips/templates')
      const data = await res.json()
      setTemplates(data.templates ?? [])
    } finally {
      setLoading(false)
    }
  }

  function selectTemplate(t: Template) {
    setTemplate(t)
    setForm(prev => ({
      ...prev,
      title:       t.name,
      destination: t.destination,
      description: t.description ?? '',
    }))
  }

  async function handleSubmit() {
    if (!form.title || !form.destination) return
    setSubmitting(true)

    try {
      const endpoint = template ? '/api/trips/templates' : '/api/trips'
      const body = template
        ? {
            templateId: template.id,
            title:      form.title,
            startDate:  form.startDate || undefined,
          }
        : {
            title:       form.title,
            destination: form.destination,
            description: form.description || undefined,
            startDate:   form.startDate  || undefined,
            endDate:     form.endDate    || undefined,
            budget:      form.budget     ? parseFloat(form.budget) : undefined,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.trip?.id) {
        // If AI path, redirect to planner with ai=1 so it auto-generates
        const qs = path === 'ai' ? '?generate=1' : ''
        router.push(`/plan/${data.trip.id}${qs}`)
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060F1E]">
      {/* Header */}
      <div className="bg-[#0B1F3A] border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-4">
          <button
            onClick={() => path ? setPath(null) : router.push('/plan/library')}
            className="p-2 rounded-xl text-white/40 hover:bg-white/8 hover:text-white transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">
              {path === null ? 'Start a new trip' : path === 'template' && !template ? 'Choose a template' : 'Trip details'}
            </h1>
            <p className="text-sm text-white/40">
              {path === null ? 'How would you like to begin?' : path === 'template' && !template ? 'Pick a curated itinerary to start from' : 'Fill in the details'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Path selection ── */}
        {path === null && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <PathCard
              icon={<Map className="w-7 h-7" />}
              title="From scratch"
              description="Blank canvas. Add flights, hotels, activities manually."
              color="from-blue-600/20"
              onClick={() => setPath('scratch')}
            />
            <PathCard
              icon={<BookOpen className="w-7 h-7" />}
              title="From template"
              description="Start with a Walz-curated itinerary for a popular destination."
              color="from-[#C9A84C]/20"
              onClick={() => setPath('template')}
            />
            <PathCard
              icon={<Sparkles className="w-7 h-7" />}
              title="Let Jade plan it"
              description="Tell Jade where you're going and she'll build your itinerary with AI."
              color="from-purple-600/20"
              onClick={() => setPath('ai')}
            />
          </div>
        )}

        {/* ── Template picker ── */}
        {path === 'template' && !template && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className="group text-left bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden hover:border-[#C9A84C]/40 transition-all"
                  >
                    <div className="relative h-32 bg-[#0f2d52] overflow-hidden">
                      {t.coverImage && (
                        <Image src={t.coverImage} alt={t.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/80 to-transparent" />
                      <p className="absolute bottom-2 left-3 text-xs font-bold text-[#C9A84C] uppercase tracking-wider">{t.duration} days</p>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-white text-sm mb-1">{t.name}</h3>
                      <p className="text-xs text-white/40 flex items-center gap-1"><Globe className="w-3 h-3" />{t.destination}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Trip details form ── */}
        {(path === 'scratch' || path === 'ai' || (path === 'template' && template)) && (
          <div className="max-w-lg mx-auto">
            {template && (
              <div className="flex items-center gap-3 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl p-4 mb-6">
                {template.coverImage && (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={template.coverImage} alt={template.name} fill className="object-cover" />
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-[#C9A84C] uppercase tracking-wider">Template selected</p>
                  <p className="text-sm font-semibold text-white">{template.name}</p>
                  <p className="text-xs text-white/40">{template.duration} days · {template.destination}</p>
                </div>
                <button onClick={() => setTemplate(null)} className="ml-auto text-xs text-white/40 hover:text-white">Change</button>
              </div>
            )}

            {path === 'ai' && (
              <div className="flex items-start gap-3 bg-purple-600/10 border border-purple-500/20 rounded-xl p-4 mb-6">
                <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-purple-300">Jade AI will plan this</p>
                  <p className="text-xs text-white/40">After creating the trip, Jade will automatically generate a day-by-day itinerary based on your destination and dates.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Trip title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Summer in Paris"
                  className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Destination *</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                  placeholder="e.g. Paris, France"
                  className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Start date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">End date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C9A84C]/50"
                  />
                </div>
              </div>

              {path !== 'template' && (
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Description (optional)</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="What's this trip about?"
                    className="w-full bg-[#0B1F3A] border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/50 resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !form.title || !form.destination}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl font-bold text-sm hover:bg-[#dbb95a] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Creating trip...</>
                ) : (
                  <>{path === 'ai' ? <><Sparkles className="w-4 h-4" />Create & let Jade plan</> : <><ArrowRight className="w-4 h-4" />Create trip</>}</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Path card ─────────────────────────────────────────────────────────────
function PathCard({ icon, title, description, color, onClick }: {
  icon: React.ReactNode; title: string; description: string; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left p-6 rounded-2xl border border-white/8 bg-gradient-to-br via-transparent to-transparent hover:border-white/20 transition-all',
        color
      )}
    >
      <div className="text-[#C9A84C] mb-3 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="font-bold text-white text-base mb-1">{title}</h3>
      <p className="text-xs text-white/50 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-1 text-xs text-[#C9A84C] font-semibold">
        Choose <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </button>
  )
}

// ── Page export with Suspense (for useSearchParams) ───────────────────────
export default function NewTripPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#060F1E] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <NewTripInner />
    </Suspense>
  )
}
