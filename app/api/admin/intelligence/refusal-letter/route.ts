import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { extractPdfText, PdfExtractionError } from '@/lib/extractPdfText'
import { assessPdfText, PDF_UNREADABLE_MESSAGE } from '@/lib/intelligence/doc-analysis'
import { storeCaseDocument, INTEL_ALLOWED_TYPES, INTEL_MAX_BYTES } from '@/lib/intelligence/document-store'
import { modelFor } from '@/lib/intelligence/models'
import { recordCaseEvent } from '@/lib/intelligence/case-events'
import {
  buildSystemPrompt, buildUserPrompt, parseModelResponse, buildFallbackAnalysis,
  enforceHardInvariants, resolveJurisdiction, VERIFIED_JURISDICTIONS,
  saveRefusalLetterAnalysis, getRefusalLetterAnalysis,
} from '@/lib/analyzeRefusalLetter'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

/**
 * Visa Refusal Letter Analyzer — staff-only Document Intelligence sibling.
 *
 * Pipeline mirrors DI-2 (app/api/admin/intelligence/visa-doc-upload):
 * validate -> store PRIVATELY -> extract text (PDF) -> vision fallback for
 * scanned files -> classify REAL content -> Zod-validate -> enforce hard
 * safety invariants in code -> persist (gracefully, pre-migration-safe) ->
 * audit event. NEVER wired to any client-facing surface or Jade tool.
 */

