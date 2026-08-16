import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getResend } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'
const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
const ADMIN  = 'contact@walztravels.com'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// POST — upload image + create MarketingMedia record + notify admin
// Body: multipart/form-data  { file, tag }
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const link = await prisma.designUploadLink.findUnique({
    where: { token: params.token },
  })

  if (!link)         return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (!link.isActive) return NextResponse.json({ error: 'This upload link has been deactivated.' }, { status: 410 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const tag  = (formData.get('tag') as string | null) ?? 'general'

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPG, PNG, and WebP images are accepted.' },
      { status: 415 },
    )
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }

  const supabase  = getSupabaseAdmin()
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key       = `design-uploads/${Date.now()}-${safeName}`
  const buffer    = Buffer.from(await file.arrayBuffer())

  // Ensure bucket exists (public so URL is stable without signing)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(key)

  const media = await prisma.marketingMedia.create({
    data: {
      filename:   file.name,
      url:        publicUrl,
      mimeType:   file.type,
      sizeBytes:  file.size,
      tags:       [tag],
      altText:    '',
      uploadedBy: 'Design team',
    },
  })

  // Notify admin — fire-and-forget
  getResend().emails.send({
    from:    'Walz Travels <noreply@walztravels.com>',
    to:      ADMIN,
    subject: `New design upload: ${file.name}`,
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:12px;">
  <h2 style="color:#0B1F3A;margin:0 0 4px 0;">New design asset uploaded</h2>
  <p style="color:#666;font-size:14px;margin:0 0 16px 0;">A file was uploaded via the design team link.</p>
  <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;line-height:1.8;margin-bottom:20px;">
    <tr><td style="font-weight:600;padding-right:12px;color:#0B1F3A;">Filename</td><td>${file.name}</td></tr>
    <tr><td style="font-weight:600;padding-right:12px;color:#0B1F3A;">Tag</td><td>${tag}</td></tr>
    <tr><td style="font-weight:600;padding-right:12px;color:#0B1F3A;">Size</td><td>${(file.size / 1024).toFixed(0)} KB</td></tr>
  </table>
  ${publicUrl ? `<img src="${publicUrl}" alt="${file.name}" style="max-width:100%;max-height:220px;border-radius:8px;display:block;margin-bottom:20px;object-fit:cover;" />` : ''}
  <a href="${SITE}/admin/marketing/media"
    style="background:#C9A84C;color:#0B1F3A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
    View in Media Library →
  </a>
</div>`,
  }).catch(() => {})

  return NextResponse.json({ media })
}
