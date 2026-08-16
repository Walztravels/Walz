import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { invalidateSignatureCache } from '@/lib/email/signature'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  id:           'singleton',
  logoUrl:      'https://www.walztravels.com/walz-logo.png',
  accentColor:  '#C9A84C',
  brandColor:   '#0B1F3A',
  officeCities: ['London', 'Toronto', 'Dubai', 'Lagos', 'Accra'],
  footerNote:   '',
}

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await prisma.signatureSettings.upsert({
    where:  { id: 'singleton' },
    create: DEFAULTS,
    update: {},
  })

  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    logoUrl?:      string
    accentColor?:  string
    brandColor?:   string
    officeCities?: string[]
    footerNote?:   string
  }

  const settings = await prisma.signatureSettings.upsert({
    where:  { id: 'singleton' },
    create: { ...DEFAULTS, ...body, updatedBy: session.id },
    update: {
      ...(body.logoUrl      !== undefined && { logoUrl:      body.logoUrl      }),
      ...(body.accentColor  !== undefined && { accentColor:  body.accentColor  }),
      ...(body.brandColor   !== undefined && { brandColor:   body.brandColor   }),
      ...(body.officeCities !== undefined && { officeCities: body.officeCities }),
      ...(body.footerNote   !== undefined && { footerNote:   body.footerNote   }),
      updatedBy: session.id,
    },
  })

  invalidateSignatureCache()

  await prisma.activityLog.create({
    data: { action: 'signature_settings_updated', detail: `Updated by ${session.name}` },
  }).catch(() => {})

  return NextResponse.json(settings)
}
