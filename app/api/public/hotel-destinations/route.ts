import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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
