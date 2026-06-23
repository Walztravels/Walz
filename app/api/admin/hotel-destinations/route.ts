import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('HotelDestination')
    .select('*')
    .order('sortOrder', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ destinations: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    city: string; country: string; fromPrice: string
    tag?: string; imageUrl?: string; sortOrder?: number; active?: boolean
  }

  if (!body.city?.trim() || !body.country?.trim() || !body.fromPrice?.trim()) {
    return NextResponse.json({ error: 'city, country and fromPrice are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('HotelDestination')
    .insert({
      city:      body.city.trim(),
      country:   body.country.trim(),
      fromPrice: body.fromPrice.trim(),
      tag:       body.tag       ?? 'POPULAR',
      imageUrl:  body.imageUrl  ?? null,
      sortOrder: body.sortOrder ?? 0,
      active:    body.active    ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ destination: data }, { status: 201 })
}
