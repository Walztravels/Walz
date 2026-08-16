import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// 1×1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

// ── GET /api/email/track/[id] (public — no auth) ──────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const msg = await prisma.emailMessage.findUnique({
      where:  { trackingId: params.id },
      select: { id: true, readAt: true, openCount: true },
    })

    if (msg) {
      await prisma.emailMessage.update({
        where: { id: msg.id },
        data:  {
          openCount: { increment: 1 },
          readAt:    msg.readAt ?? new Date(),
        },
      })
    }
  } catch {
    // Silently swallow — never block email clients
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
    },
  })
}
