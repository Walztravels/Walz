import { NextRequest, NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/extractPdfText'
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

    let pdfResult: Awaited<ReturnType<typeof extractPdfText>>
    try {
      pdfResult = await extractPdfText(buffer)
    } catch (pdfErr) {
      console.error('[Bank Analyser] PDF extraction failed:', pdfErr)
      return NextResponse.json({ error: 'Could not read the PDF. Please ensure the file is a valid, non-corrupted bank statement.' }, { status: 422 })
    }
    const { text, isLikelyScanned, pageCount, charCount } = pdfResult
    console.log('[Bank Analyser] PDF parsed — pages:', pageCount, 'chars:', charCount, 'scanned:', isLikelyScanned)

    const supabase = getSupabaseAdmin()

    // Scanned / image-based PDF — flag for manual review
    if (isLikelyScanned || charCount < 200) {
      const scannedAnalysis = {
        status: 'REVIEW',
        agentNotes: `SCANNED PDF — extracted only ${charCount} chars across ${pageCount} pages. Ask client for a digitally generated statement (downloaded from bank app/website), or review manually.`,
        summary: 'Our team will review your bank statement and contact you shortly.',
        confidence: 'low',
        warnings: ['PDF appears to be scanned — manual review required'],
      }

      if (targetTable === 'bank_statement_analyses') {
        await supabase.from('bank_statement_analyses').upsert(
          { application_id: applicationId, analysis: scannedAnalysis, analyzed_at: new Date().toISOString(), uploaded_by: uploadedBy },
          { onConflict: 'application_id' }
        )
      } else {
        await supabase.from('visa_applications').update({
          bank_statement_analysis: scannedAnalysis,
          bank_statement_analyzed_at: new Date().toISOString(),
          bank_statement_uploaded_by: uploadedBy,
        }).eq('id', applicationId)
      }

      return NextResponse.json({ success: false, scanned: true })
    }

    // Analyze with Claude
    console.log('[Bank Analyser] calling Claude (text length:', text.length, ')')
    const analysis = await analyzeBankStatement(
      text,
      destination,
      applicantName ?? 'Applicant',
      passportCountry ?? 'Nigeria',
    )
    console.log('[Bank Analyser] Claude analysis complete, status:', analysis.status)

    // Save analysis to correct table
    let saveError: unknown = null

    if (targetTable === 'bank_statement_analyses') {
      const { error } = await supabase.from('bank_statement_analyses').upsert(
        { [idField]: applicationId, analysis, analyzed_at: new Date().toISOString(), uploaded_by: uploadedBy },
        { onConflict: idField }
      )
      saveError = error
    } else {
      const { error } = await supabase.from('visa_applications').update({
        bank_statement_analysis: analysis,
        bank_statement_analyzed_at: new Date().toISOString(),
        bank_statement_uploaded_by: uploadedBy,
      }).eq('id', applicationId)
      saveError = error
    }

    if (saveError) {
      console.error('[Bank Analyser] Supabase save error:', saveError)
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
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
