// Hot lead detection (Release 3B)
//
// Finds leads with recent CommercialEvent activity, scores them,
// and creates HOT_LEAD RecoveryOpportunity for any scoring >= HOT_THRESHOLD.
// Also sends a StaffNotification (idempotent via sourceId).
//
// Detection window: leads with CommercialEvent in last LEAD_DETECT_WINDOW_DAYS days.
// Idempotent: dedupeKey = "HOT_LEAD:<leadId>"

import prisma                        from '@/lib/db'
import { createOrUpdateOpportunity } from './opportunity'
import { scoreLeadInput, HOT_THRESHOLD } from './scoring-leads'
import { createStaffNotification }   from '../notifications/staff'

const LEAD_DETECT_WINDOW_DAYS = parseInt(
  process.env.LEAD_DETECT_WINDOW_DAYS ?? '7', 10
)

export async function detectHotLeads(): Promise<number> {
  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') return 0

  const since = new Date(Date.now() - LEAD_DETECT_WINDOW_DAYS * 86_400_000)

  // Find leads that have had CommercialEvent activity recently
  const activeLeadIds = await prisma.commercialEvent
    .findMany({
      where:   { leadId: { not: null }, createdAt: { gte: since } },
      select:  { leadId: true },
      distinct: ['leadId'],
      take:    500,
    })
    .then(rows => rows.map(r => r.leadId as string))

  if (activeLeadIds.length === 0) return 0

  // Batch-load leads (exclude closed / converted)
  const leads = await prisma.lead.findMany({
    where: {
      id:     { in: activeLeadIds },
      status: { notIn: ['Closed'] },
    },
    select: {
      id:              true,
      name:            true,
      email:           true,
      assignedToId:    true,
      jadeQualifiedAt: true,
      createdAt:       true,
      marketingOptOut: true,
    },
  })

  if (leads.length === 0) return 0

  // Batch-load CommercialEvents for all these leads
  const allEvents = await prisma.commercialEvent.findMany({
    where:   { leadId: { in: leads.map(l => l.id) }, createdAt: { gte: since } },
    select:  { leadId: true, event: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Group events by leadId
  const eventsByLead = new Map<string, typeof allEvents>()
  for (const ev of allEvents) {
    if (!ev.leadId) continue
    const existing = eventsByLead.get(ev.leadId) ?? []
    existing.push(ev)
    eventsByLead.set(ev.leadId, existing)
  }

  // Batch-load proposal view counts via email
  const leadEmails = leads.map(l => l.email).filter(Boolean) as string[]
  const openQuotes = leadEmails.length > 0
    ? await prisma.quote.findMany({
        where:  {
          clientEmail: { in: leadEmails },
          convertedAt: null,
          declinedAt:  null,
          status:      { in: ['sent', 'viewed'] },
        },
        select: { clientEmail: true, viewCount: true },
      })
    : []

  const viewCountByEmail = new Map<string, number>()
  for (const q of openQuotes) {
    const cur = viewCountByEmail.get(q.clientEmail) ?? 0
    viewCountByEmail.set(q.clientEmail, cur + q.viewCount)
  }

  let created = 0

  for (const lead of leads) {
    try {
      const events           = eventsByLead.get(lead.id) ?? []
      const proposalViewCount = lead.email
        ? (viewCountByEmail.get(lead.email) ?? 0)
        : 0

      const { score, band, signals } = scoreLeadInput({
        lead:   { jadeQualifiedAt: lead.jadeQualifiedAt, createdAt: lead.createdAt },
        events,
        proposalViewCount,
      })

      if (band !== 'HOT') continue

      // Best estimate of lead value: sum of event amounts for this lead
      const amounts = allEvents
        .filter(e => e.leadId === lead.id)
        .map(e => (e as { amount?: number | null }).amount)
        .filter((a): a is number => typeof a === 'number' && a > 0)
      const topAmount = amounts.length > 0 ? Math.max(...amounts) : undefined

      // Opportunity notation includes signal list in reason
      const reason = `HOT lead — score ${score}. Signals: ${signals.join(', ')}`

      await createOrUpdateOpportunity({
        type:        'HOT_LEAD',
        reason,
        priority:    'HIGH',
        amount:      topAmount,
        leadId:      lead.id,
        assignedToId: lead.assignedToId ?? null,
      })

      // Staff notification — idempotent: one per scoring event in this window
      // sourceId = "recovery:hotlead:<leadId>:<YYYY-MM-DD>" to re-notify daily
      const today     = new Date().toISOString().slice(0, 10)
      const sourceId  = `recovery:hotlead:${lead.id}:${today}`

      if (lead.assignedToId) {
        await createStaffNotification({
          staffId:    lead.assignedToId,
          category:   'BOOKING',
          title:      `🔥 Hot lead — ${lead.name}`,
          body:       `Score: ${score}. ${signals.slice(0, 3).join(' · ')}`,
          important:  true,
          sourceId,
          sourceType: 'recovery_hot_lead',
          data:       { leadId: lead.id, score, signals },
        })
      }

      created++
    } catch (err) {
      console.warn('[HotLeadDetect] failed for lead', lead.id, (err as Error).message)
    }
  }

  return created
}
