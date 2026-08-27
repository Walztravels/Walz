import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getServerSession }   from 'next-auth'
import { authOptions }        from '@/lib/auth'
import prisma                 from '@/lib/db'
import { BUSINESS } from '@/lib/config/business'
import {
  JADE_TRIP_TOOL_SCHEMAS,
  executeJadeTripTool,
  type JadeTripToolContext,
} from '@/lib/jade/trip-tools'
import {
  JADE_SEARCH_TOOL_SCHEMAS,
  executeJadeSearchTool,
} from '@/lib/jade/search-tools'
import {
  JADE_REFINEMENT_TOOL_SCHEMAS,
  executeJadeRefinementTool,
} from '@/lib/jade/trip-refinement-tools'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }) }
function getOpenAI()    { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder' }) }

// ─── JADE MASTER SYSTEM PROMPT ────────────────────────────────────────────────
const JADE_SYSTEM = `You are Jade — the professional AI travel consultant and sales agent for Walz Travels.

## YOUR IDENTITY
- Name: Jade
- Role: Senior Travel Consultant & Sales Agent
- Company: Walz Travels (walztravels.com)
- Personality: Warm, knowledgeable, persuasive but never pushy. Think of the best luxury travel agent you've ever spoken to — that's you.

## YOUR COMMUNICATION STYLE
- Speak naturally like a human consultant, not a chatbot
- Use the customer's first name once you know it
- Mirror their energy: if they're excited, match it. If they're uncertain, be calm and reassuring.
- Never use generic phrases like "Great choice!" or "Certainly!" — sound human
- Ask ONE clarifying question at a time, not five
- Use short paragraphs. No walls of text.
- Light use of ✈ 🌍 🏨 emojis — tasteful, not excessive

## YOUR SALES APPROACH
1. **Discover** — Understand their dream trip (destination, dates, budget, who's travelling, vibe they want)
2. **Recommend** — Give ONE tailored recommendation first, not a list of 5
3. **Build** — Add value: "Most clients also add a desert safari — want me to include that?"
4. **Close** — Guide them naturally to booking: "Want me to check availability for those dates?"
5. **Handoff** — If they're ready to book, direct them to the right page or offer to connect them with the team

## SERVICES YOU SELL
- ✈ **Flights** → /flights (hundreds of airlines, best prices guaranteed)
- 🏨 **Hotels** → /hotels (180,000+ properties, curated picks)
- 🎭 **Activities** → /activities (experiences in 100+ destinations)
- 🚗 **Transfers** → /transfers (private airport & hotel transfers)
- 🗺 **Tours** → /tours (private guided tours, expert local guides)
- 📦 **Packages** → /packages (all-inclusive group deals)
- 🌐 **Visas** → /visa (15+ countries, 90%+ approval rate)
- 📶 **eSIM** → /esim (Jade Connect, stay connected abroad)

## PRICING KNOWLEDGE
- Flights: From £89 short-haul, £350+ long-haul
- Hotels: From £60/night budget, £150+ mid, £400+ luxury
- Activities: From £20/person, full-day from £80
- Transfers: From £35 airport
- Always say "from" prices — exact depends on dates
- Never make up specific flight numbers or hotel rates

## LEAD CAPTURE
When a customer seems ready or asks to book:
- Ask for their name and email if you don't have it
- Offer to "send a personalised quote to their email"
- This generates a lead — mention you'll follow up within 2 hours

## ESCALATION
If the customer is angry, has a complaint, or needs urgent help:
- "Let me connect you with our team right away"
- Provide: WhatsApp ${BUSINESS.contacts.globalWhatsapp.display} | contact@walztravels.com
- Never argue. Empathise. Escalate.

## FORBIDDEN
- Never pretend to have real-time flight prices or live availability
- Never book anything directly — guide to the booking page
- Never discuss competitor companies
- Never make promises about visa approval
- If asked if you're AI: "I'm Jade, Walz Travels' AI consultant — I'm here to make your travel planning effortless!"`

// ─── INTENT DETECTION ─────────────────────────────────────────────────────────
function detectIntent(message: string): string {
  const m = message.toLowerCase()
  if (/visa|passport|document|permit/.test(m))             return 'visa'
  if (/flight|fly|airline|airport/.test(m))                return 'flights'
  if (/hotel|stay|accommodation|room|resort/.test(m))      return 'hotels'
  if (/tour|guide|excursion|sightseeing/.test(m))          return 'tours'
  if (/transfer|taxi|pickup|airport.*ride/.test(m))        return 'transfers'
  if (/activit|experience|thing.*do|entertainment/.test(m))return 'activities'
  if (/esim|sim|data|roaming|internet.*travel/.test(m))    return 'esim'
  if (/package|holiday|vacation|trip/.test(m))             return 'package'
  if (/price|cost|cheap|budget|affordable/.test(m))        return 'pricing'
  if (/complaint|refund|cancel|problem|issue|urgent/.test(m)) return 'escalation'
  return 'general'
}

// ─── SENTIMENT ANALYSIS ───────────────────────────────────────────────────────
function detectSentiment(message: string): 'positive' | 'negative' | 'neutral' {
  const m   = message.toLowerCase()
  const neg = /angry|terrible|awful|bad|wrong|broken|refund|cancel|never|hate|useless|worst|disappoint/.test(m)
  const pos = /great|love|amazing|perfect|thanks|yes|excited|wonderful|can't wait|awesome/.test(m)
  return neg ? 'negative' : pos ? 'positive' : 'neutral'
}

// ─── CONTEXT-AWARE SYSTEM PROMPT ──────────────────────────────────────────────
function buildSystemPrompt(intent: string, sentiment: string, msgCount: number, customerName: string, pageContext: string): string {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let additions = `\n\nToday's date is ${today}. When a user says 'next Friday', 'this weekend', 'tomorrow' etc, calculate the exact date yourself and confirm it back to the user. Never ask the user what today's date is.`

  if (sentiment === 'negative') {
    additions += '\n\n## PRIORITY: Customer seems upset. Lead with empathy. Acknowledge their concern before anything else. Offer to escalate to human agent.'
  }
  if (intent === 'escalation') {
    additions += '\n\n## PRIORITY: Customer needs urgent help. Provide WhatsApp and email immediately.'
  }
  if (msgCount <= 1) {
    additions += "\n\n## FIRST MESSAGE: Greet warmly, introduce yourself briefly, ask what kind of travel they're planning. Keep it to 2-3 sentences max."
  }
  if (msgCount > 6) {
    additions += '\n\n## CONVERSATION IS MATURE: Customer has been chatting a while. Gently guide toward a booking action or lead capture.'
  }
  if (customerName) {
    additions += `\n\n## CUSTOMER NAME: ${customerName} — use their name naturally once or twice.`
  }
  if (pageContext) {
    additions += `\n\n## PAGE CONTEXT: Customer is currently on the "${pageContext}" page. Tailor your response to match their current intent.`
  }

  return JADE_SYSTEM + additions
}

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface JadeChatRequest {
  message:             string
  conversationHistory: Message[]
  customerName?:       string
  pageContext?:        string
  sessionId?:          string   // anonymous session ID for trip ownership (4A)
}

// ─── PRIMARY: CLAUDE ──────────────────────────────────────────────────────────
// When tools are provided, runs a tool-calling loop (up to 4 iterations).
// Without tools, behaves identically to the previous single-shot implementation.
async function callClaude(
  messages:     Message[],
  systemPrompt: string,
  msgCount:     number,
  tools?:       Anthropic.Tool[],
  toolExecutor?: (name: string, input: Record<string, unknown>) => Promise<string>,
): Promise<string> {
  const model     = msgCount > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
  const anthropic = getAnthropic()
  const hasTool   = (tools?.length ?? 0) > 0 && toolExecutor != null

  let apiMessages: Anthropic.MessageParam[] = messages as Anthropic.MessageParam[]

  for (let iter = 0; iter < 4; iter++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: hasTool ? 1024 : 600,
      system:     systemPrompt,
      ...(hasTool ? { tools } : {}),
      messages:   apiMessages,
    })

    // End of turn or no tools configured — return text
    if (response.stop_reason !== 'tool_use' || !hasTool) {
      const textBlock = response.content.find(b => b.type === 'text')
      return textBlock?.type === 'text' ? textBlock.text : ''
    }

    // Execute tool calls and feed results back
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const result = await toolExecutor!(block.name, block.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }

    apiMessages = [
      ...apiMessages,
      { role: 'assistant', content: response.content },
      { role: 'user',      content: toolResults },
    ]
  }

  return ''
}

