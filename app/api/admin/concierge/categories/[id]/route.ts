import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const allowed = ['name', 'description', 'icon', 'fulfilment_modes', 'required_fields', 'is_active', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('concierge_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[Admin/Categories] PATCH error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ category: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // Soft-delete: mark inactive rather than destroying data
  const { error } = await supabase
    .from('concierge_categories')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to deactivate category' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
