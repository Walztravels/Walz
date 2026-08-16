import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — validate the design upload token (no auth required, no expiry)
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const link = await prisma.designUploadLink.findUnique({
    where: { token: params.token },
  })

  if (!link) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }
  if (!link.isActive) {
    return NextResponse.json({ error: 'This upload link has been deactivated.' }, { status: 410 })
  }

  return NextResponse.json({ label: link.label })
}
