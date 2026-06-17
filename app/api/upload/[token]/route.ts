import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)
const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
const BUCKET = 'portal-documents'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const request = await prisma.documentRequest.findUnique({
    where: { token: params.token },
    include: { uploads: { orderBy: { uploadedAt: 'asc' } } },
  })

  if (!request) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  if (new Date() > request.expiresAt) {
    return NextResponse.json(
      { error: 'This upload link has expired. Please contact your visa team.' },
      { status: 410 },
    )
  }

  if (!request.openedAt) {
    await prisma.documentRequest.update({
      where: { id: request.id },
      data:  { openedAt: new Date() },
    }).catch(() => {})
  }

  return NextResponse.json({
    clientName:    request.clientName,
    clientEmail:   request.clientEmail,
    requestedDocs: typeof request.requestedDocs === 'string'
      ? JSON.parse(request.requestedDocs)
      : request.requestedDocs,
    message:   request.message,
    deadline:  request.deadline,
    expiresAt: request.expiresAt,
    status:    request.status,
    uploads:   request.uploads.map(u => ({
      id:         u.id,
      docName:    u.docName,
      fileName:   u.fileName,
      fileSize:   u.fileSize,
      uploadedAt: u.uploadedAt,
      status:     u.status,
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const request = await prisma.documentRequest.findUnique({
    where: { token: params.token },
    include: { uploads: true },
  })

  if (!request) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (new Date() > request.expiresAt) return NextResponse.json({ error: 'Link expired' }, { status: 410 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const docName  = formData.get('docName') as string | null
  const category = (formData.get('category') as string | null) ?? 'General'

  if (!file || !docName) {
    return NextResponse.json({ error: 'file and docName required' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 })
  }

  const supabase = getSupabaseAdmin()
  const ext      = file.name.split('.').pop() ?? 'bin'
  const fileKey  = `requests/${request.id}/${Date.now()}-${docName.replace(/\s+/g, '-')}.${ext}`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileKey, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadErr) {
    if (uploadErr.message?.includes('not found') || uploadErr.message?.includes('Bucket')) {
      await supabase.storage.createBucket(BUCKET, { public: false })
      const { error: e2 } = await supabase.storage
        .from(BUCKET)
        .upload(fileKey, buffer, { contentType: file.type || 'application/octet-stream' })
      if (e2) return NextResponse.json({ error: `Upload failed: ${e2.message}` }, { status: 500 })
    } else {
      return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
    }
  }

  // Signed URL valid 1 year for admin viewing
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fileKey, 60 * 60 * 24 * 365)
  const fileUrl = signed?.signedUrl ?? fileKey

  const upload = await prisma.documentUpload.create({
    data: {
      requestId: request.id,
      docName,
      category,
      fileUrl,
      fileKey,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
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
    await resend.emails.send({
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
