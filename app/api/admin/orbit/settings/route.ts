import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'

const DEFAULTS = {
  siteUrl: 'https://www.walztravels.com',
  brandName: 'WalzTravels',
  brandSuffix: '| WalzTravels',
  targetCountries: [],
  targetLanguages: [],
  targetAudiences: [],
  services: [],
  competitors: [],
  priorityDestinations: [],
  publishingFrequency: 'weekly',
  brandVoice: '',
  internalLinkRules: '',
  keywordExclusions: [],
  approvalRequired: true,
  qualityThreshold: 80,
  automationLevel: 'generate_drafts',
  notificationsEmail: '',
  tokenCapPerCampaign: 4000,
  imageCapPerCampaign: 8,
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [settings, bufferInt, seInt, gscInt] = await Promise.all([
    prisma.orbitSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'se_ranking' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } }),
  ])
  const bufferMeta = (bufferInt?.meta ?? {}) as Record<string, unknown>
  const seMeta     = (seInt?.meta    ?? {}) as Record<string, unknown>
  const gscMeta    = (gscInt?.meta   ?? {}) as Record<string, unknown>
  const base = settings ?? DEFAULTS
  return NextResponse.json({
    settings: {
      ...base,
      // Full settings page names
      bufferAccessToken:    bufferMeta.accessToken ? '••••••••' : '',
      bufferChannels:       (bufferMeta.channels ?? {}),
      seRankingApiKey:      seMeta.apiKey     ? '••••••••' : '',
      gscServiceAccountJson: gscMeta.serviceAccountJson ? '••••••••' : '',
      gscSiteUrl:           (gscMeta.siteUrl as string) ?? '',
      // Integrations page aliases
      bufferToken:          bufferMeta.accessToken ? '••••••••' : '',
      bufferConnected:      bufferInt?.connected ?? false,
      seApiKey:             seMeta.apiKey ? '••••••••' : '',
      seConnected:          seInt?.connected ?? false,
      gscJson:              gscMeta.serviceAccountJson ? '••••••••' : '',
      gscConnected:         gscInt?.connected ?? false,
    },
  })
}

export async function PUT(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  // Integration-only saves (from Integrations page) don't touch OrbitSettings rows
  if (body.integrationKey) {
    return handleIntegrationSave(body, session)
  }

  if (!body.siteUrl) return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })

  // Automation level guard — never silently enable autonomous publishing
  const automationLevel = body.automationLevel as string | undefined
  const VALID_LEVELS = ['research_only', 'generate_drafts', 'generate_and_fix', 'publish_approved']
  if (automationLevel && !VALID_LEVELS.includes(automationLevel)) {
    return NextResponse.json({ error: 'Invalid automation level' }, { status: 400 })
  }

  const data = {
    siteUrl:              body.siteUrl as string,
    brandName:            (body.brandName as string) ?? DEFAULTS.brandName,
    brandSuffix:          (body.brandSuffix as string) ?? DEFAULTS.brandSuffix,
    targetCountries:      (body.targetCountries as string[]) ?? [],
    targetLanguages:      (body.targetLanguages as string[]) ?? [],
    targetAudiences:      (body.targetAudiences as string[]) ?? [],
    services:             (body.services as string[]) ?? [],
    competitors:          (body.competitors as string[]) ?? [],
    priorityDestinations: (body.priorityDestinations as string[]) ?? [],
    publishingFrequency:  (body.publishingFrequency as string) ?? DEFAULTS.publishingFrequency,
    brandVoice:           (body.brandVoice as string) ?? '',
    internalLinkRules:    (body.internalLinkRules as string) ?? '',
    keywordExclusions:    (body.keywordExclusions as string[]) ?? [],
    approvalRequired:     typeof body.approvalRequired === 'boolean' ? body.approvalRequired : true,
    qualityThreshold:     typeof body.qualityThreshold === 'number' ? body.qualityThreshold : DEFAULTS.qualityThreshold,
    automationLevel:      automationLevel ?? DEFAULTS.automationLevel,
    notificationsEmail:   (body.notificationsEmail as string) ?? '',
    tokenCapPerCampaign:  typeof body.tokenCapPerCampaign === 'number' ? body.tokenCapPerCampaign : DEFAULTS.tokenCapPerCampaign,
    imageCapPerCampaign:  typeof body.imageCapPerCampaign === 'number' ? body.imageCapPerCampaign : DEFAULTS.imageCapPerCampaign,
  }

  const settings = await prisma.orbitSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  })

  // Persist credentials to orbit_integrations (kept separate for security)
  async function upsertIntegration(id: string, updates: Record<string, unknown>, connected: boolean) {
    const existing = await prisma.orbitIntegration.findUnique({ where: { id } })
    const meta = { ...((existing?.meta ?? {}) as Record<string, unknown>), ...updates }
    await prisma.orbitIntegration.upsert({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { id, connected, credentialsSet: connected, meta: meta as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { connected, credentialsSet: connected, meta: meta as any },
    })
  }

  const bufferToken    = body.bufferAccessToken as string | undefined
  const bufferChannels = body.bufferChannels as Record<string, string> | undefined
  if (bufferToken !== undefined || bufferChannels !== undefined) {
    const existing = await prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } })
    const existingMeta = (existing?.meta ?? {}) as Record<string, unknown>
    const newMeta: Record<string, unknown> = { ...existingMeta }
    if (bufferToken !== undefined) newMeta.accessToken = bufferToken
    if (bufferChannels !== undefined) newMeta.channels = bufferChannels
    const isConnected = typeof newMeta.accessToken === 'string' && (newMeta.accessToken as string).length > 10
    await upsertIntegration('buffer', newMeta, isConnected)
  }

  const seKey = body.seRankingApiKey as string | undefined
  if (seKey !== undefined && seKey !== '••••••••') {
    const connected = seKey.length > 5
    await upsertIntegration('se_ranking', { apiKey: seKey }, connected)
  }

  const gscJson    = body.gscServiceAccountJson as string | undefined
  const gscSiteUrl = body.gscSiteUrl as string | undefined
  if ((gscJson !== undefined && gscJson !== '••••••••') || gscSiteUrl !== undefined) {
    const existing = await prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } })
    const existingMeta = (existing?.meta ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    if (gscJson && gscJson !== '••••••••') updates.serviceAccountJson = gscJson
    if (gscSiteUrl !== undefined) updates.siteUrl = gscSiteUrl
    const merged = { ...existingMeta, ...updates }
    const isConnected = typeof merged.serviceAccountJson === 'string' && (merged.serviceAccountJson as string).length > 10
    await upsertIntegration('gsc', merged, isConnected)
  }

  // Re-fetch and merge integration config for UI response (tokens masked)
  const [bufferInt, seInt, gscInt] = await Promise.all([
    prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'se_ranking' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } }),
  ])
  const bufferMeta = (bufferInt?.meta ?? {}) as Record<string, unknown>
  const seMeta     = (seInt?.meta    ?? {}) as Record<string, unknown>
  const gscMeta    = (gscInt?.meta   ?? {}) as Record<string, unknown>

  return NextResponse.json({
    settings: {
      ...settings,
      bufferAccessToken:     bufferMeta.accessToken        ? '••••••••' : '',
      bufferChannels:        (bufferMeta.channels ?? {})    as Record<string, string>,
      seRankingApiKey:       seMeta.apiKey               ? '••••••••' : '',
      gscServiceAccountJson: gscMeta.serviceAccountJson  ? '••••••••' : '',
      gscSiteUrl:            (gscMeta.siteUrl as string) ?? '',
    },
  })
}

