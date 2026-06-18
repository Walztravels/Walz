import { NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { analyzeBankStatementV2 } from '@/lib/analyzeBankStatement'
import type { AgentProgress } from '@/lib/analyzeBankStatement'

export const maxDuration = 300  // 5 min — 6 agents need time

// Server-Sent Events stream for 6-agent pipeline.
// Events:
//   data: {"type":"progress", "payload": AgentProgress}
//   data: {"type":"result",   "payload": EnhancedBankAnalysis}
//   data: {"type":"error",    "payload": {"message":"..."}}

export async function POST(req: NextRequest) {
  const adminSession = await getAdminSession()
  if (!adminSession) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => null)
  const {
    storagePath,
    destination,
    applicantName,
    passportCountry = 'Nigeria',
    applicationId,
  } = body ?? {}

  if (!storagePath || !destination || !applicantName) {
    return new Response(JSON.stringify({ error: 'Missing required fields: storagePath, destination, applicantName' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        const line = `data: ${JSON.stringify({ type, payload })}\n\n`
        controller.enqueue(new TextEncoder().encode(line))
      }

      try {
        // Fetch PDF from Supabase Storage
        const supabase = getSupabaseAdmin()
        const { data: signed, error: signErr } = await supabase.storage
          .from('visa-documents')
          .createSignedUrl(storagePath, 60 * 60 * 2)

        if (signErr || !signed?.signedUrl) {
          send('error', { message: 'Could not access uploaded file. Please re-upload.' })
          controller.close()
          return
        }

        const fileRes = await fetch(signed.signedUrl)
        if (!fileRes.ok) {
          send('error', { message: `Storage fetch failed (${fileRes.status})` })
          controller.close()
          return
        }

        const arrayBuffer = await fileRes.arrayBuffer()
        if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
          send('error', { message: 'File exceeds 50MB limit' })
          controller.close()
          return
        }

        const pdfBuffer = Buffer.from(arrayBuffer)

        // Queue initial agent states
        const agents: AgentProgress[] = [
          { agent: 1, name: 'Document Intelligence',      status: 'queued' },
          { agent: 2, name: 'Forensic Analysis',          status: 'queued' },
          { agent: 3, name: 'Fraud Detection',            status: 'queued' },
          { agent: 4, name: 'Embassy Intelligence',       status: 'queued' },
          { agent: 5, name: 'Predictive Engine',          status: 'queued' },
          { agent: 6, name: 'Consensus & Reconciliation', status: 'queued' },
        ]
        for (const a of agents) send('progress', a)

        // Run the 6-agent pipeline
        const result = await analyzeBankStatementV2(
          pdfBuffer,
          destination,
          applicantName,
          passportCountry,
          (progress) => send('progress', progress),
        )

        // Persist result to Supabase
        if (applicationId) {
          try {
            await supabase
              .from('bank_statement_analyses')
              .upsert(
                {
                  application_id:  applicationId,
                  admin_file_url:  signed.signedUrl,
                  analysis_result: result,
                  analysis_engine: 'v2.0-multi-agent',
                  uploaded_by:     'admin',
                },
                { onConflict: 'application_id' },
              )
          } catch (dbErr) {
            console.warn('[analyse-v2] DB persist failed (non-fatal):', dbErr)
          }
        }

        send('result', result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[analyse-v2] Pipeline error:', message)
        send('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
