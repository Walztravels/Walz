import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type RouteContext = { params: { id: string } }

// ── GET /api/admin/packages/[id] ──────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = params
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM travel_packages WHERE id = $1`,
      id
    ) as unknown[]
    if (!rows || (rows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }
    return NextResponse.json((rows as unknown[])[0])
  } catch (err) {
    console.error('[packages/[id] GET]', err)
    return NextResponse.json({ error: 'Failed to fetch package' }, { status: 500 })
  }
}

// ── PATCH /api/admin/packages/[id] ────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = params
    const body = await req.json()

    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1

    const textFields = [
      'title', 'slug', 'destination', 'country_iso2', 'tagline', 'description',
      'package_type', 'departure_city', 'currency', 'meals',
      'seo_title', 'seo_description',
    ]
    const numberFields = [
      'price_per_person', 'original_price', 'deposit_amount', 'duration_days',
      'duration_nights', 'total_seats', 'seats_booked', 'hotel_rating', 'display_order',
    ]
    const boolFields = [
      'visa_included', 'flight_included', 'hotel_included', 'is_featured', 'is_active', 'is_spotlight',
    ]
    const arrayFields = ['highlights', 'inclusions', 'exclusions', 'images']
    const tsFields = ['departure_date', 'return_date']

    for (const f of textFields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`)
        values.push(body[f] === '' ? null : String(body[f]))
      }
    }
    for (const f of numberFields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`)
        values.push(body[f] === '' || body[f] === null ? null : Number(body[f]))
      }
    }
    for (const f of boolFields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`)
        values.push(Boolean(body[f]))
      }
    }
    for (const f of arrayFields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${idx++}::text[]`)
        values.push(Array.isArray(body[f]) ? body[f] : [])
      }
    }
    if (body.itinerary !== undefined) {
      updates.push(`itinerary = $${idx++}::jsonb`)
      values.push(JSON.stringify(body.itinerary ?? []))
    }
    for (const f of tsFields) {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`)
        values.push(body[f] || null)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    values.push(id)

    const sql = `
      UPDATE travel_packages
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `
    const rows = await prisma.$queryRawUnsafe(sql, ...values) as unknown[]
    if (!rows || (rows as unknown[]).length === 0) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }
    const updated = (rows as Array<{ slug: string }>)[0]
    revalidatePath('/packages')
    revalidatePath(`/packages/${updated.slug}`)
    revalidatePath('/')
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[packages/[id] PATCH]', err)
    return NextResponse.json({ error: 'Failed to update package' }, { status: 500 })
  }
}

// ── DELETE /api/admin/packages/[id] ───────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = params
    const rows = await prisma.$queryRawUnsafe(
      `DELETE FROM travel_packages WHERE id = $1 RETURNING slug`,
      id
    ) as Array<{ slug: string }>
    const slug = rows[0]?.slug
    revalidatePath('/packages')
    if (slug) revalidatePath(`/packages/${slug}`)
    revalidatePath('/')
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[packages/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete package' }, { status: 500 })
  }
}