// Integration-only save: persists credentials without touching OrbitSettings
async function handleIntegrationSave(body: Record<string, unknown>, session: { email: string; role: string }) {
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  async function upsertInt(id: string, updates: Record<string, unknown>, connected: boolean) {
    const existing = await prisma.orbitIntegration.findUnique({ where: { id } })
    const merged   = { ...((existing?.meta ?? {}) as Record<string, unknown>), ...updates }
    await prisma.orbitIntegration.upsert({
      where:  { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { id, connected, credentialsSet: connected, meta: merged as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { connected, credentialsSet: connected, meta: merged as any },
    })
  }

  const key = body.integrationKey as string

  if (key === 'buffer') {
    const token    = body.bufferToken as string | undefined
    const channels = body.bufferChannels as Record<string, string> | undefined
    const existing = await prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } })
    const existingMeta = (existing?.meta ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = { ...existingMeta }
    if (token && token !== '••••••••') updates.accessToken = token
    if (channels) {
      const existingChannels = (existingMeta.channels ?? {}) as Record<string, string>
      updates.channels = {
        ...existingChannels,
        ...Object.fromEntries(Object.entries(channels).filter(([, v]) => typeof v === 'string' && v.trim())),
      }
    }
    const isConnected = typeof updates.accessToken === 'string' && (updates.accessToken as string).length > 10
    await upsertInt('buffer', updates, isConnected)
  } else if (key === 'se_ranking') {
    const apiKey = body.seApiKey as string | undefined
    if (apiKey && apiKey !== '••••••••') {
      await upsertInt('se_ranking', { apiKey }, apiKey.length > 5)
    }
  } else if (key === 'gsc') {
    const gscJson    = body.gscJson as string | undefined
    const gscSiteUrl = body.gscSiteUrl as string | undefined
    const updates: Record<string, unknown> = {}
    if (gscJson && gscJson !== '••••••••') updates.serviceAccountJson = gscJson
    if (gscSiteUrl) updates.siteUrl = gscSiteUrl
    if (Object.keys(updates).length) {
      const existing = await prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } })
      const merged   = { ...((existing?.meta ?? {}) as Record<string, unknown>), ...updates }
      const isConnected = typeof merged.serviceAccountJson === 'string' && (merged.serviceAccountJson as string).length > 10
      await upsertInt('gsc', merged, isConnected)
    }
  } else {
    return NextResponse.json({ error: 'Unknown integrationKey' }, { status: 400 })
  }

  // Return updated masked state
  const [bufInt, seInt, gscInt] = await Promise.all([
    prisma.orbitIntegration.findUnique({ where: { id: 'buffer' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'se_ranking' } }),
    prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } }),
  ])
  const bMeta = (bufInt?.meta ?? {}) as Record<string, unknown>
  const sMeta = (seInt?.meta  ?? {}) as Record<string, unknown>
  const gMeta = (gscInt?.meta ?? {}) as Record<string, unknown>

  return NextResponse.json({
    settings: {
      bufferToken:     bMeta.accessToken        ? '••••••••' : '',
      bufferConnected: bufInt?.connected        ?? false,
      bufferChannels:  (bMeta.channels ?? {})   as Record<string, string>,
      seApiKey:        sMeta.apiKey             ? '••••••••' : '',
      seConnected:     seInt?.connected         ?? false,
      gscJson:         gMeta.serviceAccountJson ? '••••••••' : '',
      gscSiteUrl:      (gMeta.siteUrl as string) ?? '',
      gscConnected:    gscInt?.connected        ?? false,
    },
  })
}
