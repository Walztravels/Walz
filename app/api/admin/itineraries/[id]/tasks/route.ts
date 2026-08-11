import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function daysFromStart(startDate: string, offsetDays: number): string | null {
  try {
    const d = new Date(startDate)
    if (isNaN(d.getTime())) return null
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

interface ItinSummary {
  destination?: string
  startDate?: string | null
  endDate?: string | null
  numberOfTravellers?: number
  visaRequired?: boolean
}

function buildAutoTasks(itinerary_id: string, itinSummary: ItinSummary) {
  const { startDate, endDate, visaRequired } = itinSummary

  const tasks: Record<string, unknown>[] = [
    {
      itinerary_id,
      title: 'Confirm flights with airline',
      description: 'Contact the airline to confirm all flight bookings and seat assignments.',
      category: 'flight',
      priority: 'high',
      due_date: startDate ? daysFromStart(startDate, -14) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: false,
    },
    {
      itinerary_id,
      title: 'Collect passport copies from all travelers',
      description: 'Request clear scanned copies of all traveler passports (bio-data page).',
      category: 'document',
      priority: 'high',
      due_date: startDate ? daysFromStart(startDate, -30) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: true,
    },
    {
      itinerary_id,
      title: 'Confirm hotel reservations',
      description: 'Verify all hotel bookings are confirmed and collect confirmation numbers.',
      category: 'hotel',
      priority: 'high',
      due_date: startDate ? daysFromStart(startDate, -14) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: false,
    },
    {
      itinerary_id,
      title: 'Arrange airport transfers',
      description: 'Book and confirm all airport transfer vehicles for arrival and departure.',
      category: 'transfer',
      priority: 'medium',
      due_date: startDate ? daysFromStart(startDate, -7) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: false,
    },
    {
      itinerary_id,
      title: 'Issue eSIM to travelers',
      description: 'Purchase and send eSIM QR codes or activation instructions to all travelers.',
      category: 'esim',
      priority: 'medium',
      due_date: startDate ? daysFromStart(startDate, -3) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: true,
    },
    {
      itinerary_id,
      title: 'Send final travel pack',
      description:
        'Send the complete travel pack including itinerary PDF, hotel vouchers, flight tickets, and emergency contacts.',
      category: 'document',
      priority: 'high',
      due_date: startDate ? daysFromStart(startDate, -2) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: true,
    },
    {
      itinerary_id,
      title: 'Follow up after travel',
      description: 'Contact the client to get feedback and confirm a smooth trip experience.',
      category: 'follow_up',
      priority: 'medium',
      due_date: endDate ? daysFromStart(endDate, 3) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: false,
    },
  ]

  if (visaRequired) {
    tasks.push({
      itinerary_id,
      title: 'Submit visa application',
      description: 'Prepare and submit visa application for all travelers requiring a visa.',
      category: 'visa',
      priority: 'urgent',
      due_date: startDate ? daysFromStart(startDate, -45) : null,
      status: 'pending',
      auto_generated: true,
      client_visible: true,
    })
  }

  return tasks
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('itinerary_tasks')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('[tasks/GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sort in JS: priority first, then due_date
  const sorted = (data ?? []).sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99
    const pb = PRIORITY_ORDER[b.priority] ?? 99
    if (pa !== pb) return pa - pb
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

  return NextResponse.json({ tasks: sorted })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const supabase = getSupabaseAdmin()

  // Auto-generate mode
  if (body.autoGenerate === true) {
    const itinSummary: ItinSummary = body.itinSummary ?? {}
    const tasks = buildAutoTasks(itinerary_id, itinSummary)

    const { data, error } = await supabase
      .from('itinerary_tasks')
      .insert(tasks)
      .select()

    if (error) {
      console.error('[tasks/POST autoGenerate]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tasks: data, autoGenerated: true }, { status: 201 })
  }

  // Single task creation
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('itinerary_tasks')
    .insert({
      itinerary_id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      owner: body.owner?.trim() || null,
      due_date: body.due_date || null,
      priority: body.priority || 'medium',
      status: body.status || 'pending',
      category: body.category?.trim() || null,
      client_visible: body.client_visible === true,
      auto_generated: false,
    })
    .select()
    .single()

  if (error) {
    console.error('[tasks/POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { taskId, ...rest } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const allowed = [
    'title', 'description', 'owner', 'due_date', 'priority',
    'status', 'category', 'client_visible',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in rest) updates[key] = rest[key]
  }

  const { data, error } = await supabase
    .from('itinerary_tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('itinerary_id', itinerary_id)
    .select()
    .single()

  if (error) {
    console.error('[tasks/PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ task: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { taskId } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('itinerary_tasks')
    .delete()
    .eq('id', taskId)
    .eq('itinerary_id', itinerary_id)

  if (error) {
    console.error('[tasks/DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
