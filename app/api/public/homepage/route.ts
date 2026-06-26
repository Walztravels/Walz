import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const revalidate = 300

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
