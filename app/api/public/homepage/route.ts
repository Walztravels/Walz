import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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

  return NextResponse.json({ content })
}