const ANALYSIS_MODEL = modelFor('refusalLetterAnalysis')

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file          = formData.get('file') as File | null
    const applicationId = ((formData.get('applicationId') as string) || '').trim() || null
    const applicantName = ((formData.get('applicantName') as string) || '').trim() || null
    const fileName       = file?.name ?? 'refusal_letter'

    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, message: 'Upload the refusal letter file for analysis.' }, { status: 400 })
    }

    const buffer   = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'application/octet-stream'
    const isPdf    = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

    if (!INTEL_ALLOWED_TYPES.includes(isPdf ? 'application/pdf' : mimeType) || buffer.length > INTEL_MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'Only PDF, JPG, PNG or WEBP documents up to 15MB can be analyzed.' }, { status: 400 })
    }

    // ── Known destination, if this upload is linked to a real case ──────────
    let knownDestinationIso2: string | null = null
    if (applicationId) {
      const app = await prisma.visaApplication.findUnique({
        where:  { id: applicationId },
        select: { destinationIso2: true },
      }).catch(() => null)
      knownDestinationIso2 = app?.destinationIso2 ?? null
    }

    // ── 1. Validate + retain privately (document stored BEFORE any model call) ─
    const stored = await storeCaseDocument({
      applicationId, documentType: 'refusal_letter', fileName,
      mimeType: isPdf ? 'application/pdf' : mimeType,
      buffer, uploadedBy: session.email ?? 'admin',
    })
    if (!stored.ok) {
      return NextResponse.json({ ok: false, message: stored.error }, { status: 400 })
    }

    // ── 2. Extract REAL text (never analyze from a filename) ────────────────
    let extractedText = ''
    let pageCount = 1

    if (!isPdf) {
      // Image letters: vision-only, no separate text extraction step.
      pageCount = 1
    } else {
      let extraction: Awaited<ReturnType<typeof extractPdfText>> | null = null
      try { extraction = await extractPdfText(buffer) } catch (err) {
        if (!(err instanceof PdfExtractionError)) throw err
      }
      const assessment = extraction ? assessPdfText(extraction) : { ok: false as const, reason: 'no_text' as const }
      if (!extraction || !assessment.ok) {
        return NextResponse.json({
          ok: false, message: PDF_UNREADABLE_MESSAGE,
          reason: assessment.ok ? undefined : assessment.reason,
          documentId: stored.doc.documentId,
        }, { status: 422 })
      }
      extractedText = extraction.text
      pageCount = extraction.pageCount
    }

    // ── 3. Jurisdiction verification — authoritative source is the KNOWN
    //      destination when this upload is linked to a real case. ──────────
    const jurisdiction = resolveJurisdiction({ knownDestinationIso2 })
    const terminology = jurisdiction.status === 'VERIFIED' && jurisdiction.iso2
      ? VERIFIED_JURISDICTIONS[jurisdiction.iso2]?.terminologyBrief ?? null
      : null

    // ── 4. Classify REAL content — untrusted document text is delimited and
    //      framed as data-only (prompt-injection resistance). ───────────────
    const system = buildSystemPrompt()
    const user = buildUserPrompt({
      extractedText: extractedText || '(image-only letter — see attached image)',
      pageCount, jurisdictionStatus: jurisdiction.status, jurisdictionTerminology: terminology,
      applicantName, knownDestinationLabel: jurisdiction.status === 'VERIFIED' ? jurisdiction.label : null,
    })

    let rawText = ''
    try {
      if (isPdf) {
        const res = await getAnthropic().messages.create({
          model: ANALYSIS_MODEL, max_tokens: 2000, temperature: 0,
          system,
          messages: [{ role: 'user', content: user }],
        })
        rawText = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
      } else {
        const res = await getAnthropic().messages.create({
          model: ANALYSIS_MODEL, max_tokens: 2000, temperature: 0,
          system,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: buffer.toString('base64') } },
              { type: 'text', text: user },
            ],
          }],
        })
        rawText = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
      }
    } catch (modelErr) {
      console.error('[refusal-letter] model call failed:', modelErr instanceof Error ? modelErr.message.slice(0, 200) : 'unknown')
      rawText = ''
    }

    // ── 5. Parse + validate (Zod) — malformed/partial response NEVER
    //      crashes and NEVER fabricates a default; it routes to human review. ─
    const parsed = rawText ? parseModelResponse(rawText) : null
    const analysisEngine = `Claude ${ANALYSIS_MODEL}`
    const verificationSourceText = extractedText || user

    const analysis = parsed
      ? enforceHardInvariants({
          parsed, extractedText: verificationSourceText,
          jurisdictionStatus: jurisdiction.status, jurisdictionLabel: jurisdiction.label,
          jurisdictionIso2: jurisdiction.iso2, analysisEngine,
        })
      : buildFallbackAnalysis(
          rawText ? 'Model response could not be parsed into the required schema.' : 'Model call failed or returned no content.',
          analysisEngine,
        )

    // ── 6. Persist (gracefully — works today with zero persistence; starts
    //      persisting the moment the proposed migration is applied) ────────
    let persisted = false
    if (applicationId) {
      persisted = await saveRefusalLetterAnalysis(applicationId, analysis, session.email ?? 'admin')
      await recordCaseEvent({
        applicationId, eventType: 'refusal_letter_analyzed', actor: session.email ?? 'admin',
        refType: 'VisaCaseDocument', refId: stored.doc.documentId,
        summary: `Refusal letter — ${analysis.classification.replace(/_/g, ' ').toLowerCase()}${analysis.jurisdictionVerificationStatus === 'UNVERIFIED' ? ' (unverified jurisdiction)' : ''}`,
        metadata: {
          classification: analysis.classification,
          jurisdictionVerificationStatus: analysis.jurisdictionVerificationStatus,
          flaggedQuoteCount: analysis.flaggedQuotes.length,
          documentId: stored.doc.documentId,
        },
      })
    }

    return NextResponse.json({
      ok: true, analysis, documentId: stored.doc.documentId, persisted,
    })
  } catch (e) {
    console.error('[refusal-letter]', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ ok: false, message: 'Analysis failed unexpectedly. Please try again.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  if (!applicationId) return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })

  const saved = await getRefusalLetterAnalysis(applicationId)
  return NextResponse.json({ ok: true, saved })
}
