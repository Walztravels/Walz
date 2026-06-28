import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const WALZ_DEFAULTS = {
  toneOfVoice: `Professional yet warm and culturally aware. Speak directly to the Nigerian and Ghanaian diaspora. Use phrases like "your journey", "we've got you", "stress-free". Never corporate-cold. Always include a clear WhatsApp CTA (+447398753797). Celebrate client wins enthusiastically.`,
  targetAudiences: [
    { id: '1', name: 'Nigerians in UK', description: 'Professionals on Tier 2/Skilled Worker visas, families visiting home, students' },
    { id: '2', name: 'Ghanaians in Canada', description: 'Permanent residents visiting family, new immigrants needing travel docs' },
    { id: '3', name: 'Diaspora in UAE', description: 'Nigerians/Ghanaians working in Dubai/Abu Dhabi, visiting UK/Canada' },
    { id: '4', name: 'Japa travellers', description: 'Nigerians planning to relocate to UK or Canada, need visa + flight' },
  ],
  hashtags: [
    '#WalzTravels', '#JapaWithWalz', '#NigerianDiaspora',
    '#GhanaianDiaspora', '#UKVisa', '#CanadaVisa',
    '#VisaApproved', '#Lagos2London', '#Accra2London',
    '#AfricanDiaspora', '#TravelWithWalz', '#JadeAI',
    '#VisaConsultant', '#TravelAgency', '#WalzTravelsReview',
  ],
  themes: [
    '90%+ UK visa approval rate',
    'Jade AI travel assistant',
    'WhatsApp support always available',
    'IATA accreditation in progress',
    'Serving UK, Canada, UAE, Nigeria, Ghana',
    'Real Duffel flight bookings',
    'Client success stories',
  ],
  templates: [
    { id: '1', name: 'Visa Approval Win', structure: '🎉 [Client first name] just got their [country] visa approved! [Personal detail]. Ready to start your own journey? WhatsApp us now 👇' },
    { id: '2', name: 'Flight Deal', structure: '✈️ [Route] from [price] | [Airline] | [Date range]. Limited seats. DM or WhatsApp +447398753797 to book.' },
    { id: '3', name: 'Visa Tip', structure: '📋 [Number] things that get UK visas REFUSED (and how we help you avoid them): [Tips]. Save this post. Share with someone who needs it.' },
    { id: '4', name: 'Tour Promo', structure: '🌍 [Destination] group tour | [Month] [Year] | [Price] per person. [Highlight 1], [Highlight 2], [Highlight 3]. Limited to [N] people.' },
  ],
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let memory = await prisma.marketingBrandMemory.findUnique({ where: { id: 'singleton' } })

  if (!memory) {
    memory = await prisma.marketingBrandMemory.create({
      data: {
        id: 'singleton',
        ...WALZ_DEFAULTS,
        targetAudiences: WALZ_DEFAULTS.targetAudiences,
        hashtags: WALZ_DEFAULTS.hashtags,
        themes: WALZ_DEFAULTS.themes,
        templates: WALZ_DEFAULTS.templates,
      },
    })
  } else if (!memory.toneOfVoice) {
    memory = await prisma.marketingBrandMemory.update({
      where: { id: 'singleton' },
      data: WALZ_DEFAULTS,
    })
  }

  return NextResponse.json({ memory })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as Partial<{
    toneOfVoice: string
    targetAudiences: unknown[]
    hashtags: unknown[]
    themes: unknown[]
    templates: unknown[]
  }>

  const memory = await prisma.marketingBrandMemory.upsert({
    where: { id: 'singleton' },
    update: {
      ...(body.toneOfVoice     !== undefined && { toneOfVoice:     body.toneOfVoice     }),
      ...(body.targetAudiences !== undefined && { targetAudiences: body.targetAudiences }),
      ...(body.hashtags        !== undefined && { hashtags:        body.hashtags        }),
      ...(body.themes          !== undefined && { themes:          body.themes          }),
      ...(body.templates       !== undefined && { templates:       body.templates       }),
    },
    create: { id: 'singleton', ...WALZ_DEFAULTS, ...body },
  })

  return NextResponse.json({ memory })
}
