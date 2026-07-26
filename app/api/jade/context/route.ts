import { NextRequest, NextResponse } from 'next/server'
import { resolveContext } from '@/lib/jade/context-resolver'
import { getModeConfig } from '@/lib/jade/mode-manager'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pathname = searchParams.get('pathname') ?? ''

  const ctx    = await resolveContext(pathname)
  const config = getModeConfig(ctx)

  return NextResponse.json({
    mode:          ctx.mode,
    label:         ctx.label,
    welcomeMessage: config.welcomeMessage,
    quickActions:   config.quickActions,
    isEnabled:      config.isEnabled,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
