import { NextRequest, NextResponse } from 'next/server'
import { analyzeBankStatement } from '@/lib/analyzeBankStatement'
import { getSupabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const t0 = Date.now()

    // Guard: ensure API key is set before doing anything expensive
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[Bank Analyser] ANTHROPIC_API_KEY is not set')
      return NextResponse.json({ error: 'AI service not configured — ANTHROPIC_API_KEY missing' }, { status: 500 })
    }

    const body = await req.json()
    const {
      applicationId,
      fileUrl,
      destination,
      applicantName,
      passportCountry,
      uploadedBy = 'client',
    } = body

    console.log('[Bank Analyser] START applicationId:', applicationId, 'dest:', destination)

    if (!applicationId || !fileUrl || !destination) {
      return NextResponse.json({ error: 'Missing required fields: applicationId, fileUrl, destination' }, { status: 400 })
    }

    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) {
      console.error('[Bank Analyser] Invalid fileUrl:', fileUrl)
      return NextResponse.json({ error: 'Invalid file URL — signed URL generation may have failed. Please try again.' }, { status: 400 })
    }

    // Support both visa_applications (legacy) and bank_statement_analyses (portal)
    const targetTable = req.headers.get('x-target-table') === 'bank_statement_analyses'
      ? 'bank_statement_analyses'
      : 'visa_applications'
    const idField = targetTable === 'bank_statement_analyses' ? 'application_id' : 'id'

    // Download PDF from Supabase Storage
    let fileRes: Response
    try {
      fileRes = await fetch(fileUrl)
    } catch (fetchErr) {
      console.error('[Bank Analyser] Failed to fetch file:', fileUrl, fetchErr)
      return NextResponse.json({ error: 'Could not reach file storage. Please try uploading again.' }, { status: 500 })
    }

    if (!fileRes.ok) {
      console.error('[Bank Analyser] Storage fetch returned', fileRes.status, 'for', fileUrl)
      return NextResponse.json({ error: `Could not download file from storage (${fileRes.status})` }, { status: 500 })
    }

    const arrayBuffer = await fileRes.arrayBuffer()
    if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 413 })
    }

    const buffer = Buffer.from(arrayBuffer)
    console.log('[Bank Analyser] PDF buffer size:', buffer.byteLength, 'bytes')

    // Send PDF directly to Claude — no text extraction needed
    const base64Pdf = buffer.toString('base64')
    console.log('[Bank Analyser] base64 length:', base64Pdf.length, 'calling Claude...')

    const supabase = getSupabaseAdmin()

    const analysis = await analyzeBankStatement(
      base64Pdf,
      destination,
      applicantName ?? 'Applicant',
      passportCountry ?? 'Nigeria',
    )
    console.log('[Bank Analyser] Claude analysis complete, status:', analysis.status)

    if (targetTable === 'bank_statement_analyses') {
      // Admin standalone flow — save is best-effort; never block returning the analysis
      const { error } = await supabase.from('bank_statement_analyses').upsert(
        { [idField]: applicationId, analysis, analyzed_at: new Date().toISOString(), uploaded_by: uploadedBy },
        { onConflict: idField }
      )
      if (error) console.error('[Bank Analyser] DB save skipped (non-fatal):', error.message)
    } else {
      // Portal flow (visa_applications) — save is required
      const { error } = await supabase.from('visa_applications').update({
        bank_statement_analysis: analysis,
        bank_statement_analyzed_at: new Date().toISOString(),
        bank_statement_uploaded_by: uploadedBy,
      }).eq('id', applicationId)
      if (error) {
        console.error('[Bank Analyser] Supabase save error:', error)
        return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
      }
    }

    console.log('[Bank Analyser] DONE in', Date.now() - t0, 'ms')
    return NextResponse.json({ success: true, analysis })

  } catch (err: unknown) {
    const msg  = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack?.slice(0, 500) : undefined
    console.error('[Bank Analyser] Unhandled error:', msg, stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
