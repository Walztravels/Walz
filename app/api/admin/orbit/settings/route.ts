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
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({ settings: settings ?? DEFAULTS })
}

export async function PUT(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

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
  }

  const settings = await prisma.orbitSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  })

  return NextResponse.json({ settings })
}
