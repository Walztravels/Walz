import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { buildDateRange, buildJadeAnalyticsContext } from '@/lib/commercial/metrics'
import {
  getExecutiveMetrics,
  getRecoveryMetrics,
  getJadeFunnel,
} from '@/lib/commercial/jade-analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const THEMES = [
  'customer service', 'consistency', 'sales excellence', 'teamwork', 'professionalism',
  'leadership', 'continuous learning', 'problem solving', 'travel expertise',
  'attention to detail', 'communication', 'client relationships', 'perseverance',
  'adaptability', 'trust', 'going the extra mile', 'curiosity', 'precision',
]

function todayString() {
  return new Date().toISOString().split('T')[0] // "2026-08-26"
}

function isEligible(
  staff: { role: string; department: string; id: string },
  ann: { audience: string; audienceRoles: string[]; audienceStaffIds: string[] },
): boolean {
  switch (ann.audience) {
    case 'EVERYONE':           return true
    case 'SALES':              return staff.department === 'sales'
    case 'VISA_TEAM':          return staff.department === 'visa'
    case 'TRAVEL_CONSULTANTS': return ['flights','tours','hotels'].includes(staff.department)
    case 'FINANCE':            return staff.department === 'accounts'
    case 'ADMIN_TEAM':         return ['super_admin','admin'].includes(staff.role)
    case 'MANAGEMENT':         return ['super_admin','manager','general_manager'].includes(staff.role)
    case 'SPECIFIC_ROLE':      return ann.audienceRoles.includes(staff.role)
    case 'SPECIFIC_STAFF':     return ann.audienceStaffIds.includes(staff.id)
    default:                   return true
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = todayString()

  // Idempotency guard — do not regenerate if brief already exists today
  const existing = await prisma.jadeDailyBrief.findUnique({ where: { briefDate: today } })
  if (existing) {
    return NextResponse.json({ skipped: true, briefDate: today, reason: 'already_generated' })
  }

  // ── Generate motivation ───────────────────────────────────────────────────────
  const recentHistory = await prisma.motivationHistory.findMany({
    orderBy: { usedOn: 'desc' },
    take: 20,
    select: { theme: true },
  })
  const usedThemes = recentHistory.map(h => h.theme)
  const availableThemes = THEMES.filter(t => !usedThemes.includes(t))
  const themePool = availableThemes.length > 0 ? availableThemes : THEMES
  const selectedTheme = themePool[Math.floor(themePool.length / 2)] // deterministic pick

  let motivation   = 'Doing the right thing consistently is the foundation of every great client relationship.'
  let motivationThought = 'Every call you handle with care today is an investment in a client who returns tomorrow.'
  let motivationTheme   = selectedTheme

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `You generate daily motivational messages for Walz Travels staff — a premium travel agency.

Theme for today: "${selectedTheme}"
Recent themes used (avoid similar): ${usedThemes.slice(0,10).join(', ')}

Requirements:
- Professional, positive, grounded — not inspirational-poster cheesy
- Original phrasing — do not falsely attribute quotes to famous people
- Relevant to travel, customer service, or professional excellence
- "quote": 1–2 short sentences
- "thought": 1–2 sentences that Jade adds as a practical daily follow-through

Reply ONLY with valid JSON (no markdown, no code fences):
{"quote":"...","thought":"...","theme":"${selectedTheme}"}`,
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const parsed = JSON.parse(raw)
    if (parsed.quote && parsed.thought) {
      motivation        = parsed.quote
      motivationThought = parsed.thought
      motivationTheme   = parsed.theme ?? selectedTheme
    }
  } catch (e) {
    console.warn('[jade-brief] motivation generation failed, using fallback:', e)
  }

  // ── Fetch published announcements ─────────────────────────────────────────────
  const announcements = await prisma.staffAnnouncement.findMany({
    where:   { status: 'PUBLISHED' },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
    take:    5,
    select: {
      id: true, title: true, category: true, summary: true,
      detail: true, whatToDo: true, relevantUrl: true,
      priority: true, audience: true, audienceRoles: true, audienceStaffIds: true,
    },
  })

  const urgentCount = announcements.filter(a => a.priority === 'URGENT').length

  // ── Phase 2: Travel Intelligence ─────────────────────────────────────────────
  type TravelItem = {
    headline: string
    summary:  string
    relevance: string
    category: 'FLIGHTS' | 'DESTINATION' | 'INDUSTRY' | 'WEATHER'
  }
  let travelItems: TravelItem[] = []

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const travelMsg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role:    'user',
        content: `You generate travel intelligence for Walz Travels staff daily brief.
Walz Travels is a Nigerian premium travel agency. Staff handle flights, visas, hotels, and tour packages primarily for Nigerian clients traveling to UK, Schengen, US, UAE, Canada, and within Africa.

Generate exactly 3 travel intelligence items useful for Nigerian travel agents.
Focus on: airline updates, route news, airport changes, destination advisories, African carrier news, popular route tips.
Be specific — name airlines, airports, and destinations. Keep each summary under 55 words.

Reply ONLY with valid JSON (no markdown, no code fences):
{"items":[{"headline":"...","summary":"...","relevance":"...","category":"FLIGHTS|DESTINATION|INDUSTRY|WEATHER"}]}`,
      }],
    })
    const travelRaw = travelMsg.content[0].type === 'text' ? travelMsg.content[0].text.trim() : ''
    const travelParsed = JSON.parse(travelRaw)
    if (Array.isArray(travelParsed.items)) travelItems = travelParsed.items.slice(0, 5)
  } catch (e) {
    console.warn('[jade-brief] travel intelligence generation failed:', e)
  }

  // ── Phase 3: Visa Intelligence ────────────────────────────────────────────────
  type VisaItem = {
    destination:    string
    status:         string  // NORMAL | DELAYED | BACKLOGGED | EXPEDITED
    processingDays: string
    notes:          string
    alert:          'GREEN' | 'AMBER' | 'RED'
  }
  let visaItems: VisaItem[] = []

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const visaMsg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{
        role:    'user',
        content: `You generate visa intelligence for Walz Travels staff daily brief.
Walz Travels processes visa applications for Nigerian passport holders to UK, Schengen, USA, Canada, UAE, and Australia.

Generate visa intelligence for these 5 destinations (all 5 required):
UK, Schengen (EU), USA, Canada, UAE

For each, provide: typical current processing times, alert level, and one practical tip for agents.
Keep notes under 40 words per destination.

alert: GREEN (normal), AMBER (some delays/scrutiny), RED (significant delays/restrictions)

Reply ONLY with valid JSON (no markdown, no code fences):
{"items":[{"destination":"...","status":"NORMAL|DELAYED|BACKLOGGED|EXPEDITED","processingDays":"e.g. 15-20","notes":"...","alert":"GREEN|AMBER|RED"}]}`,
      }],
    })
    const visaRaw = visaMsg.content[0].type === 'text' ? visaMsg.content[0].text.trim() : ''
    const visaParsed = JSON.parse(visaRaw)
    if (Array.isArray(visaParsed.items)) visaItems = visaParsed.items.slice(0, 8)
  } catch (e) {
    console.warn('[jade-brief] visa intelligence generation failed:', e)
  }

  // ── Recovery snapshot (Release 3D) ───────────────────────────────────────────
  type RecoverySnapshotItem = { currency: string; total: number }
  type RecoverySnapshot = {
    openCount:            number
    urgentOpenCount:      number
    supplierFailureCount: number
    hotLeadCount:         number
    openValueByCurrency:  RecoverySnapshotItem[]
  }

  let recoverySnapshot: RecoverySnapshot = {
    openCount: 0, urgentOpenCount: 0, supplierFailureCount: 0, hotLeadCount: 0, openValueByCurrency: [],
  }

  if (process.env.RECOVERY_ENGINE_ENABLED === 'true') {
    try {
      const OPEN_STATUSES = ['OPEN', 'CONTACTED', 'IN_PROGRESS']
      const [openTotal, urgentOpen, supplierOpen, hotLeadOpen, openValueRows] = await Promise.all([
        prisma.recoveryOpportunity.count({ where: { status: { in: OPEN_STATUSES } } }),
        prisma.recoveryOpportunity.count({ where: { status: { in: OPEN_STATUSES }, priority: 'URGENT' } }),
        prisma.recoveryOpportunity.count({ where: { status: { in: OPEN_STATUSES }, type: 'SUPPLIER_FAILURE' } }),
        prisma.recoveryOpportunity.count({ where: { status: 'OPEN', type: 'HOT_LEAD' } }),
        prisma.recoveryOpportunity.groupBy({
          by:    ['currency'],
          where: { status: { in: OPEN_STATUSES }, currency: { not: null } },
          _sum:  { amount: true },
        }),
      ])
      recoverySnapshot = {
        openCount:            openTotal,
        urgentOpenCount:      urgentOpen,
        supplierFailureCount: supplierOpen,
        hotLeadCount:         hotLeadOpen,
        openValueByCurrency:  openValueRows
          .filter(r => r.currency !== null)
          .map(r => ({ currency: r.currency as string, total: r._sum?.amount ?? 0 })),
      }
    } catch (e) {
      console.warn('[jade-brief] recovery snapshot failed:', e)
    }
  }

  // ── Jade commerce snapshot (Phase 4) ─────────────────────────────────────────
  // Graceful fallback: commerce failure must NOT prevent brief generation.
  // No LLM involved — only authoritative DB metrics.
  type CommerceSnapshot = {
    date: string
    leads: number | null
    trips: number | null
    paymentsCaptured: number | null
    confirmedBookings: number | null
    funnelStages: Array<{ label: string; count: number }> | null
    openRecovery: number | null
    recoveredToday: number | null
  }
  let commerceSnapshot: CommerceSnapshot | null = null
  if (process.env.JADE_COMMERCE_ANALYTICS_ENABLED === 'true') {
    try {
      const todayRange = buildDateRange('today')
      const jadeCtx    = await buildJadeAnalyticsContext(todayRange)
      const jadeOpts   = { range: todayRange, jadeFilter: 'JADE_ASSISTED' as const }
      const [exec, funnel, recovery4e] = await Promise.allSettled([
        getExecutiveMetrics(jadeOpts, jadeCtx),
        getJadeFunnel(todayRange, jadeCtx),
        getRecoveryMetrics(jadeOpts, jadeCtx),
      ])
      commerceSnapshot = {
        date:              today,
        leads:             exec.status === 'fulfilled' ? exec.value.leads             : null,
        trips:             exec.status === 'fulfilled' ? exec.value.trips             : null,
        paymentsCaptured:  exec.status === 'fulfilled' ? exec.value.paymentsCaptured  : null,
        confirmedBookings: exec.status === 'fulfilled' ? exec.value.confirmedBookings : null,
        funnelStages:      funnel.status  === 'fulfilled' ? funnel.value.stages.map(s => ({ label: s.label, count: s.count })) : null,
        openRecovery:      recovery4e.status === 'fulfilled' ? recovery4e.value.openCount    : null,
        recoveredToday:    recovery4e.status === 'fulfilled' ? recovery4e.value.recoveredCount : null,
      }
    } catch (e) {
      console.warn('[jade-brief] commerce snapshot failed (non-fatal):', e)
      commerceSnapshot = null
    }
  }

  // ── Build and persist the brief ───────────────────────────────────────────────
  const contentJson = {
    announcements: announcements.map(a => ({
      id:          a.id,
      title:       a.title,
      category:    a.category,
      summary:     a.summary,
      detail:      a.detail,
      whatToDo:    a.whatToDo,
      relevantUrl: a.relevantUrl,
      priority:    a.priority,
    })),
    travel:    travelItems,
    visa:      visaItems,
    urgentCount,
    recovery:  recoverySnapshot,
    commerce:  commerceSnapshot,
  }

  const brief = await prisma.jadeDailyBrief.create({
    data: {
      briefDate:         today,
      motivation,
      motivationThought,
      motivationTheme,
      contentJson,
    },
  })

  // Record theme so it is not repeated soon
  await prisma.motivationHistory.create({ data: { theme: motivationTheme, usedOn: today } })

  // ── Deliver in-app notifications to all active staff ─────────────────────────
  const allStaff = await prisma.staff.findMany({
    where:  { isActive: true },
    select: { id: true, role: true, department: true },
  })

  let notifCount = 0
  for (const staff of allStaff) {
    // Skip if already delivered today (idempotency)
    const already = await prisma.briefDeliveryLog.findUnique({
      where: { briefDate_staffId_channel: { briefDate: today, staffId: staff.id, channel: 'admin' } },
    })
    if (already) continue

    try {
      await prisma.staffNotification.create({
        data: {
          staffId:    staff.id,
          category:   'JADE_BRIEF',
          title:      `Jade Daily Brief — ${today}`,
          body:       motivation,
          important:  urgentCount > 0,
          sourceId:   brief.id,
          sourceType: 'brief',
        },
      })
      await prisma.briefDeliveryLog.create({
        data: { briefDate: today, staffId: staff.id, channel: 'admin' },
      })
      notifCount++
    } catch {
      // Unique constraint on BriefDeliveryLog is the real guard; ignore duplicate errors
    }
  }

  // ── Announcement notifications for newly published items ──────────────────────
  // Announcements without a delivery log get a separate notification per eligible staff
  for (const ann of announcements) {
    for (const staff of allStaff) {
      if (!isEligible(staff, ann)) continue
      const already = await prisma.briefDeliveryLog.findUnique({
        where: { briefDate_staffId_channel: { briefDate: today, staffId: staff.id, channel: `ann_${ann.id}` } },
      })
      if (already) continue

      try {
        await prisma.staffNotification.create({
          data: {
            staffId:    staff.id,
            category:   'SYSTEM',
            title:      ann.title,
            body:       ann.summary,
            important:  ann.priority === 'URGENT',
            sourceId:   ann.id,
            sourceType: 'announcement',
          },
        })
        await prisma.briefDeliveryLog.create({
          data: { briefDate: today, staffId: staff.id, channel: `ann_${ann.id}` },
        })
      } catch {
        // idempotent — duplicate constraint or create failure
      }
    }
  }

  // Update staffReached count
  await prisma.jadeDailyBrief.update({
    where: { briefDate: today },
    data:  { staffReached: notifCount },
  })

  return NextResponse.json({
    ok:          true,
    briefDate:   today,
    staffReached: notifCount,
    announcements: announcements.length,
    urgentCount,
  })
}
