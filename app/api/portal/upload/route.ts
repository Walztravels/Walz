import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getResend } from '@/lib/resend'

const BUCKET = 'portal-documents'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file          = formData.get('file') as File | null
  const applicationId = formData.get('applicationId') as string | null
  const name          = formData.get('name') as string | null
  const category      = (formData.get('category') as string | null) ?? 'General'

  if (!file || !applicationId || !name) {
    return NextResponse.json({ error: 'file, applicationId, and name are required' }, { status: 400 })
  }

  // Verify the application belongs to this user
  const application = await prisma.portalApplication.findFirst({
    where: { id: applicationId, userId: session.user.id },
  })
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // Upload to Supabase Storage
  const supabase = getSupabaseAdmin()
  const ext      = file.name.split('.').pop() ?? 'bin'
  const fileKey  = `${session.user.id}/${applicationId}/${Date.now()}-${name.replace(/\s+/g, '-')}.${ext}`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileKey, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    // If bucket doesn't exist, fall back to creating it first
    if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
      await supabase.storage.createBucket(BUCKET, { public: false })
      const { error: e2 } = await supabase.storage
        .from(BUCKET)
        .upload(fileKey, buffer, { contentType: file.type || 'application/octet-stream' })
      if (e2) return NextResponse.json({ error: `Upload failed: ${e2.message}` }, { status: 500 })
    } else {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }
  }

  // Get a signed URL (valid 7 days for review)
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fileKey, 60 * 60 * 24 * 7)

  const fileUrl = signed?.signedUrl ?? fileKey

  // Save to DB
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const document = await prisma.portalDocument.create({
    data: {
      applicationId,
      userId:   session.user.id,
      name,
      category,
      fileUrl,
      fileKey,
      fileSize: file.size,
      mimeType: file.type || null,
    },
  })

  // Email Glory / admin
  try {
    await getResend().emails.send({
      from:    'Walz Travels Portal <noreply@walztravels.com>',
      to:      'contact@walztravels.com',
      subject: `📎 New Document — ${user?.name ?? session.user.email} · ${application.refNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <div style="background: #0A1628; padding: 20px; text-align: center;">
            <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height:40px;" />
          </div>
          <div style="background: #F7F4EF; padding: 30px;">
            <h2 style="color: #0A1628; margin-top:0;">New Document Uploaded</h2>
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr><td style="padding:6px 0; color:#666;">Client</td><td style="padding:6px 0; font-weight:600; color:#0A1628;">${user?.name ?? user?.email ?? session.user.email}</td></tr>
              <tr><td style="padding:6px 0; color:#666;">Application</td><td style="padding:6px 0; font-weight:600; color:#0A1628;">${application.title} <span style="font-family:monospace; color:#888;">${application.refNumber}</span></td></tr>
              <tr><td style="padding:6px 0; color:#666;">Document</td><td style="padding:6px 0; font-weight:600; color:#0A1628;">${name}</td></tr>
              <tr><td style="padding:6px 0; color:#666;">Category</td><td style="padding:6px 0; color:#0A1628;">${category}</td></tr>
              <tr><td style="padding:6px 0; color:#666;">File size</td><td style="padding:6px 0; color:#0A1628;">${(file.size / 1024).toFixed(1)} KB</td></tr>
            </table>
            <div style="margin-top:24px; text-align:center;">
              <a href="https://www.walztravels.com/admin/clients" style="background:#0A1628; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600;">Review in Admin →</a>
            </div>
          </div>
        </div>
      `,
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ document, fileUrl }, { status: 201 })
}
