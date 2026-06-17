import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { analysis, clientName, clientEmail, destination, passportCountry, applicationId } = await req.json()

  if (!analysis || !clientName || !destination) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase  = getSupabaseAdmin()
  const token     = nanoid(12)
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.walztravels.com'
  const reportUrl = `${baseUrl}/report/${token}`
  const appId     = applicationId ?? `standalone-${Date.now()}`

  // ── Attempt 1: full row (requires SQL migration) ──────────────────────────
  const fullRow = {
    application_id:  appId,
    analysis,
    report_token:    token,
    status:          'generated',
    client_name:     clientName,
    client_email:    clientEmail ?? null,
    destination,
    passport_country: passportCountry ?? null,
    analyzed_at:     new Date().toISOString(),
    uploaded_by:     'admin',
  }

  const { error: err1 } = await supabase
    .from('bank_statement_analyses')
    .upsert(fullRow, { onConflict: 'application_id' })

  if (!err1) {
    return NextResponse.json({ success: true, token, reportUrl })
  }

  console.warn('[PublishReport] Full upsert failed (migration pending?):', err1.message)

  // ── Attempt 2: embed token inside the analysis JSON (no migration needed) ─
  // The report API knows to look up by analysis->>'_report_token' as a fallback.
  const embeddedAnalysis = {
    ...analysis,
    _report_token:    token,
    _client_name:     clientName,
    _destination:     destination,
    _passport_country: passportCountry ?? null,
  }

  const minimalRow = {
    application_id: appId,
    analysis:       embeddedAnalysis,
    analyzed_at:    new Date().toISOString(),
    uploaded_by:    'admin',
  }

  const { error: err2 } = await supabase
    .from('bank_statement_analyses')
    .upsert(minimalRow, { onConflict: 'application_id' })

  if (err2) {
    console.error('[PublishReport] Fallback upsert also failed:', err2.message)
    return NextResponse.json({
      error: 'Could not save report to database. Please run the Supabase migration:\n\nALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS report_token text UNIQUE, ADD COLUMN IF NOT EXISTS status text DEFAULT \'generated\', ADD COLUMN IF NOT EXISTS client_name text, ADD COLUMN IF NOT EXISTS client_email text, ADD COLUMN IF NOT EXISTS destination text, ADD COLUMN IF NOT EXISTS passport_country text;',
    }, { status: 500 })
  }

  console.log('[PublishReport] Saved via embedded-token fallback, token:', token)
  return NextResponse.json({ success: true, token, reportUrl, fallback: true })
}
