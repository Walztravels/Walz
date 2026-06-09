import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

/**
 * GET /api/media/[key]
 * Public — no auth required.
 * Returns { url, alt_text } for the given media_key, or null if not found.
 * Uses Prisma raw SQL to bypass the PostgREST schema cache (site_media was
 * created via raw SQL and is not visible through the Supabase JS client).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ current_url: string | null; alt_text: string | null }>>(
      'SELECT current_url, alt_text FROM site_media WHERE media_key = $1 LIMIT 1',
      params.key,
    )
    const row = rows[0] ?? null
    return NextResponse.json({
      url:      row?.current_url ?? null,
      alt_text: row?.alt_text   ?? null,
    }, {
      headers: {
        // Cache for 5 minutes — short enough to see changes quickly
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch {
    return NextResponse.json({ url: null, alt_text: null })
  }
}
