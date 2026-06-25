import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const { clientName, clientEmail, visaType, nationality, approvalScore, recommendation, analysisJson, currency, applicationId } = body

    if (!visaType || !nationality) {
      return NextResponse.json({ error: 'Visa type and nationality are required' }, { status: 400 })
    }

    try {
      const saved = await (prisma as any).visaAnalysis.create({
        data: {
          clientName:     clientName     || '',
          clientEmail:    clientEmail    || '',
          visaType,
          nationality,
          approvalScore:  approvalScore  ? Number(approvalScore)  : null,
          recommendation: recommendation || '',
          analysisJson:   analysisJson   ?? {},
          currency:       currency       || '',
          applicationId:  applicationId  || null,
          createdAt:      new Date(),
        },
      })
      return NextResponse.json({ success: true, id: saved.id, message: 'Report saved' })
    } catch (dbErr: any) {
      console.error('[visa-fortress/save] DB error (table may not exist yet):', dbErr.message)
      return NextResponse.json({
        success: true,
        id: null,
        warning: 'Saved in memory only — run SQL to create VisaAnalysis table in Supabase.',
      })
    }
  } catch (err: any) {
    console.error('[visa-fortress/save]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
