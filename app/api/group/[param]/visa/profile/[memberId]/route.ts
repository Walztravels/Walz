import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/group/[param]/visa/profile/[memberId]
 *
 * Saves a member's visa profile (nationality, travel history, document URLs).
 * After saving, calls the existing VisaFortress individual analysis endpoint
 * to get an individual_score and stores the result.
 *
 * [param]    = sessionId
 * [memberId] = SessionMember.id
 *
 * Body:
 *   nationality      string
 *   travelHistory    { country: string; year: number }[]
 *   documentUrls     string[]   (pre-uploaded, URL only — no raw files)
 *   applicantName    string     (for VisaFortress)
 *   visaType         string     (for VisaFortress)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { param: string; memberId: string } },
) {
  const body = await req.json().catch(() => null)
  if (!body?.nationality) {
    return NextResponse.json({ error: 'nationality required' }, { status: 400 })
  }

  const session = await prisma.groupSession.findUnique({ where: { id: params.param } })
  const member  = await prisma.sessionMember.findUnique({ where: { id: params.memberId } })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!member)  return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (member.sessionId !== params.param) {
    return NextResponse.json({ error: 'Member does not belong to this session' }, { status: 403 })
  }

  // Upsert visa profile
  const profile = await prisma.memberVisaProfile.upsert({
    where: { memberId: params.memberId },
    update: {
      nationality:       body.nationality,
      travelHistoryJson: body.travelHistory ?? [],
      documentUrls:      body.documentUrls ?? [],
    },
    create: {
      sessionId:         params.param,
      memberId:          params.memberId,
      nationality:       body.nationality,
      travelHistoryJson: body.travelHistory ?? [],
      documentUrls:      body.documentUrls ?? [],
    },
  })

  // If document URLs are provided, try calling the existing VisaFortress individual analysis
  // by fetching the first document as a remote file and posting to /api/admin/visa/analyse
  let individualScore: number | null = null
  let individualAnalysis: unknown    = null

  const docUrls = (body.documentUrls ?? []) as string[]
  if (docUrls.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'

      // Fetch first document as blob and construct FormData for the analyse endpoint
      const docRes  = await fetch(docUrls[0])
      const docBlob = await docRes.blob()

      const fd = new FormData()
      fd.append('file',           new File([docBlob], 'statement.pdf', { type: docBlob.type || 'application/pdf' }))
      fd.append('applicantName',  body.applicantName ?? member.name)
      fd.append('visaType',       body.visaType ?? `${session.visaDestination ?? 'Visitor'} Visitor`)
      fd.append('passportCountry', body.nationality)

      const analysisRes  = await fetch(`${baseUrl}/api/admin/visa/analyse`, {
        method: 'POST',
        body:   fd,
      })
      const analysisData = await analysisRes.json()

      if (analysisData.success && analysisData.analysis) {
        individualScore    = analysisData.analysis.approvalScore ?? null
        individualAnalysis = analysisData.analysis
      }
    } catch {
      // Non-fatal — store profile without score
    }
  }

  // Update profile with score if we got one
  if (individualScore !== null) {
    await prisma.memberVisaProfile.update({
      where: { id: profile.id },
      data:  {
        individualScore,
        individualAnalysisJson: individualAnalysis as object,
      },
    })
  }

  return NextResponse.json({
    success:         true,
    profileId:       profile.id,
    individualScore,
    hasAnalysis:     individualScore !== null,
  })
}
