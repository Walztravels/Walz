import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, service, destination, travelDate, whatsapp, details, source } = body

    // Validate required fields
    if (!name || !service || !destination || !whatsapp) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // Insert lead into Supabase
    const { data, error } = await supabase
      .from('leads')
      .insert({
        name,
        service,
        destination,
        travel_date: travelDate || null,
        whatsapp,
        details: details || null,
        source: source || 'website',
        status: 'New',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to save lead' },
        { status: 500 }
      )
    }

    // Send email notification (optional - using a simple fetch to a webhook or email service)
    try {
      // You can integrate with SendGrid, Resend, or any email service here
      // For now, we'll just log it
      console.log('New lead received:', {
        name,
        service,
        destination,
        whatsapp,
        source,
      })
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Lead submission error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch leads' },
        { status: 500 }
      )
    }

    return NextResponse.json({ leads: data })
  } catch (error) {
    console.error('Fetch leads error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
