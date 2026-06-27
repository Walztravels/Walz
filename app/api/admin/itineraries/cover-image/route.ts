import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

const DESTINATION_IMAGES: Record<string, string> = {
  // Middle East
  'dubai': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1600&q=90&fit=crop',
  'abu dhabi': 'https://images.unsplash.com/photo-1576506295286-5cda18df43e7?w=1600&q=90&fit=crop',
  'doha': 'https://images.unsplash.com/photo-1563991655280-cb95c4eb7d38?w=1600&q=90&fit=crop',
  'riyadh': 'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?w=1600&q=90&fit=crop',
  'muscat': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=90&fit=crop',
  'istanbul': 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=1600&q=90&fit=crop',
  'amman': 'https://images.unsplash.com/photo-1547234943-b93a9c3ddf16?w=1600&q=90&fit=crop',
  'beirut': 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=1600&q=90&fit=crop',
  // Africa
  'zanzibar': 'https://images.unsplash.com/photo-1590512948681-ae1ded30b9cb?w=1600&q=90&fit=crop',
  'cape town': 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=1600&q=90&fit=crop',
  'nairobi': 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1600&q=90&fit=crop',
  'marrakech': 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=1600&q=90&fit=crop',
  'cairo': 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=1600&q=90&fit=crop',
  'accra': 'https://images.unsplash.com/photo-1599507593499-a3f7d7d97667?w=1600&q=90&fit=crop',
  'lagos': 'https://images.unsplash.com/photo-1604340893611-53dc12f57fde?w=1600&q=90&fit=crop',
  'maldives': 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1600&q=90&fit=crop',
  'seychelles': 'https://images.unsplash.com/photo-1605451793880-db61d2e9ffc9?w=1600&q=90&fit=crop',
  'mauritius': 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=1600&q=90&fit=crop',
  'johannesburg': 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=1600&q=90&fit=crop',
  'kigali': 'https://images.unsplash.com/photo-1587656265655-87cf3fa50cf5?w=1600&q=90&fit=crop',
  // Europe
  'paris': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&q=90&fit=crop',
  'london': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1600&q=90&fit=crop',
  'rome': 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1600&q=90&fit=crop',
  'barcelona': 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1600&q=90&fit=crop',
  'amsterdam': 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=1600&q=90&fit=crop',
  'santorini': 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1600&q=90&fit=crop',
  'mykonos': 'https://images.unsplash.com/photo-1601581975053-7c899da7347e?w=1600&q=90&fit=crop',
  'vienna': 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=1600&q=90&fit=crop',
  'prague': 'https://images.unsplash.com/photo-1541849546-216549ae216d?w=1600&q=90&fit=crop',
  'venice': 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?w=1600&q=90&fit=crop',
  'amalfi': 'https://images.unsplash.com/photo-1533587851505-d119e13fa0d7?w=1600&q=90&fit=crop',
  'florence': 'https://images.unsplash.com/photo-1543429258-24d14379d624?w=1600&q=90&fit=crop',
  'madrid': 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=1600&q=90&fit=crop',
  'lisbon': 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=1600&q=90&fit=crop',
  'zurich': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1600&q=90&fit=crop',
  // Asia
  'tokyo': 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&q=90&fit=crop',
  'bali': 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1600&q=90&fit=crop',
  'singapore': 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1600&q=90&fit=crop',
  'bangkok': 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1600&q=90&fit=crop',
  'phuket': 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=1600&q=90&fit=crop',
  'hong kong': 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1600&q=90&fit=crop',
  'kyoto': 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600&q=90&fit=crop',
  'seoul': 'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=1600&q=90&fit=crop',
  'colombo': 'https://images.unsplash.com/photo-1566901438878-a3efedcec74c?w=1600&q=90&fit=crop',
  'male': 'https://images.unsplash.com/photo-1530866216038-1bdeb7ae2a80?w=1600&q=90&fit=crop',
  // Americas
  'new york': 'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?w=1600&q=90&fit=crop',
  'miami': 'https://images.unsplash.com/photo-1503891450247-ee5f8ec46dc3?w=1600&q=90&fit=crop',
  'cancun': 'https://images.unsplash.com/photo-1552074284-5e88ef1aef18?w=1600&q=90&fit=crop',
  'rio de janeiro': 'https://images.unsplash.com/photo-1516306580123-e6e52b1b7b5f?w=1600&q=90&fit=crop',
  'los angeles': 'https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=1600&q=90&fit=crop',
  'las vegas': 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=90&fit=crop',
}

const FALLBACKS = [
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=90&fit=crop',
]

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { destination, destinations } = await req.json()

  const dests: string[] = destinations && Array.isArray(destinations) && destinations.length > 0
    ? destinations
    : destination ? [destination] : []

  for (const d of dests) {
    const key = d.toLowerCase().trim().replace(/,.*$/, '').trim()
    if (DESTINATION_IMAGES[key]) return NextResponse.json({ url: DESTINATION_IMAGES[key] })
    const partial = Object.entries(DESTINATION_IMAGES).find(([k]) =>
      key.includes(k) || k.includes(key.split(' ')[0])
    )
    if (partial) return NextResponse.json({ url: partial[1] })
  }

  return NextResponse.json({ url: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)] })
}