// ─── FALLBACK: OPENAI ─────────────────────────────────────────────────────────
async function callOpenAI(messages: Message[], systemPrompt: string): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model:       'gpt-4o-mini',
    max_tokens:  600,
    temperature: 0.75,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const {
    message,
    conversationHistory = [],
    customerName = '',
    pageContext = '',
    sessionId = '',
  } = await req.json() as JadeChatRequest

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const intent    = detectIntent(message)
  const sentiment = detectSentiment(message)
  const msgCount  = conversationHistory.length

  // ── Release 4A: Trip tool context ─────────────────────────────────────────
  // Resolve authenticated user when JADE_TRIP_WRITE_ENABLED is on.
  // Non-fatal: if session lookup fails, Jade operates without trip write access.
  const tripWriteEnabled = process.env.JADE_TRIP_WRITE_ENABLED === 'true'
  let userId: string | null = null

  if (tripWriteEnabled) {
    try {
      const authSession = await getServerSession(authOptions)
      if (authSession?.user?.email) {
        const user = await prisma.user.findUnique({
          where:  { email: authSession.user.email },
          select: { id: true },
        })
        userId = user?.id ?? null
      }
    } catch { /* non-fatal — Jade continues without auth context */ }
  }

  const tripCtx: JadeTripToolContext = {
    userId,
    sessionId: sessionId || null,
  }

  const liveSearchEnabled      = process.env.JADE_LIVE_SEARCH_ENABLED      === 'true'
  const tripBuilderEnabled     = process.env.JADE_TRIP_BUILDER_ENABLED     === 'true'
  const tripRefinementEnabled  = process.env.JADE_TRIP_REFINEMENT_ENABLED  === 'true'
  const proposalEnabled        = process.env.JADE_PROPOSAL_ENABLED         === 'true'

  // Build unified tool list — trip tools + search tools + refinement tools (filtered by flag)
  const tripToolSchemas: Anthropic.Tool[]       = tripWriteEnabled       ? (JADE_TRIP_TOOL_SCHEMAS        as Anthropic.Tool[]) : []
  const searchToolSchemas: Anthropic.Tool[]     = liveSearchEnabled
    ? (JADE_SEARCH_TOOL_SCHEMAS.filter(t =>
        t.name !== 'build_trip' || tripBuilderEnabled,
      ) as Anthropic.Tool[])
    : []
  const refinementToolSchemas: Anthropic.Tool[] = tripRefinementEnabled
    ? (JADE_REFINEMENT_TOOL_SCHEMAS.filter(t =>
        t.name !== 'create_trip_proposal' || proposalEnabled,
      ) as Anthropic.Tool[])
    : []

  const allTools: Anthropic.Tool[] = [...tripToolSchemas, ...searchToolSchemas, ...refinementToolSchemas]

  // Unified tool executor — routes to the right service by tool name
  const SEARCH_TOOL_NAMES     = new Set(JADE_SEARCH_TOOL_SCHEMAS.map(t => t.name))
  const REFINEMENT_TOOL_NAMES = new Set(JADE_REFINEMENT_TOOL_SCHEMAS.map(t => t.name))
  const unifiedExecutor = allTools.length > 0
    ? async (name: string, input: Record<string, unknown>): Promise<string> => {
        if (SEARCH_TOOL_NAMES.has(name))     return executeJadeSearchTool(name, input, tripCtx)
        if (REFINEMENT_TOOL_NAMES.has(name)) return executeJadeRefinementTool(name, input, tripCtx)
        return executeJadeTripTool(name, input, tripCtx)
      }
    : undefined

  // Append capability hints to system prompt when tools are active
  let systemPrompt = buildSystemPrompt(intent, sentiment, msgCount, customerName, pageContext)
  if (tripWriteEnabled) {
    systemPrompt += `\n\n## TRIP TOOLS\nYou have access to trip management tools: get_trip, create_trip, update_trip, add_trip_item, remove_trip_item, add_search_result_to_trip.\n- Always call get_trip first before suggesting changes to an existing trip.\n- Only add items the customer has explicitly selected — never invent prices or availability.\n- If a remove_trip_item call returns { error: "protected" }, explain to the customer that the item is purchased or confirmed and they must contact the Walz team to cancel it.\n- Never expose supplier IDs, rateKeys, or internal costs — the tool results already exclude these.\n- Use add_search_result_to_trip (not add_trip_item) when adding an item from a live search result.`
  }
  if (liveSearchEnabled) {
    systemPrompt += `\n\n## LIVE SEARCH TOOLS\nYou have access to live inventory search: search_flights, search_hotels, search_activities, search_transfers, search_esims.\n- Always search live before quoting specific prices — never make up fares or rates.\n- Present results to the customer and ask which they'd like before calling add_search_result_to_trip.\n- Result refs (jr_...) expire — if an add_search_result_to_trip call returns SEARCH_RESULT_EXPIRED, run a new search.\n- Never expose resultRef values to the customer — they are internal opaque tokens.\n- sellingPrice and currency in results are the authoritative customer prices — never modify them.`
    if (tripBuilderEnabled) {
      systemPrompt += `\n\n## TRIP BUILDER\nYou have access to build_trip. Call it when the customer asks to build, plan, or put together a full trip. It returns step-by-step instructions — follow them in sequence, presenting results at each stage. Always confirm with the customer before adding anything.`
    }
  }
  if (tripRefinementEnabled) {
    systemPrompt += `\n\n## TRIP REFINEMENT TOOLS\nYou have access to: replace_trip_item, update_trip_preferences, get_trip_commercial_summary.\n- replace_trip_item: use when customer wants to swap one item for another (e.g. "change my hotel to this one"). Always call get_trip first to confirm the item is not purchased/confirmed.\n- update_trip_preferences: use when dates, traveller count, budget, or flight/hotel preferences change. When this marks items stale, prompt the customer to re-search.\n- get_trip_commercial_summary: use before discussing budget, recommending cheaper alternatives, or checking what's missing from the trip.\n- staleReason on an item means its price or availability may be invalid — always prompt re-search for stale items before finalising.`
    if (proposalEnabled) {
      systemPrompt += `\n\n## PROPOSAL TOOL\nYou have access to create_trip_proposal. Call it ONLY when the customer explicitly requests a quote or proposal (e.g. "can you send me a quote?", "I'd like a proposal"). It creates a DRAFT — staff review and send it. Confirm the customer wants a proposal before calling. Never call it on your own initiative.`
    }
  }

  const messages: Message[] = [
    ...conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: message },
  ]

  let reply       = ''
  let aiProvider  = 'claude'

  try {
    reply = await callClaude(messages, systemPrompt, msgCount, allTools.length > 0 ? allTools : undefined, unifiedExecutor)
  } catch (claudeErr) {
    console.error('[Jade] Claude failed, trying OpenAI:', claudeErr)
    aiProvider = 'openai'
    try {
      reply = await callOpenAI(messages, systemPrompt)
    } catch (openaiErr) {
      console.error('[Jade] OpenAI also failed:', openaiErr)
      reply = `I'm having a brief technical issue. For immediate help, WhatsApp us on **${BUSINESS.contacts.globalWhatsapp.display}** or email **contact@walztravels.com** — our team responds within minutes! ✈`
    }
  }

  return NextResponse.json({
    reply,
    intent,
    sentiment,
    aiProvider,
    history: [...messages, { role: 'assistant', content: reply }],
  })
}
