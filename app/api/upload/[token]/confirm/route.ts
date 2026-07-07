import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'

const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
const BUCKET = 'portal-documents'

export const dynamic = 'force-dynamic'

// POST /api/upload/[token]/confirm
// Called after the client has uploaded the file directly to Supabase.
// Creates the DocumentUpload record and updates the request counters.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const request = await prisma.documentRequest.findUnique({
    where:   { token: params.token },
    include: { uploads: true },
  })

  if (!request) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (new Date() > request.expiresAt) return NextResponse.json({ error: 'Link expired' }, { status: 410 })

  const body = await req.json().catch(() => ({})) as {
    fileKey:  string
    docName:  string
    category: string
    fileName: string
    fileSize: number
    mimeType: string
  }

  const { fileKey, docName, category, fileName, fileSize, mimeType } = body

  if (!fileKey || !docName || !fileName) {
    return NextResponse.json({ error: 'fileKey, docName and fileName required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Signed URL valid 1 year for admin viewing
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fileKey, 60 * 60 * 24 * 365)
  const fileUrl = signed?.signedUrl ?? fileKey

  const upload = await prisma.documentUpload.create({
    data: {
      requestId: request.id,
      docName,
      category:  category ?? 'General',
      fileUrl,
      fileKey,
      fileName,
      fileSize:  fileSize ?? null,
      mimeType:  mimeType ?? null,
    },
  })

  const newCount   = request.uploadedCount + 1
  const isComplete = newCount >= request.totalRequired

  await prisma.documentRequest.update({
    where: { id: request.id },
    data: {
      uploadedCount: newCount,
      status:        isComplete ? 'complete' : 'partial',
      ...(isComplete && { completedAt: new Date() }),
    },
  })

  if (isComplete) {
    const appLink = `${SITE}/admin/documents`
    await getResend().emails.send({
      from:    'Walz Travels System <noreply@walztravels.com>',
      to:      request.requestedBy,
      subject: `✅ Documents uploaded — ${request.clientName}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <h2 style="color:#0B1F3A">All documents received</h2>
          <p>
            <strong>${request.clientName}</strong> (${request.clientEmail}) has uploaded
            all ${request.totalRequired} requested document(s).
          </p>
          <a href="${appLink}"
            style="background:#C9A84C;color:#0B1F3A;padding:12px 24px;border-radius:8px;
              text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">
            View Documents →
          </a>
        </div>
      `,
    }).catch(() => {})
  }

  return NextResponse.json({ upload, uploadedCount: newCount, isComplete })
}
