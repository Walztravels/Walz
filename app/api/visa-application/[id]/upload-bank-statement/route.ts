import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

export const maxDuration = 60

const BUCKET = 'visa-documents'
const MAX_SIZE = 25 * 1024 * 1024 // 25MB

// Handles both client (NextAuth session) and admin (admin session) uploads
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const appId = params.id

  // Check client session first, then admin session
  const userSession  = await getServerSession(authOptions)
  const adminSession = await getAdminSession()

  if (!userSession?.user?.id && !adminSession) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // If client session: verify ownership
  if (userSession?.user?.id) {
    const existing = await prisma.visaApplication.findFirst({
      where: { id: appId, userId: userSession.user.id },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file       = formData.get('file') as File | null
  const uploadedBy = (formData.get('uploadedBy') as string | null) ?? (adminSession ? 'admin' : 'client')

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 413 })

  const supabase = getSupabaseAdmin()

  // Archive existing bank statement if admin is replacing client's upload
  if (adminSession) {
    // Check if client file exists and archive it
    const { data: existingFiles } = await supabase.storage
      .from(BUCKET)
      .list(`${appId}`, { search: 'bank-statement.pdf' })

    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage.from(BUCKET).copy(
        `${appId}/bank-statement.pdf`,
        `${appId}/bank-statement-client-archived.pdf`,
      )
    }
  }

  const fileKey = uploadedBy === 'admin'
    ? `${appId}/bank-statement-admin.pdf`
    : `${appId}/bank-statement.pdf`

  const buffer = Buffer.from(await file.arrayBuffer())

  // Remove existing file first (upsert approach)
  await supabase.storage.from(BUCKET).remove([fileKey])

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileKey, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    // Auto-create bucket if not found
    if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
      await supabase.storage.createBucket(BUCKET, { public: false })
      const { error: e2 } = await supabase.storage.from(BUCKET).upload(fileKey, buffer, { contentType: 'application/pdf', upsert: true })
      if (e2) return NextResponse.json({ error: `Upload failed: ${e2.message}` }, { status: 500 })
    } else {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }
  }

  // Generate signed URL (7 days)
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(fileKey, 60 * 60 * 24 * 7)
  const fileUrl = signed?.signedUrl ?? ''

  // Update bank_statement_url in visa_applications (raw Supabase — these columns aren't in Prisma schema)
  const urlCol = uploadedBy === 'admin' ? 'bank_statement_admin_url' : 'bank_statement_url'
  await supabase.from('visa_applications').update({
    [urlCol]: fileUrl,
    bank_statement_uploaded_by: uploadedBy,
  }).eq('id', appId)

  return NextResponse.json({ fileUrl, uploadedBy }, { status: 200 })
}
