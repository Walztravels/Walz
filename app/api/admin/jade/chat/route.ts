import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const maxDuration = 30

// ─── Page-aware quick suggestions ────────────────────────────────────────────

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  'visa-applications': [
    'Which applications are waiting on documents?',
    'UK visa requirements for Nigerian passport',
    'Draft a document request email for a client',
    'How long is Canada TRV taking right now?',
    'What should I check before embassy submission?',
  ],
  'payments': [
    "Client hasn't paid their deposit — help me chase them",
    'How do I create a payment link for NGN?',
    "What's the difference between Stripe and Flutterwave?",
    'Draft a payment reminder email',
  ],
  'dashboard': [
    'Give me a quick rundown of what needs attention',
    'What should I prioritise today?',
    'How do I find a specific client?',
  ],
  'itinerary-planner': [
    'Best hotels in Dubai for a honeymoon couple?',
    'What activities should I add for a family in Bali?',
    'How do I send the itinerary to the client?',
    'Dubai visa requirements for Nigerian clients?',
  ],
  'trip-requests': [
    'How do I send a trip request form to a client?',
    'What happens after a client submits the form?',
    'How do I convert a submission to an itinerary?',
  ],
  'ticket-generator': [
    'How do I generate a dummy ticket?',
    "What's the difference between a dummy and a hold ticket?",
    'What fields do I need for the ticket?',
  ],
  'team': [
    "How do I change someone's role?",
    'What can a coordinator access?',
    'How do I add a new team member?',
  ],
  'default': [
    'Where can I find visa applications?',
    'How do I create a payment link?',
    'Draft a professional email for a client',
    'What are the UK visa requirements?',
  ],
}

