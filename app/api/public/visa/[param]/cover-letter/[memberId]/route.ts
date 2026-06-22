import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/group/[param]/visa/cover-letter/[memberId]
 *
 * Generates a personalised visa cover letter for a specific group member.
 * Saves it to their MemberVisaProfile for future retrieval.
 *
 * [param]    = sessionId
 * [memberId] = SessionMember.id
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { param: string; memberId: string } },
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const session = await prisma.groupSession.findUnique({ where: { id: params.param } })
  const member  = await prisma.sessionMember.findUnique({
    where:   { id: params.memberId },
    include: { visaProfile: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!member)  return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (!session.visaDestination) {
    return NextResponse.json({ error: 'No visa destination set' }, { status: 400 })
  }

  // Return cached letter if available
  if (member.visaProfile?.coverLetterText) {
    return NextResponse.json({ letter: member.visaProfile.coverLetterText })
  }

  const prefs = member.preferencesJson as Record<string, unknown> | null
  const visaProfile = member.visaProfile

  const prompt =
    `Write a professional visa cover letter for a traveller applying for a ${session.visaDestination} visa.\n\n` +
    `Traveller profile:\n` +
    `- Name: ${member.name}\n` +
    `- Nationality: ${visaProfile?.nationality ?? prefs?.nationality ?? 'not specified'}\n` +
    `- Travel purpose: Group leisure trip\n` +
    `- Trip name: ${session.name}\n` +
    `- Individual visa score: ${visaProfile?.individualScore ?? 'unscored'}/100\n` +
    `- Travel history countries: ${JSON.stringify(visaProfile?.travelHistoryJson ?? [])}\n\n` +
    `The letter should be formal, specific, and address the most common rejection reasons for applicants ` +
    `from ${visaProfile?.nationality ?? 'this nationality'}. ` +
    `Output the full letter text only — no preamble, no markdown.`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1200,
    messages:   [{ role: 'user', content: prompt }],
  })

  const letter = message.content[0].type === 'text' ? message.content[0].text : ''

  // Persist for future requests
  if (visaProfile) {
    await prisma.memberVisaProfile.update({
      where: { id: visaProfile.id },
      data:  { coverLetterText: letter },
    })
  }

  return NextResponse.json({ letter })
}
