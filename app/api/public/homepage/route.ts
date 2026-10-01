import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// `revalidate` made Next try to statically evaluate (and ISR-cache) this
// route at BUILD time, which requires Supabase credentials to exist in
// whichever environment runs the build — breaking Preview, where they
// deliberately don't. The actual caching contract here is already enforced
// by the explicit Cache-Control header below AND by next.config.js's
// `/api/public/:path*` headers() rule, so removing Next's own ISR layer in
// favor of `force-dynamic` changes nothing about production cache behavior.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('HomepageContent')
    .select('section, data')

  if (error) return NextResponse.json({ content: {} })

  const content: Record<string, unknown> = {}
  data?.forEach(row => {
    content[row.section] = row.data
  })

  return NextResponse.json({ content }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
