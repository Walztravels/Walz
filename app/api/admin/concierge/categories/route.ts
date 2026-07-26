import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('concierge_categories')
    .select('id, slug, name, description, icon, fulfilment_modes, required_fields, is_active, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }

  return NextResponse.json({ categories: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    slug:             string
    name:             string
    description?:     string
    icon?:            string
    fulfilment_modes: string[]
    required_fields:  unknown[]
    sort_order?:      number
  }

  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('concierge_categories')
    .insert({
      slug:             body.slug.toLowerCase().replace(/\s+/g, '-'),
      name:             body.name,
      description:      body.description ?? null,
      icon:             body.icon ?? null,
      fulfilment_modes: body.fulfilment_modes ?? ['request_to_book'],
      required_fields:  body.required_fields ?? [],
      is_active:        true,
      sort_order:       body.sort_order ?? 99,
    })
    .select()
    .single()

  if (error) {
    console.error('[Admin/Categories] POST error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }

  return NextResponse.json({ category: data }, { status: 201 })
}
