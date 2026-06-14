import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60

function parseDuration(dur: string): { days: number; nights: number | null } {
  const nightMatch = dur.match(/(\d+)\s*nights?/i)
  if (nightMatch) {
    const nights = parseInt(nightMatch[1])
    return { days: nights + 1, nights }
  }
  const dayMatch = dur.match(/(\d+)\s*days?/i)
  if (dayMatch) return { days: parseInt(dayMatch[1]), nights: null }
  return { days: 1, nights: null }
}

function imageForLocation(location: string, photos: string[], imageUrl: string | null): string[] {
  if (photos.length) return photos
  if (imageUrl) return [imageUrl]
  const l = location.toLowerCase()
  if (l.includes('dubai') || l.includes('uae'))
    return ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=85']
  if (l.includes('london'))
    return ['https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=85']
  if (l.includes('dublin') || l.includes('ireland'))
    return ['https://images.unsplash.com/photo-1548882382-9b09eb0b71d9?w=800&q=85']
  if (l.includes('paris') || l.includes('france'))
    return ['https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=85']
  if (l.includes('zanzibar') || l.includes('tanzania'))
    return ['https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=800&q=85']
  if (l.includes('toronto') || l.includes('canada'))
    return ['https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=85']
  if (l.includes('new york') || l.includes('usa'))
    return ['https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=85']
  return ['https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=85']
}

function iso2ForLocation(location: string): string | null {
  const l = location.toLowerCase()
  if (l.includes('dubai') || l.includes('uae')) return 'AE'
  if (l.includes('ireland') || l.includes('dublin')) return 'IE'
  if (l.includes('london') || l.includes('united kingdom') || l.includes(' uk')) return 'GB'
  if (l.includes('france') || l.includes('paris')) return 'FR'
  if (l.includes('tanzania') || l.includes('zanzibar')) return 'TZ'
  if (l.includes('canada') || l.includes('toronto')) return 'CA'
  if (l.includes('usa') || l.includes('new york')) return 'US'
  return null
}

export async function GET() {
  try {
    const packages = await prisma.tourListing.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      take: 6,
    })

    const mapped = packages.map((pkg) => {
      const { days, nights } = parseDuration(pkg.duration)
      return {
        id: pkg.id,
        slug: pkg.slug,
        title: pkg.name,
        destination: pkg.location,
        country_iso2: iso2ForLocation(pkg.location),
        tagline: pkg.description.slice(0, 80),
        images: imageForLocation(pkg.location, pkg.photos, pkg.imageUrl),
        price_per_person: pkg.price,
        original_price: null,
        currency: pkg.currency,
        duration_days: days,
        duration_nights: nights,
        total_seats: null,
        seats_booked: 0,
        departure_date: null,
        package_type: 'group',
        is_featured: pkg.order === 0,
      }
    })

    return NextResponse.json(mapped)
  } catch (err) {
    console.error('[featured GET]', err)
    return NextResponse.json([], { status: 200 })
  }
}
