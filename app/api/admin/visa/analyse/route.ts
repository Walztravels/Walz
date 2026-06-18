import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { analyzeBankStatement }      from '@/lib/analyzeBankStatement'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

// Direct-upload V1 endpoint — accepts multipart/form-data with the PDF file,
// runs analyzeBankStatement, and optionally persists to a VisaApplication.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form          = await req.formData()
  const file          = form.get('file')            as File   | null
  const destination   = (form.get('destination')   as string) ?? 'uk'
  const applicantName = (form.get('applicantName') as string) ?? 'Applicant'
  const passport      = (form.get('passportCountry') as string) ?? 'Nigeria'
  const appId         = form.get('applicationId')   as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 50 * 1024 * 1024)
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await analyzeBankStatement(buffer, destination, applicantName, passport)

  if (appId) {
    try {
      await prisma.visaApplication.update({
        where: { id: appId },
        data: {
          bankAnalysisResult: JSON.stringify(result),
          bankAnalysisScore:  result.financialCredibilityScore?.overall ?? null,
          bankAnalysisStatus: result.status,
          bankAnalysedAt:     new Date(),
        } as Record<string, unknown>,
      })
    } catch (e) {
      console.warn('[admin/visa/analyse] DB save skipped:', e)
    }
  }

  return NextResponse.json({ result })
}
