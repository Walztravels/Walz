import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('concierge_suppliers')
    .select('id, slug, name, adapter_type, contact_email, contact_phone, category_slugs, is_active')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load suppliers' }, { status: 500 })
  }

  return NextResponse.json({ suppliers: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    slug:           string
    name:           string
    adapter_type?:  string
    contact_email?: string
    contact_phone?: string
    category_slugs?: string[]
  }

  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('concierge_suppliers')
    .insert({
      slug:           body.slug.toLowerCase().replace(/\s+/g, '-'),
      name:           body.name,
      adapter_type:   body.adapter_type ?? 'manual',
      contact_email:  body.contact_email ?? null,
      contact_phone:  body.contact_phone ?? null,
      category_slugs: body.category_slugs ?? [],
      is_active:      true,
      metadata:       {},
    })
    .select()
    .single()

  if (error) {
    console.error('[Admin/Suppliers] POST error:', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }

  return NextResponse.json({ supplier: data }, { status: 201 })
}
