import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const supabase = getSupabaseAdmin()

  // ── Attempt 1: dedicated report_token column (post-migration) ─────────────
  const { data: d1 } = await supabase
    .from('bank_statement_analyses')
    .select('analysis, client_name, destination, passport_country, report_token, status, analyzed_at')
    .eq('report_token', params.token)
    .maybeSingle()

  if (d1) {
    supabase.from('bank_statement_analyses')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('report_token', params.token)
      .then(() => {})
    return NextResponse.json(d1)
  }

  // ── Attempt 2: token embedded inside analysis JSONB (pre-migration fallback) ─
  const { data: d2 } = await supabase
    .from('bank_statement_analyses')
    .select('analysis, analyzed_at')
    .filter('analysis->>_report_token', 'eq', params.token)
    .maybeSingle()

  if (!d2) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const a = d2.analysis as Record<string, unknown>
  return NextResponse.json({
    analysis:         a,
    client_name:      (a._client_name  as string) ?? 'Applicant',
    destination:      (a._destination  as string) ?? '',
    passport_country: (a._passport_country as string) ?? null,
    report_token:     params.token,
    status:           'viewed',
    analyzed_at:      d2.analyzed_at,
  })
}
