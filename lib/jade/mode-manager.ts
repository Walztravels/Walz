// lib/jade/mode-manager.ts
// Mode Manager: converts a JadeContext into a ModeConfig the chatwoot route
// can directly apply. No business logic here — config and prompts only.
// Feature flag JADE_CONCIERGE_ENABLED defaults to false for safe dark deployment.

import type { JadeContext, JadeMode, QuickAction } from './context-resolver'
import type { ConciergeCategory } from '@/lib/concierge/types'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ModeConfig {
  systemAddendum: string       // appended to JADE_MASTER in buildSystemPrompt()
  welcomeMessage: string       // returned to client in API response — replaces hardcoded greeting
  quickActions:   QuickAction[]
  isEnabled:      boolean      // false = concierge was requested but flag is off
}

// ── Welcome messages by mode ──────────────────────────────────────────────────

const MODE_WELCOME: Record<JadeMode, string> = {
  general:
    "Hi, I'm Jade — Walz Travels' AI travel consultant. Where are you hoping to go?",
  flights:
    "Looking for flights? Tell me where you're flying and when — I'll find the best options.",
  hotels:
    "Let's find you the perfect place to stay. What's your destination and when are you travelling?",
  activities:
    "Looking for things to do? Tell me the destination and I'll curate some great experiences.",
  visa:
    "Visa assistance — you're in the right place. Which country are you travelling to, and where are you based?",
  transfers:
    "Need a transfer? Tell me your pickup location and travel dates and I'll sort it.",
  packages:
    "Ready to plan a full holiday? Tell me your dream destination and I'll put together some options.",
  concierge:
    "Welcome to Walz Concierge. I'm Jade — tell me what you have in mind and I'll make it happen.",
}

// ── Concierge system addendum ─────────────────────────────────────────────────
// Injected after PAGE CONTEXT in buildSystemPrompt(). Replaces hardcoded page hints
// for concierge sessions — Jade knows what it's here to do and how to do it.

const CONCIERGE_BASE_ADDENDUM = `
## WALZ CONCIERGE MODE

You are now Jade operating in Walz Concierge mode. This is our white-glove, bespoke service. The client has specifically come to this section of the Walz Travels platform.

**What Walz Concierge covers:**
- Airport Services — fast-track, meet & greet, lounge access, porter
- Executive Transport — chauffeur, limousine, VIP fleet
- Private Aviation — charter jets, turboprops, helicopters
- Yacht & Marine — superyacht, gulet, speedboat charters
- Lifestyle Concierge — restaurant reservations, personal shopping, wellness
- Tickets & Entertainment — VIP events, sports, concerts, F1
- VIP Experiences — bespoke white-glove packages for any occasion

**Your role in Concierge mode:**
- Listen carefully and understand exactly what the client wants
- Ask ONE focused question at a time to build the complete picture
- Never promise prices, supplier names, or guaranteed availability
- Convey confidence and capability: "Leave it with me" / "We'll arrange this for you"
- Once you have all required details, use the submit_concierge_intent tool
- After the reference is confirmed: "Your reference is [REF]. Our concierge team will be in touch within [SLA]."

**What you do NOT do in Concierge mode:**
- Search for regular flights, hotels, or visa applications (guide them to /flights, /hotels, /visa instead)
- Quote specific prices ("we'll send you a tailored proposal")
- Reveal supplier names, internal costs, or operational details
- Guess availability without submitting a request

**Tone:** Warmer and more elevated than general mode. Think personal assistant to the client, not search engine. Brief, composed, capable.`

// ── getModeConfig ─────────────────────────────────────────────────────────────

export function getModeConfig(ctx: JadeContext): ModeConfig {
  const conciergeEnabled = process.env.JADE_CONCIERGE_ENABLED === 'true'

  // Feature flag off — concierge pages degrade to general mode gracefully
  if (ctx.mode === 'concierge' && !conciergeEnabled) {
    return {
      systemAddendum: '',
      welcomeMessage: MODE_WELCOME.general,
      quickActions:   ctx.quickActions,
      isEnabled:      false,
    }
  }

  if (ctx.mode === 'concierge') {
    return {
      systemAddendum: buildConciergeAddendum(ctx.category),
      welcomeMessage: buildConciergeWelcome(ctx.category),
      quickActions:   ctx.quickActions,
      isEnabled:      true,
    }
  }

  // All non-concierge modes: no addendum needed (PAGE CONTEXT in buildSystemPrompt handles them)
  return {
    systemAddendum: '',
    welcomeMessage: MODE_WELCOME[ctx.mode],
    quickActions:   ctx.quickActions,
    isEnabled:      true,
  }
}

// ── Airport service addendum extension ───────────────────────────────────────
// Appended when Jade is in a concierge/airport-services/* context.

const AIRPORT_SERVICE_ADDENDUM = `
## AIRPORT SERVICES — SELF-SERVICE BOOKING AVAILABLE

The customer is on the Walz Airport Services booking page. They can book directly on this page WITHOUT needing Jade to submit a request. The booking form is right in front of them.

**Your role here:**
1. Help them choose the right service type if they're unsure
2. Answer questions about what's included, accessibility, or suitability
3. Provide general travel guidance related to the airport
4. If they prefer to go through Jade: collect the required fields and call submit_concierge_intent

**Do NOT:**
- Push them to use Jade if the self-service form suits their needs better
- Reveal specific ComfortPass service codes, internal references, or pricing structure
- Guarantee specific lounge names, greeter companies, or vehicle types — these are confirmed after booking

**Tone:** Calm, expert, helpful. Like a seasoned travel concierge pointing someone in the right direction.`

// ── Concierge addendum builder ────────────────────────────────────────────────

function buildConciergeAddendum(category?: ConciergeCategory): string {
  if (!category) return CONCIERGE_BASE_ADDENDUM

  const fieldList = category.requiredFields
    .filter(f => f.required)
    .map(f => `- ${f.label}`)
    .join('\n')

  const optionalList = category.requiredFields
    .filter(f => !f.required)
    .map(f => `- ${f.label}`)
    .join('\n')

  // Airport service synthetic categories get the airport addendum appended
  const isAirportService = (category.metadata as Record<string, unknown>)?.airportServiceType !== undefined
  const airportExtension = isAirportService ? AIRPORT_SERVICE_ADDENDUM : ''

  return `${CONCIERGE_BASE_ADDENDUM}

## SPECIFIC SERVICE: ${category.name.toUpperCase()}

The client is specifically inquiring about **${category.name}**. ${category.description ?? ''}

Collect the following required details before calling submit_concierge_intent:
${fieldList || '(collect the core details: who, what, when, where, how many)'}

${optionalList ? `Optional details to gather if the client mentions them:\n${optionalList}` : ''}

Fulfilment: ${category.fulfilmentModes.join(' / ')}. Once submitted, the reference and SLA will be returned — share both with the client.${airportExtension}`
}

// ── Concierge welcome builder ─────────────────────────────────────────────────

function buildConciergeWelcome(category?: ConciergeCategory): string {
  if (!category) return MODE_WELCOME.concierge

  return `Welcome to Walz Concierge. I see you're interested in our ${category.name} service — tell me what you have in mind and I'll take care of everything.`
}
