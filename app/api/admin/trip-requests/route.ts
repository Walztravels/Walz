import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import crypto from 'crypto'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WALZ-REQ-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status
  if (search) where.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { destination: { contains: search, mode: 'insensitive' } },
    { referenceNumber: { contains: search, mode: 'insensitive' } },
  ]
  const requests = await prisma.tripRequest.findMany({ where, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json()
  const { clientEmail, clientName, clientPhone, message } = body
  if (!clientEmail && !clientPhone) return NextResponse.json({ error: 'Email or phone required' }, { status: 400 })

  const token = generateToken()
  const referenceNumber = generateRef()
  const formLink = `https://walztravels.com/trip-request/${token}`
  const nameParts = (clientName || '').split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const tripRequest = await prisma.tripRequest.create({
    data: { token, referenceNumber, status: 'pending', email: clientEmail || null, phone: clientPhone || null, firstName, lastName },
  })

  if (clientEmail) {
    const resend = getResend()
    await resend.emails.send({
      from: 'Walz Travels <contact@walztravels.com>',
      to: clientEmail,
      subject: '✈️ Plan Your Perfect Trip — Walz Travels',
      html: buildInviteEmail({ firstName, formLink, referenceNumber, message }),
    })
  }

  return NextResponse.json({ success: true, tripRequest, formLink, referenceNumber })
}

function buildInviteEmail({ firstName, formLink, referenceNumber, message }: { firstName: string; formLink: string; referenceNumber: string; message?: string }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f0f0;padding:20px}.w{max-width:560px;margin:0 auto}.card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.12)}.hero{background:linear-gradient(135deg,#060f1e 0%,#0d2040 100%);padding:40px 32px;text-align:center}.logo{color:#F59E0B;font-size:11px;font-weight:900;letter-spacing:4px;text-transform:uppercase;margin-bottom:20px;display:block}.hero h1{color:#fff;font-size:28px;font-weight:900;margin-bottom:8px}.hero p{color:rgba(255,255,255,.5);font-size:14px}.body{padding:32px}.greeting{font-size:18px;font-weight:700;color:#111;margin-bottom:8px}.msg{color:#6B7280;font-size:14px;line-height:1.7;margin-bottom:28px}.features{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px}.feat{background:#F9FAFB;border-radius:12px;padding:14px;text-align:center}.feat-icon{font-size:22px;margin-bottom:4px}.feat-text{color:#374151;font-size:12px;font-weight:600}.cta{display:block;background:linear-gradient(135deg,#F59E0B,#D97706);color:#000;font-weight:900;text-align:center;padding:18px 24px;border-radius:14px;text-decoration:none;font-size:16px;margin-bottom:16px}.link-box{background:#F3F4F6;border-radius:10px;padding:12px 16px;text-align:center}.link-box p{color:#9CA3AF;font-size:11px;margin-bottom:4px}.link-box a{color:#D97706;font-size:12px;word-break:break-all}.footer{background:#060f1e;padding:20px 32px;text-align:center}.footer p{color:rgba(255,255,255,.25);font-size:11px;line-height:1.6}</style></head>
<body><div class="w"><div class="card">
<div class="hero"><span class="logo">Walz Travels</span><h1>Plan Your Dream Trip ✈️</h1><p>Tell us exactly what you want — we'll handle the rest</p></div>
<div class="body">
<p class="greeting">Hi ${firstName || 'there'},</p>
<p class="msg">${message || "We've invited you to share your travel preferences. Fill in the form and we'll build a personalised itinerary just for you — flights, hotels, activities and more."}</p>
<div class="features">
<div class="feat"><div class="feat-icon">🎯</div><div class="feat-text">Personalised to you</div></div>
<div class="feat"><div class="feat-icon">⚡</div><div class="feat-text">Takes 3 minutes</div></div>
<div class="feat"><div class="feat-icon">🔒</div><div class="feat-text">100% secure</div></div>
<div class="feat"><div class="feat-icon">✨</div><div class="feat-text">AI-powered plan</div></div>
</div>
<a href="${formLink}" class="cta">Start Planning My Trip →</a>
<div class="link-box"><p>Or copy this link</p><a href="${formLink}">${formLink}</a></div>
</div>
<div class="footer"><p>Walz Travels · ${referenceNumber}<br>This link is unique to you.</p></div>
</div></div></body></html>`
}
