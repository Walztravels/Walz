import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    uploadId?:   string
    status?:     string
    reviewNote?: string
  }

  // Reviewing an individual upload
  if (body.uploadId) {
    const upload = await prisma.documentUpload.update({
      where: { id: body.uploadId },
      data: {
        ...(body.status     && { status:     body.status     }),
        ...(body.reviewNote !== undefined && { reviewNote: body.reviewNote }),
      },
    })
    return NextResponse.json({ upload })
  }

  const request = await prisma.documentRequest.update({
    where: { id: params.id },
    data: { ...(body.status && { status: body.status }) },
  })
  return NextResponse.json({ request })
}
