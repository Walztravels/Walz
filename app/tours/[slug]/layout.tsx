import type { Metadata } from 'next'
import { prisma } from '@/lib/db'

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const tour = await prisma.tour.findUnique({
    where: { slug: params.slug },
    select: { name: true, location: true, description: true },
  }).catch(() => null)

  const name = tour?.name ?? params.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const location = tour?.location

  return {
    title: `${name}${location ? ` in ${location}` : ''} — Walz Travels`,
    description: tour?.description
      ? tour.description.slice(0, 155)
      : `Book the ${name} private tour with Walz Travels. Expert guides, curated itineraries, and bespoke experiences.`,
    alternates: { canonical: `https://www.walztravels.com/tours/${params.slug}` },
  }
}

export default function TourSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