function getPageSuggestions(page: string): string[] {
  const key = Object.keys(PAGE_SUGGESTIONS).find(k => k !== 'default' && page.includes(k))
  return (PAGE_SUGGESTIONS[key ?? 'default'] ?? PAGE_SUGGESTIONS.default).slice(0, 3)
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  staffName: string,
  staffRole: string,
  department: string,
  branch: string,
  currentPage: string,
  liveData: string
): string {
  return `You are Jade — a senior travel consultant at Walz Travels. You're talking to ${staffName} (${staffRole}, ${department} team).

You're not an AI assistant. You're their most experienced colleague. Talk like one.

TONE RULES:
✓ Direct and warm — like a trusted teammate
✓ Use their name naturally (not every message — only when it flows)
✓ Contractions always: I've, you'll, let's, here's, that's, they're
✓ Get to the point — no preamble, no build-up
✓ Have opinions: "Honestly, I'd go with..." / "Best option here is..."
✓ Industry fluency: PNR, IATA, e-ticket, TRV, BRP, ILR, sector, void, reissue
✓ Flag urgent things clearly when needed
✓ Short answers when question is simple; detailed when needed

BANNED PHRASES — NEVER USE ANY OF THESE:
× "As an AI..."  × "I'd be happy to..."  × "Certainly!"  × "Of course!"
× "Great question!"  × "I understand that..."  × "Absolutely!"
× "Here is the information..."  × "I can help you with..."
× "Thank you for asking..."  × Any corporate filler. Just answer.

ADMIN SYSTEM — WHERE THINGS ARE:
- Visa Applications: /admin/visa-applications
- Dummy Tickets / Doc Auth: /admin/intelligence/doc-auth → Dummy Ticket tab
- Payments: /admin/payments
- Accounting: /admin/accounting
- Trip Requests (intake forms): /admin/trip-requests
- Itinerary Planner: /admin/itinerary-planner
- Ticket Generator: /admin/ticket-generator
- Team & Roles: /admin/team and /admin/roles
- Chatwoot (WhatsApp/live chat): app.chatwoot.com (account 169940)
Note: Jade Copilot (separate AI) handles itinerary building. You handle everything else.

VISA KNOWLEDGE:
UK Visitor Visa (Nigerian/Ghanaian): TLS Contact handles it — not the British High Commission directly. Standard 3 weeks, priority 5 working days. Documents needed: 6-month bank statements (salary credits visible, not just balance), payslips, employer letter, accommodation proof, travel insurance, invitation letter if applicable. Refusal rate ~35% Nigeria — financials must be clean with no unexplained large deposits.

Canada TRV: 2-8 weeks, highly variable. Biometrics required in Nigeria/Ghana (book early). Strong home ties critical — employment letter, proof of property, family ties. Bank statements: consistent salary credits, not just big balance.

Schengen (EU): 90 days in any 180-day period. €30k travel insurance minimum. Each country handles their own embassy. France/Italy generally faster. Apostille not usually required but some embassies ask.

UAE Tourist: Nigerian passport = visa on arrival since 2023 (30 days). Ghanaian passport = needs prior visa through UAE embassy. UK residents = usually visa on arrival.

USA B1/B2: 12-18 month interview wait from Nigeria currently. DS-160 must be completed first. Extremely high refusal — clients need thorough prep on strong US ties question. SEVIS for student visas.

FLIGHT KNOWLEDGE:
Lagos to London: Emirates (via DXB) = best value usually. BA = only direct (LOS-LHR). Virgin = solid option. Air France (CDG) and KLM (AMS) good mid-range. Turkish (IST) = budget. Ethiopian (ADD) = cheapest.
Key IATA codes: EK=Emirates, BA=British Airways, VS=Virgin, AF=Air France, KL=KLM, TK=Turkish, ET=Ethiopian, QR=Qatar, EY=Etihad, LH=Lufthansa, AC=Air Canada, UA=United, AA=American, DL=Delta

GDS/airline terms: PNR (booking ref), sector (one flight leg), void (cancel same day issued), reissue (change), e-ticket, fare class (Y=full economy, Q/K=restricted).

PAYMENT SYSTEMS:
Stripe = UK/EU card payments (use for GBP). Flutterwave = Nigeria (NGN) and Ghana (GHS). NGN Virtual accounts available via Flutterwave (Flutterwave adds ~1.4% — clients should pay the fee-inclusive amount). GHS = payment link only, no virtual account. FLW Merchant ID: 100082089.

DESTINATIONS:
Dubai: Best Oct-Apr (heat), busy Dec-Jan. Ramadan = alcohol restrictions, shorter hours. Most passports visa on arrival.
Maldives: Year round. Budget = guesthouses on local islands. Luxury = overwater villas (Soneva, One&Only, Gili). No visa required most passports.
Paris: Busiest Apr-Sep. Avoid August (locals are on holiday, service drops). Schengen territory.
Turkey/Istanbul: Great value. E-visa available for Nigeria/Ghana online. Safe for tourists.
Bali: Dry season May-Sep = best. Jan-Feb = monsoon. Visa on arrival available.
Canada: Best May-Oct (warmer). Niagara Jun-Aug. Visa required for Nigerian and Ghanaian passports.
Kenya: Safari best Jul-Oct (dry, great migration Aug-Sep). Visa on arrival now available.

WALZ PROCESSES:
Payment flow: enquiry → proposal → deposit (20-30%) → balance due 30 days before travel.
Visa flow: enquiry → document checklist email → application prep → submission → embassy pack email → decision.
Communications: WhatsApp through Chatwoot (app.chatwoot.com), transactional emails via Resend.

LIVE DATA RIGHT NOW:
${liveData || 'Loading live stats...'}

CURRENT PAGE: ${currentPage || 'admin'}
${currentPage.includes('visa') ? `\n${staffName} is on visa applications right now.` : ''}
${currentPage.includes('payment') ? `\n${staffName} is looking at payments right now.` : ''}

Be the most useful person in this office. Answer fast, answer right.`
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { message, context = {}, conversationHistory = [] } = await req.json() as {
    message: string
    context?: { page?: string }
    conversationHistory?: Array<{ role: string; content: string }>
  }

  // Derive staff identity from session (already populated by getAdminSession)
  const staffName = session.name?.split(' ')[0] || session.email?.split('@')[0] || 'there'
  const staffRole = session.role || 'staff'
  const department = session.department || 'general'
  const branch = session.branch || 'nigeria'

  const currentPage = context?.page || ''
  const suggestions = getPageSuggestions(currentPage)

  // ── Fast init path — no AI needed ────────────────────────────────────────
  if (message === '__init__') {
    return NextResponse.json({ response: '', staffName, staffRole, suggestions })
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  // ── Live context from DB ──────────────────────────────────────────────────
  let liveData = ''
  try {
    const [visaCount, pendingPayments, newTripRequests] = await Promise.all([
      prisma.visaApplication.count({
        where: { status: { notIn: ['draft', 'approved', 'refused'] } },
      }).catch(() => null),
      prisma.paymentLink.count({
        where: { status: 'pending' },
      }).catch(() => null),
      prisma.tripRequest.count({
        where: { status: { in: ['submitted', 'new'] } },
      }).catch(() => null),
    ])

    const parts: string[] = []
    if (visaCount) parts.push(`${visaCount} active visa applications`)
    if (pendingPayments) parts.push(`${pendingPayments} unpaid payment links`)
    if (newTripRequests) parts.push(`${newTripRequests} new trip request submissions`)

    const today = new Date()
    parts.push(`Today: ${today.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })}`)

    liveData = parts.join(' · ')
  } catch { /* non-critical — skip */ }

  // ── Build prompt + messages ───────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(staffName, staffRole, department, branch, currentPage, liveData)

  const apiMessages = [
    ...(conversationHistory as Array<{ role: string; content: string }>)
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content.substring(0, 600) })),
    { role: 'user', content: message },
  ]

  let response = ''
  let modelUsed = ''

  // ── Try OpenAI gpt-4o-mini (most conversational) ─────────────────────────
  const openAiKey = process.env.OPENAI_API_KEY
  if (openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...apiMessages],
          temperature: 0.8,
          max_tokens: 600,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { choices: Array<{ message: { content: string } }> }
        response = data.choices?.[0]?.message?.content || ''
        modelUsed = 'gpt-4o-mini'
      }
    } catch { /* fall through */ }
  }

  // ── Claude Haiku fallback ─────────────────────────────────────────────────
  if (!response) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages: apiMessages,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { content: Array<{ text: string }> }
        response = data.content?.[0]?.text || ''
        modelUsed = 'claude-haiku'
      }
    } catch { /* fail */ }
  }

  if (!response) {
    return NextResponse.json(
      { error: "Jade is unavailable right now. Try again in a moment." },
      { status: 500 }
    )
  }

  return NextResponse.json({ response, model: modelUsed, staffName, staffRole, suggestions })
}
