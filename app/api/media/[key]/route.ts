import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/media/[key]
 * Public — no auth required.
 * Returns { url, alt_text } for the given media_key, or null if not found.
 * Pages use this to get live image URLs without redeployment.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('site_media')
      .select('current_url, alt_text')
      .eq('media_key', params.key)
      .single()

    if (error || !data) {
      return NextResponse.json({ url: null, alt_text: null })
    }

    return NextResponse.json({
      url:      data.current_url,
      alt_text: data.alt_text,
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
