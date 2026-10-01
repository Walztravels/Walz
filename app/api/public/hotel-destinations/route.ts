import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Always live — see app/api/public/homepage/route.ts's identical comment.
// Caching for this route is already enforced centrally by next.config.js's
// `/api/public/:path*` headers() rule, independent of Next's own ISR layer.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('HotelDestination')
    .select('*')
    .eq('active', true)
    .order('sortOrder', { ascending: true })
    .limit(6)

  if (error) return NextResponse.json({ destinations: [] })
  return NextResponse.json({ destinations: data ?? [] })
}
