import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('itinerary_package_options')
    .select('*').eq('itinerary_id', id).order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ options: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as {
    name: string; description?: string; price?: number; currency?: string
    features?: string[]; sort_order?: number
  }

  const itin = await prisma.itinerary.findUnique({ where: { id }, select: { currency: true } })
  if (!itin) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
  const itineraryCurrency = (itin.currency ?? 'GBP').toUpperCase()

  if (body.currency && body.currency.toUpperCase() !== itineraryCurrency) {
    return NextResponse.json(
      { error: `Package option currency (${body.currency.toUpperCase()}) does not match itinerary billing currency (${itineraryCurrency}). One itinerary must have one billing currency.` },
      { status: 409 },
    )
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('itinerary_package_options').insert({
    itinerary_id: id,
    name:         body.name,
    description:  body.description ?? null,
    price:        body.price ?? null,
    currency:     itineraryCurrency,
    features:     body.features ?? [],
    sort_order:   body.sort_order ?? 0,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ option: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as Record<string, unknown> & { optionId: string }
  if (!body.optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 })
  const { optionId, ...rest } = body
  const sb = getSupabaseAdmin()
  // If marking as selected, unselect all others first
  if (rest.is_selected === true) {
    await sb.from('itinerary_package_options').update({ is_selected: false }).eq('itinerary_id', id)
  }
  const { data, error } = await sb
    .from('itinerary_package_options').update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', optionId).eq('itinerary_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ option: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { optionId: string }
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('itinerary_package_options').delete().eq('id', body.optionId).eq('itinerary_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
