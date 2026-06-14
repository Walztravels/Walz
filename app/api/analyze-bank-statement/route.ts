import { NextRequest, NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/extractPdfText'
import { analyzeBankStatement } from '@/lib/analyzeBankStatement'
import { getSupabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const {
    applicationId,
    fileUrl,
    destination,
    applicantName,
    passportCountry,
    uploadedBy = 'client',
  } = await req.json()

  if (!applicationId || !fileUrl || !destination) {
    return NextResponse.json({ error: 'Missing required fields: applicationId, fileUrl, destination' }, { status: 400 })
  }

  // Support both visa_applications (legacy) and bank_statement_analyses (portal)
  const targetTable = req.headers.get('x-target-table') === 'bank_statement_analyses'
    ? 'bank_statement_analyses'
    : 'visa_applications'
  const idField = targetTable === 'bank_statement_analyses' ? 'application_id' : 'id'

  // Download PDF from Supabase Storage
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) {
    return NextResponse.json({ error: 'Could not download file from storage' }, { status: 500 })
  }

  const arrayBuffer = await fileRes.arrayBuffer()
  if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 413 })
  }

  const buffer = Buffer.from(arrayBuffer)
  const { text, isLikelyScanned, pageCount, charCount } = await extractPdfText(buffer)

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
  const analysis = await analyzeBankStatement(
    text,
    destination,
    applicantName ?? 'Applicant',
    passportCountry ?? 'Nigeria',
  )

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
    console.error('Supabase update error:', saveError)
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
  }

  return NextResponse.json({ success: true, analysis })
}
