import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { buildSignatureHtml } from '@/lib/email/signature'

export const dynamic = 'force-dynamic'

// Returns the rendered signature HTML for the live preview panel.
// Accepts the current form state as query params so the preview matches
// exactly what the next sent email will look like — same code path.
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const settings = {
    logoUrl:      p.get('logoUrl')      ?? 'https://www.walztravels.com/walz-logo.png',
    accentColor:  p.get('accentColor')  ?? '#C9A84C',
    brandColor:   p.get('brandColor')   ?? '#0B1F3A',
    officeCities: (p.get('officeCities') ?? 'London,Toronto,Dubai,Lagos,Accra').split(',').map(c => c.trim()).filter(Boolean),
    phone:        p.get('phone')        ?? '+1 984 388 0110',
    whatsapp:     p.get('whatsapp')     ?? '+1 231 790 2336',
    footerNote:   p.get('footerNote')   ?? '',
  }

  const staff = {
    staffName:        session.name,
    staffRole:        session.roleTitle,
    signatureTagline: session.signatureTagline ?? null,
    staffEmail:       session.sendingEmail,
  }

  const html = buildSignatureHtml(staff, settings)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
