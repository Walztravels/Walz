import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendClientStatusUpdate } from '@/lib/concierge/notifications'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as {
    status?:         string
    assigned_to?:    string | null
    internal_notes?: string | null
  }

  const allowed = ['PENDING', 'QUOTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status && allowed.includes(body.status)) updates.status = body.status
  if ('assigned_to'    in body) updates.assigned_to    = body.assigned_to ?? null
  if ('internal_notes' in body) updates.internal_notes = body.internal_notes ?? null

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('concierge_requests')
    .update(updates)
    .eq('id', id)
    .select(`
      id, reference, status, sla, intent_fields, created_at, updated_at,
      client_name, client_email, assigned_to, internal_notes,
      category:concierge_categories ( name, slug )
    `)
    .single()

  if (error) {
    console.error('[Admin/Concierge] PATCH error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Send status update email to client — fire-and-forget
  const updated = data as unknown as {
    status: string; client_email: string | null; client_name: string | null
    reference: string; category: { name: string } | null
  }
  if (body.status && updated.client_email) {
    void sendClientStatusUpdate({
      clientEmail:  updated.client_email,
      clientName:   updated.client_name ?? undefined,
      reference:    updated.reference,
      categoryName: updated.category?.name ?? 'Concierge',
      newStatus:    body.status,
    })
  }

  return NextResponse.json({ request: data })
}
