import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/packages ────────────────────────────────────────────────────
export async function GET() {
  try {
    const packages = await prisma.$queryRawUnsafe(
      `SELECT * FROM travel_packages ORDER BY display_order ASC, created_at DESC`
    )
    return NextResponse.json(packages)
  } catch (err) {
    console.error('[packages GET]', err)
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 })
  }
}

// ── POST /api/admin/packages ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { title, slug, price_per_person } = body
    if (!title || !slug || price_per_person === undefined) {
      return NextResponse.json(
        { error: 'title, slug, and price_per_person are required' },
        { status: 400 }
      )
    }

    // Slug uniqueness check
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM travel_packages WHERE slug = $1`,
      slug
    ) as unknown[]
    if (existing && (existing as unknown[]).length > 0) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }

    // Build column lists from provided fields
    const columns: string[] = ['title', 'slug', 'price_per_person']
    const placeholders: string[] = ['$1', '$2', '$3']
    const values: unknown[] = [title, slug, Number(price_per_person)]
    let idx = 4

    const textFields = [
      'destination', 'country_iso2', 'tagline', 'description',
      'package_type', 'departure_city', 'currency', 'meals',
      'seo_title', 'seo_description',
    ]
    const numberFields = [
      'original_price', 'deposit_amount', 'duration_days', 'duration_nights',
      'total_seats', 'seats_booked', 'hotel_rating', 'display_order',
    ]
    const boolFields = [
      'visa_included', 'flight_included', 'hotel_included', 'is_featured', 'is_active',
    ]
    const arrayFields = ['highlights', 'inclusions', 'exclusions', 'images']
    const tsFields = ['departure_date', 'return_date']

    for (const f of textFields) {
      if (body[f] !== undefined && body[f] !== '') {
        columns.push(f); placeholders.push(`$${idx++}`); values.push(String(body[f]))
      }
    }
    for (const f of numberFields) {
      if (body[f] !== undefined && body[f] !== '' && body[f] !== null) {
        columns.push(f); placeholders.push(`$${idx++}`); values.push(Number(body[f]))
      }
    }
    for (const f of boolFields) {
      if (body[f] !== undefined) {
        columns.push(f); placeholders.push(`$${idx++}`); values.push(Boolean(body[f]))
      }
    }
    for (const f of arrayFields) {
      if (body[f] !== undefined) {
        columns.push(f)
        placeholders.push(`$${idx++}::text[]`)
        values.push(Array.isArray(body[f]) ? body[f] : [])
      }
    }
    if (body.itinerary !== undefined) {
      columns.push('itinerary')
      placeholders.push(`$${idx++}::jsonb`)
      values.push(JSON.stringify(body.itinerary ?? []))
    }
    for (const f of tsFields) {
      if (body[f]) {
        columns.push(f); placeholders.push(`$${idx++}`); values.push(body[f])
      }
    }

    columns.push('created_at', 'updated_at')
    placeholders.push('NOW()', 'NOW()')

    const sql = `
      INSERT INTO travel_packages (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `
    const rows = await prisma.$queryRawUnsafe(sql, ...values) as unknown[]
    const created = (rows as Array<{ slug: string }>)[0]
    revalidatePath('/packages')
    revalidatePath(`/packages/${created.slug}`)
    revalidatePath('/')
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[packages POST]', err)
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 })
  }
}
