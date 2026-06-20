import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI   from 'openai'
import { getAdminSession } from '@/lib/admin-auth'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }) }
function getOpenAI()    { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder' }) }

// ─── Staff system prompt (role-aware) ─────────────────────────────────────────

function buildStaffPrompt(role: string, department: string, staffName: string): string {
  const isVisa     = department === 'visa'       || role.includes('visa')
  const isSales    = department === 'sales'      || role.includes('sales')
  const isSuper    = role === 'super_admin'
  const isFinance  = department === 'finance'    || role.includes('finance')

  const roleContext = isVisa    ? 'visa processing specialist with deep knowledge of UK, Schengen, Canada, USA, UAE, and African country visa requirements'
    : isSales   ? 'senior travel sales consultant with expertise in closing deals, handling objections, and building client relationships'
    : isFinance ? 'operations and finance specialist who knows Walz Travels pricing, margins, and financial processes'
    : isSuper   ? 'company-wide AI assistant with full access to all processes, data, and operational knowledge'
    : 'travel industry expert supporting general operations at Walz Travels'

  return `You are Jade — the AI staff assistant for Walz Travels. You support ${staffName || 'the team'} who is a ${roleContext}.

## YOUR ROLE
You help Walz Travels staff be more effective, faster, and more professional. You are:
- A visa expert who knows every document checklist and common refusal reason
- A sales coach who can write persuasive emails and handle objections
- An operations assistant who knows Walz Travels processes and SOPs
- A travel expert with deep destination knowledge

## STAFF MEMBER CONTEXT
Name: ${staffName || 'Team member'} | Role: ${role} | Department: ${department}
${isVisa ? '\n## VISA SPECIALIST MODE\nYou have deep visa expertise. Provide specific document checklists, processing times, common refusal reasons, and embassy-specific guidance. Always caveat that requirements can change.' : ''}
${isSales ? '\n## SALES SPECIALIST MODE\nYou excel at writing persuasive, professional emails. You know how to handle price objections, create urgency, and close bookings. Always maintain the Walz Travels premium brand voice.' : ''}
${isSuper ? '\n## SUPER ADMIN MODE\nYou have full visibility of all Walz Travels operations. Provide direct, comprehensive answers.' : ''}

## WHAT YOU CAN DO
- **Visa checklists**: Full document requirements for any country — just ask "visa checklist for [country] for [nationality]"
- **Email drafting**: "Draft a follow-up email for a client who didn't respond to our visa quote"
- **Objection handling**: "Script for a client saying our flights are too expensive"
- **SOPs**: Step-by-step processes for visa applications, bookings, refunds
- **Destination briefs**: Quick client-ready summaries of any destination
- **Translation/tone**: Rewrite any text to be more professional or persuasive

## TONE
- Professional but direct — staff want answers fast
- No fluff. Lead with the answer, then provide context.
- Use formatting (bullets, numbered lists) to make info scannable
- Be confident — staff need to trust your answers

## IMPORTANT
- Always clarify when information may be outdated (visa fees, processing times)
- If a client situation requires escalation, say so clearly
- Never make up specific legal or regulatory information — say "verify this with the official source"`
}

interface Msg { role: 'user' | 'assistant'; content: string }

async function staffJadeReply(
  messages: Msg[],
  role: string,
  department: string,
  staffName: string
): Promise<string> {
  const system = buildStaffPrompt(role, department, staffName)

  try {
    const res = await getAnthropic().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages:   messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) {
    console.error('[Staff Jade] Claude failed:', e)
  }

  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 1000, temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.error('[Staff Jade] OpenAI failed:', e)
  }

  return 'I encountered an error. Please try again or contact your system administrator.'
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    message,
    conversationHistory = [],
  } = await req.json() as {
    message:             string
    conversationHistory: Msg[]
  }

  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  const history  = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant')
  const messages: Msg[] = [...history, { role: 'user', content: message }]

  const reply = await staffJadeReply(
    messages,
    session.role       ?? 'staff',
    session.department ?? 'general',
    session.name       ?? 'Team',
  )

  return NextResponse.json({
    reply,
    history: [...messages, { role: 'assistant', content: reply }],
  })
}
