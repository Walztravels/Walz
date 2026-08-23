import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const FAL_BASE = 'https://queue.fal.run'

// Kling v1.6 standard — good quality, 5s or 10s, ~$0.045 per second
const TEXT_TO_VIDEO_MODEL = 'fal-ai/kling-video/v1.6/standard/text-to-video'
const IMAGE_TO_VIDEO_MODEL = 'fal-ai/kling-video/v1.6/standard/image-to-video'

function formatForAspectRatio(ar: string): 'reel' | 'story' | 'feed_video' {
  if (ar === '9:16') return 'reel'
  return 'feed_video'
}

// POST — submit a generation job to FAL.ai
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.FALAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Video generation not configured — add FALAI_API_KEY to your environment variables' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    mode?: string        // 'text' | 'image'
    prompt?: string
    imageUrl?: string    // for image-to-video mode
    aspectRatio?: string // '9:16' | '16:9' | '1:1'
    duration?: number    // 5 | 10
  }

  const mode        = body.mode ?? 'text'
  const prompt      = (body.prompt ?? '').trim()
  const aspectRatio = body.aspectRatio ?? '9:16'
  const duration    = body.duration === 10 ? 10 : 5
  const model       = mode === 'image' ? IMAGE_TO_VIDEO_MODEL : TEXT_TO_VIDEO_MODEL

  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  if (mode === 'image' && !body.imageUrl) {
    return NextResponse.json({ error: 'imageUrl required for image-to-video mode' }, { status: 400 })
  }

  const input: Record<string, unknown> = {
    prompt,
    duration: String(duration),
    aspect_ratio: aspectRatio,
  }
  if (mode === 'image' && body.imageUrl) input.image_url = body.imageUrl

  const res = await fetch(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      Authorization:  `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json(
      { error: `FAL.ai error: ${err.slice(0, 300)}` },
      { status: 500 },
    )
  }

  const data = await res.json() as { request_id: string }
  return NextResponse.json({ requestId: data.request_id, model, aspectRatio, duration, prompt })
}

// GET — poll job status; when COMPLETED, create the OrbitMedia record
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.FALAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'FAL.ai not configured' }, { status: 503 })

  const sp          = new URL(req.url).searchParams
  const requestId   = sp.get('requestId')
  const model       = sp.get('model')
  const aspectRatio = sp.get('aspectRatio') ?? '9:16'
  const duration    = parseInt(sp.get('duration') ?? '5', 10)
  const prompt      = sp.get('prompt') ?? ''

  if (!requestId || !model) {
    return NextResponse.json({ error: 'requestId and model required' }, { status: 400 })
  }

  // Check FAL job status
  const statusRes = await fetch(`${FAL_BASE}/${model}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${apiKey}` },
  })
  if (!statusRes.ok) {
    return NextResponse.json({ status: 'error', error: 'Could not reach FAL.ai status endpoint' })
  }

  const statusData = await statusRes.json() as { status: string; error?: string }

  if (statusData.status === 'FAILED') {
    return NextResponse.json({ status: 'failed', error: statusData.error ?? 'Generation failed' })
  }

  if (statusData.status !== 'COMPLETED') {
    // IN_QUEUE or IN_PROGRESS — tell client to keep polling
    return NextResponse.json({ status: statusData.status === 'IN_QUEUE' ? 'queued' : 'processing' })
  }

  // Fetch the completed result
  const resultRes = await fetch(`${FAL_BASE}/${model}/requests/${requestId}`, {
    headers: { Authorization: `Key ${apiKey}` },
  })
  const result = await resultRes.json() as {
    video?: { url: string; file_size?: number }
  }

  const videoUrl = result.video?.url
  if (!videoUrl) {
    return NextResponse.json({ status: 'failed', error: 'FAL.ai returned no video URL' })
  }

  // Persist the generated video as a pending OrbitMedia item
  const media = await prisma.orbitMedia.create({
    data: {
      campaignId:  params.id,
      source:      'generated',
      storagePath: videoUrl,   // FAL CDN URL (valid for 30 days)
      publicUrl:   videoUrl,
      format:      formatForAspectRatio(aspectRatio),
      mediaType:   'video',
      durationMs:  duration * 1000,
      prompt,
      altText:     '',
      costUsd:     0,
      status:      'pending',
      createdBy:   session.email,
    },
  })

  return NextResponse.json({ status: 'done', mediaId: media.id, publicUrl: videoUrl })
}
