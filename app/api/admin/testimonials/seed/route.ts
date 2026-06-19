import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULTS = [
  { name: 'Amara Osei', location: 'London, UK', trip: 'Dubai Honeymoon', rating: 5, initials: 'AO', sortOrder: 1,
    text: 'Walz Travels made our Dubai honeymoon absolutely perfect. From the business class flights to the Burj Al Arab stay, every detail was flawless. The WhatsApp support was incredible — they were available even at 2am when I had a question.' },
  { name: 'Patrick Brennan', location: 'Dublin, Ireland', trip: 'Dublin Private Tour', rating: 5, initials: 'PB', sortOrder: 2,
    text: "Booked the private Dublin tour for my parents' anniversary and they were blown away. The guide was so knowledgeable and the whole day was seamlessly organised. Already planning to use Walz Travels for our New York trip." },
  { name: 'Priya Sharma', location: 'Manchester, UK', trip: 'US Visa Assistance', rating: 5, initials: 'PS', sortOrder: 3,
    text: 'Getting a US visa seemed impossible until Walz Travels stepped in. They guided us through every single document, followed up with the embassy, and we had our visas within 3 weeks. Worth every penny.' },
  { name: 'Kwame A.', location: 'Accra, Ghana', trip: 'Canada Visitor Visa', rating: 5, initials: 'KA', sortOrder: 4,
    text: 'Canada visa approved first attempt. The document checklist was perfect — not a single thing missing. I had tried twice before with other agents and failed. Walz Travels made the whole process simple and straightforward.' },
  { name: 'Blessing O.', location: 'London, UK', trip: 'UAE Business Travel', rating: 5, initials: 'BO', sortOrder: 5,
    text: 'Dubai business trip sorted in 48 hours. Visa, flights and hotel all handled without me having to chase anyone. Everything was confirmed and ready to go before I even had time to worry. Exceptional service.' },
]

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.testimonial.count()
  if (existing > 0) {
    return NextResponse.json({ message: 'Already seeded', count: existing })
  }

  const created = await prisma.testimonial.createMany({ data: DEFAULTS })
  return NextResponse.json({ ok: true, created: created.count })
}
