import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { getResend } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const { clientName, clientEmail, visaType, nationality, approvalScore, recommendation, analysisJson, currency } = body

    if (!clientEmail) return NextResponse.json({ error: 'Client email is required to send the report' }, { status: 400 })

    const score = Number(approvalScore) || 0
    const scoreColor = score >= 75 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626'
    const scoreLabel = score >= 75 ? 'Strong Application' : score >= 50 ? 'Moderate — Needs Improvement' : 'High Risk — Action Required'

    const analysis = typeof analysisJson === 'string' ? JSON.parse(analysisJson) : (analysisJson ?? {})

    // Handle both v1 (positives array of objects) and v2 (strengths array of strings)
    const strengths: string[] = [
      ...(Array.isArray(analysis.positives) ? analysis.positives.map((p: any) => typeof p === 'string' ? p : p.title) : []),
      ...(Array.isArray(analysis.strengths) ? analysis.strengths : []),
    ].filter(Boolean).slice(0, 5)

    const redFlags: string[] = [
      ...(Array.isArray(analysis.redFlags) && analysis.redFlags.length && typeof analysis.redFlags[0] !== 'string'
        ? analysis.redFlags.map((f: any) => f.title || f.description)
        : []),
      ...(Array.isArray(analysis.redFlagsSimple) ? analysis.redFlagsSimple : []),
    ].filter(Boolean).slice(0, 5)

    const actions: string[] = (Array.isArray(analysis.suggestedActions)
      ? analysis.suggestedActions.map((a: any) => typeof a === 'string' ? a : a.action)
      : []
    ).filter(Boolean).slice(0, 5)

    
    await getResend().emails.send({
      from: 'visa@walztravels.com',
      to:   clientEmail,
      subject: `Your Bank Statement Assessment — ${visaType} Visa | Walz Travels`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.w{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:#060f1e;padding:28px 30px;text-align:center}
.h h1{color:#C9A84C;margin:0;font-size:20px;font-weight:800}
.h p{color:rgba(255,255,255,.4);margin:5px 0 0;font-size:12px}
.b{padding:24px 28px}
.score-box{text-align:center;padding:20px;margin-bottom:22px;border-radius:12px;border:2px solid ${scoreColor}20;background:${scoreColor}08}
.score-num{font-size:48px;font-weight:800;color:${scoreColor};line-height:1}
.score-label{color:${scoreColor};font-weight:700;font-size:13px;margin-top:5px}
.section{margin-bottom:18px}
.section h3{color:#111827;font-size:13px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em}
.item{display:flex;gap:8px;margin-bottom:7px;font-size:13px;color:#374151;line-height:1.5}
.dot-g{color:#059669;flex-shrink:0}
.dot-r{color:#DC2626;flex-shrink:0}
.dot-b{color:#3B82F6;flex-shrink:0}
.rec{background:#FEF3C7;border-left:4px solid #C9A84C;padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:18px}
.rec p{margin:0;color:#92400E;font-size:13px;line-height:1.6}
.disc{background:#F9FAFB;border-radius:8px;padding:12px 14px;font-size:11px;color:#6B7280;margin-top:18px;line-height:1.6}
.f{background:#060f1e;padding:16px;text-align:center}
.f p{color:rgba(255,255,255,.3);font-size:10px;margin:0}
</style>
</head>
<body>
<div class="w">
  <div class="h">
    <h1>Walz Travels</h1>
    <p>Bank Statement Assessment Report</p>
  </div>
  <div class="b">
    <p style="font-size:14px;color:#111">Dear <strong>${clientName || 'Client'}</strong>,</p>
    <p style="font-size:13px;color:#6B7280;margin-bottom:18px">
      We have completed the AI assessment of your bank statement for your
      <strong>${visaType}</strong> visa application${nationality ? ` (${nationality} passport)` : ''}.
    </p>
    <div class="score-box">
      <div class="score-num">${score}<span style="font-size:22px">/100</span></div>
      <div class="score-label">${scoreLabel}</div>
      ${currency ? `<div style="font-size:11px;color:#6B7280;margin-top:4px">Statement currency: ${currency}</div>` : ''}
    </div>
    ${recommendation ? `<div class="rec"><p><strong>Our Assessment:</strong><br>${recommendation}</p></div>` : ''}
    ${strengths.length > 0 ? `
    <div class="section">
      <h3>✓ Strengths</h3>
      ${strengths.map(s => `<div class="item"><span class="dot-g">✓</span><span>${s}</span></div>`).join('')}
    </div>` : ''}
    ${redFlags.length > 0 ? `
    <div class="section">
      <h3>⚠ Areas of Concern</h3>
      ${redFlags.map(f => `<div class="item"><span class="dot-r">!</span><span>${f}</span></div>`).join('')}
    </div>` : ''}
    ${actions.length > 0 ? `
    <div class="section">
      <h3>→ Recommendations</h3>
      ${actions.map(a => `<div class="item"><span class="dot-b">→</span><span>${a}</span></div>`).join('')}
    </div>` : ''}
    <div class="disc">
      This assessment is generated by AI to assist your visa application preparation. It is not a
      guarantee of visa approval. Walz Travels recommends addressing any concerns before submitting
      your application. Contact us for further assistance.
    </div>
  </div>
  <div class="f"><p>Walz Travels · visa@walztravels.com · Confidential Report</p></div>
</div>
</body></html>`,
    })

    return NextResponse.json({ success: true, message: `Report sent to ${clientEmail}` })
  } catch (err: any) {
    console.error('[visa-fortress/send]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
