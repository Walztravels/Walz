import { notFound }                         from 'next/navigation'
import { Suspense }                          from 'react'
import type { Metadata }                     from 'next'
import ActivityDetailClient                  from './ActivityDetailClient'
import { getActivityBySlug, STATIC_ACTIVITIES } from '@/lib/activities-data'
import prisma                                from '@/lib/db'

// Next.js 14 — params is a plain object, not a Promise
async function getActivityData(slug: string) {
  // 1. DB (admin-curated)
  try {
    const db = await prisma.activity.findUnique({ where: { slug, isPublished: true } })
    if (db) return db
  } catch {}

  // 2. Static activities
  const staticAct = getActivityBySlug(slug)
  if (staticAct) return staticAct

  // 3. Live Hotelbeds Content API for hb- slugs
  if (slug.startsWith('hb-')) {
    const rawCode = slug.replace(/^hb-/, '')
    const base    = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
    try {
      const res = await fetch(
        `${base}/api/activities/content/${encodeURIComponent(rawCode)}`,
        { next: { revalidate: 3600 } },
      )
      if (res.ok) {
        const data = await res.json()
        if (data.activity) return data.activity
      }
    } catch {}
  }

  return null
}

export async function generateStaticParams() {
  return STATIC_ACTIVITIES.map(a => ({ slug: a.slug }))
}

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = await getActivityData(params.slug)
  if (!a) return { title: 'Activity | Walz Travels' }
  return {
    title:       `${a.title} | Walz Travels`,
    description: (a.shortDesc ?? a.description ?? '').slice(0, 160),
  }
}

export default async function ActivityDetailPage(
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = await getActivityData(params.slug)
  if (!activity) return notFound()

  return (
    <Suspense>
      <ActivityDetailClient activity={activity} />
    </Suspense>
  )
}
