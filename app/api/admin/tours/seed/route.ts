import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const SEED_TOURS = [
  {
    name: 'London Private Day Tour',
    slug: 'london-private-day-tour',
    description: "Explore London's iconic landmarks with a private guide. Tower of London, Westminster, St Paul's, and Borough Market — all in one unforgettable day.",
    location: 'London, United Kingdom',
    duration: '1 Day',
    price: 350,
    currency: 'GBP',
    imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(["Tower of London", "Westminster Abbey", "Buckingham Palace", "Borough Market", "St Paul's Cathedral"]),
    active: true,
    order: 1,
    type: 'tour',
  },
  {
    name: 'Dubai Desert Safari & Dinner',
    slug: 'dubai-desert-safari',
    description: 'Experience the magic of the Arabian desert — dune bashing, camel riding, traditional dinner under the stars, and cultural entertainment.',
    location: 'Dubai, United Arab Emirates',
    duration: '6 Hours',
    price: 120,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(['Dune bashing', 'Camel riding', 'Traditional BBQ dinner', 'Belly dancing', 'Henna art']),
    active: true,
    order: 2,
    type: 'tour',
  },
  {
    name: 'Toronto City & Niagara Falls',
    slug: 'toronto-niagara-falls-tour',
    description: "Discover Toronto's vibrant neighbourhoods then witness the thundering power of Niagara Falls — one of the world's greatest natural wonders.",
    location: 'Toronto, Canada',
    duration: '2 Days',
    price: 280,
    currency: 'CAD',
    imageUrl: 'https://images.unsplash.com/photo-1503549207964-47dfe6cef5d0?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1503549207964-47dfe6cef5d0?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(['CN Tower', 'Niagara Falls boat tour', 'Distillery District', 'Kensington Market', 'Dinner cruise']),
    active: true,
    order: 3,
    type: 'tour',
  },
  {
    name: 'Lagos Cultural Heritage Tour',
    slug: 'lagos-cultural-heritage',
    description: "Discover the vibrant heart of Africa's largest city — from the historic Badagry slave port to Nike Art Gallery, Lekki Conservation Centre, and authentic street food.",
    location: 'Lagos, Nigeria',
    duration: '1 Day',
    price: 85,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(['Nike Art Gallery', 'Lekki Conservation Centre', 'Terra Kulture', 'Street food tour', 'Bar Beach sunset']),
    active: true,
    order: 4,
    type: 'tour',
  },
  {
    name: 'Accra Heritage & Beach Day',
    slug: 'accra-heritage-beach',
    description: "Explore the soul of Ghana — Kwame Nkrumah Memorial, Jamestown lighthouse, Makola Market, and end the day on the pristine beaches of Labadi.",
    location: 'Accra, Ghana',
    duration: '1 Day',
    price: 75,
    currency: 'USD',
    imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(['Kwame Nkrumah Memorial', 'Jamestown Lighthouse', 'Makola Market', 'Labadi Beach', 'Cape Coast day trip option']),
    active: true,
    order: 5,
    type: 'tour',
  },
  {
    name: 'Paris Weekend Escape',
    slug: 'paris-weekend-escape',
    description: 'A curated 3-day Paris experience — the Eiffel Tower, Louvre, Montmartre, Seine river cruise, and the finest French cuisine.',
    location: 'Paris, France',
    duration: '3 Days',
    price: 450,
    currency: 'EUR',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80&auto=format&fit=crop',
    photos: ['https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80&auto=format&fit=crop'],
    highlights: JSON.stringify(['Eiffel Tower', 'Louvre Museum', 'Seine River Cruise', 'Montmartre', 'Versailles day trip']),
    active: true,
    order: 6,
    type: 'tour',
  },
]

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let created = 0
  for (const tour of SEED_TOURS) {
    const exists = await prisma.tourListing.findFirst({ where: { slug: tour.slug } })
    if (!exists) {
      await prisma.tourListing.create({ data: tour as Parameters<typeof prisma.tourListing.create>[0]['data'] })
      created++
    }
  }

  return NextResponse.json({ ok: true, created, message: `${created} tours added` })
}
