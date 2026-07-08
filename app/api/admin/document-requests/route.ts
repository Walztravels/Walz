import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

const SITE   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
const BUCKET = 'portal-documents'
const SIGNED_TTL = 60 * 60 * 24

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId') ?? undefined
  const visaAppId     = searchParams.get('visaAppId')     ?? undefined

  const requests = await prisma.documentRequest.findMany({
    where: {
      ...(applicationId && { applicationId }),
      ...(visaAppId     && { visaAppId     }),
    },
    include: { uploads: { orderBy: { uploadedAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  })

  // Regenerate fresh signed URLs for all uploads so they never appear broken
  const supabase = getSupabaseAdmin()
  const requestsWithFreshUrls = await Promise.all(
    requests.map(async r => ({
      ...r,
      uploads: await Promise.all(
        r.uploads.map(async u => {
          if (!u.fileKey) return u
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(u.fileKey, SIGNED_TTL)
          return { ...u, fileUrl: data?.signedUrl ?? u.fileUrl }
        })
      ),
    }))
  )

  return NextResponse.json({ requests: requestsWithFreshUrls })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    applicationId?: string
    visaAppId?:     string
    clientEmail:    string
    clientName?:    string
    requestedDocs:  Array<{ name: string; description?: string; required?: boolean; category?: string }>
    message?:       string
    deadline?:      string
    daysToExpire?:  number
  }

  if (!body.clientEmail || !body.requestedDocs?.length) {
    return NextResponse.json({ error: 'clientEmail and requestedDocs required' }, { status: 400 })
  }

  const daysToExpire  = body.daysToExpire ?? 14
  const requiredCount = body.requestedDocs.filter(d => d.required !== false).length

  const request = await prisma.documentRequest.create({
    data: {
      applicationId: body.applicationId ?? null,
      visaAppId:     body.visaAppId     ?? null,
      clientEmail:   body.clientEmail,
      clientName:    body.clientName    || 'Valued Client',
      requestedBy:   session.email,
      requestedDocs: JSON.stringify(body.requestedDocs),
      message:       body.message       ?? null,
      deadline:      body.deadline      ? new Date(body.deadline) : null,
      totalRequired: requiredCount,
      expiresAt:     new Date(Date.now() + daysToExpire * 24 * 60 * 60 * 1000),
      emailSentAt:   new Date(),
    },
  })

  const uploadLink = `${SITE}/upload/${request.token}`

  const docList = body.requestedDocs.map(d =>
    `<li style="margin-bottom:8px">
      <strong style="color:#0B1F3A">${d.name}</strong>
      ${d.required !== false
        ? ' <span style="color:#dc2626;font-size:12px">(Required)</span>'
        : ' <span style="color:#888;font-size:12px">(Optional)</span>'}
      ${d.description ? `<br/><span style="color:#666;font-size:12px">${d.description}</span>` : ''}
    </li>`
  ).join('')

  await getResend().emails.send({
    from:    'Walz Travels Visa Team <visa@walztravels.com>',
    to:      body.clientEmail,
    subject: 'Action Required — Documents needed for your application',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0B1F3A;padding:32px;text-align:center">
          <img src="${SITE}/walz-logo.png" width="120" alt="Walz Travels" />
        </div>
        <div style="padding:32px;background:#ffffff">
          <h2 style="color:#0B1F3A;margin:0 0 12px">Documents Required</h2>
          <p style="color:#444;font-size:14px;margin:0 0 16px">
            Hi ${body.clientName || 'there'},<br/><br/>
            Your Walz Travels visa team has reviewed your application and needs you to
            upload the following documents to proceed.
          </p>
          ${body.message ? `
          <div style="background:#f5f0e8;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="color:#0B1F3A;font-size:14px;margin:0">${body.message}</p>
          </div>` : ''}
          <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="color:#0B1F3A;font-weight:bold;font-size:13px;margin:0 0 10px">Documents requested:</p>
            <ul style="margin:0;padding-left:20px;color:#444;font-size:14px">${docList}</ul>
          </div>
          ${body.deadline ? `
          <p style="color:#dc2626;font-size:13px">
            ⚠️ Please upload by: <strong>${new Date(body.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
          </p>` : ''}
          <div style="text-align:center;margin:28px 0">
            <a href="${uploadLink}"
              style="background:#C9A84C;color:#0B1F3A;font-weight:bold;padding:14px 36px;
                border-radius:12px;text-decoration:none;display:inline-block;font-size:16px">
              📎 Upload Documents
            </a>
          </div>
          <p style="color:#888;font-size:12px;text-align:center">
            This link expires in ${daysToExpire} days. Need help?
            <a href="https://wa.me/12317902336" style="color:#C9A84C">WhatsApp: +12317902336</a>
          </p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center">
          <p style="color:#999;font-size:11px;margin:0">© Walz Travels · walztravels.com</p>
        </div>
      </div>
    `,
  }).catch(e => console.error('[DocRequest] Email failed:', e))

  await prisma.activityLog.create({
    data: {
      staffId:    session.id,
      staffName:  session.name,
      staffRole:  session.role,
      action:     'document_request_sent',
      module:     'visa',
      entityId:   request.id,
      entityType: 'document_request',
      detail:     `Requested ${body.requestedDocs.length} doc(s) from ${body.clientEmail}`,
    },
  }).catch(() => {})

  return NextResponse.json({ request, uploadLink }, { status: 201 })
}
