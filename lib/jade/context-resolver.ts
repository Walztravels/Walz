// lib/jade/context-resolver.ts
// Server-side context resolver: maps a validated pathname → JadeContext.
// Static routes (flights, hotels, visa…) use an in-memory map — no DB hit.
// Concierge routes query the live concierge_categories table (60-second cache).
// The client-supplied pathname is NEVER trusted for tool access decisions —
// all mode resolution happens here, server-side.

import { getActiveCategories } from '@/lib/concierge/catalogue'
import type { ConciergeCategory } from '@/lib/concierge/types'

// ── Public types ──────────────────────────────────────────────────────────────

export type JadeMode =
  | 'general' | 'flights' | 'hotels' | 'activities'
  | 'visa' | 'transfers' | 'packages' | 'concierge'

// Airport service sub-types (used for category in concierge mode)
export type AirportServiceType = 'lounge' | 'meet-greet' | 'transfer' | 'sleeping-pod' | 'baggage'

export interface QuickAction {
  label: string
  value: string
  type:  'message' | 'link'
}

export interface JadeContext {
  mode:         JadeMode
  category?:    ConciergeCategory   // only set when mode === 'concierge' and a specific category matched
  label:        string               // human-readable e.g. "Concierge — Private Aviation"
  allowedTools: string[]            // enforced in the route; Jade only receives tools in this list
  quickActions: QuickAction[]
}

// ── Tool allowlists by mode ───────────────────────────────────────────────────
// Concierge tools are EXCLUDED from every non-concierge mode.
// submit_concierge_intent is ONLY available in concierge mode.

const TOOLS_BY_MODE: Record<JadeMode, string[]> = {
  general: [
    'search_flights', 'search_hotels', 'send_visa_form', 'save_lead', 'handoff_to_agent',
    'acknowledge_emotion', 'propose_surprise_trip', 'set_price_guardian', 'create_group_hive',
    'request_document_image', 'retrieve_client_history', 'activate_journey_companion',
    'assess_visa_probability', 'check_fx_timing', 'remember_family_member',
    'analyse_visa_refusal', 'schedule_whisper', 'prepare_arrival_pack',
  ],
  flights: [
    'search_flights', 'set_price_guardian', 'save_lead', 'handoff_to_agent',
    'acknowledge_emotion', 'check_fx_timing',
  ],
  hotels: [
    'search_hotels', 'save_lead', 'handoff_to_agent', 'acknowledge_emotion',
  ],
  activities: [
    'save_lead', 'handoff_to_agent', 'acknowledge_emotion', 'propose_surprise_trip',
  ],
  visa: [
    'send_visa_form', 'assess_visa_probability', 'analyse_visa_refusal',
    'save_lead', 'handoff_to_agent', 'request_document_image',
  ],
  transfers: [
    'save_lead', 'handoff_to_agent', 'acknowledge_emotion',
  ],
  packages: [
    'save_lead', 'handoff_to_agent', 'acknowledge_emotion',
    'propose_surprise_trip', 'create_group_hive',
  ],
  concierge: [
    'submit_concierge_intent',   // the single Concierge tool — calls ConciergeCore
    'acknowledge_emotion',
    'handoff_to_agent',
  ],
}

// ── Static quick actions ──────────────────────────────────────────────────────

const STATIC_QUICK_ACTIONS: Record<JadeMode, QuickAction[]> = {
  general: [
    { label: 'Search flights', value: 'I want to search for flights',       type: 'message' },
    { label: 'Book a hotel',   value: 'I need help booking a hotel',        type: 'message' },
    { label: 'Visa help',      value: 'I need visa assistance',             type: 'message' },
    { label: 'Plan a trip',    value: 'Help me plan a trip',                type: 'message' },
  ],
  flights: [
    { label: 'Find cheapest',  value: 'Find the cheapest flight',           type: 'message' },
    { label: 'Business class', value: 'Show me business class options',     type: 'message' },
    { label: 'Price alert',    value: 'Set a price alert for me',           type: 'message' },
  ],
  hotels: [
    { label: 'Find hotels',    value: 'Help me find a hotel',               type: 'message' },
    { label: 'Luxury options', value: 'Show me luxury hotels',              type: 'message' },
  ],
  activities: [
    { label: 'Find experiences', value: 'Find things to do',               type: 'message' },
  ],
  visa: [
    { label: 'UK visa',        value: 'I need a UK visa',                  type: 'message' },
    { label: 'Schengen visa',  value: 'I need a Schengen visa',            type: 'message' },
    { label: 'Start application', value: 'Start my visa application',      type: 'message' },
  ],
  transfers: [
    { label: 'Airport transfer', value: 'Book an airport transfer',        type: 'message' },
  ],
  packages: [
    { label: 'Holiday packages', value: 'Show me holiday packages',        type: 'message' },
    { label: 'Group travel',     value: 'I need a group travel package',   type: 'message' },
  ],
  concierge: [],  // built dynamically from live category data
}

// ── Static route map ──────────────────────────────────────────────────────────
// Add pathname → mode mappings here when new non-concierge pages are added.

const STATIC_MODE_MAP: Record<string, JadeMode> = {
  '':           'general',
  'home':       'general',
  'flights':    'flights',
  'hotels':     'hotels',
  'activities': 'activities',
  'visa':       'visa',
  'transfers':  'transfers',
  'packages':   'packages',
  'tours':      'packages',
  'esim':       'general',
  'about':      'general',
  'blog':       'general',
  'careers':    'general',
  'contact':    'general',
  'help':       'general',
  'rates':      'general',
  'gift':       'general',
  'insurance':  'general',
  'currency':   'general',
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveContext(rawPathname: string): Promise<JadeContext> {
  const pathname = normalizePathname(rawPathname)

  // 1. Static routes — no DB hit needed
  const staticMode = STATIC_MODE_MAP[pathname]
  if (staticMode !== undefined) {
    return {
      mode:         staticMode,
      label:        modeLabel(staticMode),
      allowedTools: TOOLS_BY_MODE[staticMode],
      quickActions: STATIC_QUICK_ACTIONS[staticMode],
    }
  }

  // Also match sub-paths of known static routes (e.g. flights/loyalty)
  const topSegment = pathname.split('/')[0]
  const staticParent = STATIC_MODE_MAP[topSegment]
  if (staticParent !== undefined && topSegment !== 'concierge') {
    return {
      mode:         staticParent,
      label:        modeLabel(staticParent),
      allowedTools: TOOLS_BY_MODE[staticParent],
      quickActions: STATIC_QUICK_ACTIONS[staticParent],
    }
  }

  // 2. Concierge routes — read live category data
  if (pathname === 'concierge' || pathname.startsWith('concierge/')) {
    return resolveConciergeContext(pathname)
  }

  // 3. Unknown path → general (security: never grant elevated tool access to unknown paths)
  return {
    mode:         'general',
    label:        'General',
    allowedTools: TOOLS_BY_MODE.general,
    quickActions: STATIC_QUICK_ACTIONS.general,
  }
}

// ── Airport service synthetic categories ─────────────────────────────────────
// These mirror the real concierge_categories rows but are synthetic so that
// Jade gets the right field list even without a DB hit.

const AIRPORT_SERVICE_FIELDS: Record<string, ConciergeCategory['requiredFields']> = {
  'lounge': [
    { key: 'airport_code',  label: 'Airport',            type: 'text',   required: true  },
    { key: 'date',          label: 'Date',               type: 'date',   required: true  },
    { key: 'time',          label: 'Flight time (HH:MM)',type: 'text',   required: true  },
    { key: 'flight_number', label: 'Flight number',      type: 'text',   required: true  },
    { key: 'passenger_count', label: 'Passengers',       type: 'number', required: true  },
  ],
  'meet-greet': [
    { key: 'airport_code',  label: 'Airport',            type: 'text',   required: true  },
    { key: 'date',          label: 'Date',               type: 'date',   required: true  },
    { key: 'time',          label: 'Flight time (HH:MM)',type: 'text',   required: true  },
    { key: 'flight_number', label: 'Flight number',      type: 'text',   required: true  },
    { key: 'passenger_count', label: 'Passengers',       type: 'number', required: true  },
  ],
  'transfer': [
    { key: 'airport_code',  label: 'Airport',            type: 'text',   required: true  },
    { key: 'date',          label: 'Date',               type: 'date',   required: true  },
    { key: 'passenger_count', label: 'Passengers',       type: 'number', required: true  },
    { key: 'destination',   label: 'Destination address',type: 'text',   required: true  },
    { key: 'flight_number', label: 'Flight number',      type: 'text',   required: false },
  ],
  'sleeping-pod': [
    { key: 'airport_code',  label: 'Airport',            type: 'text',   required: true  },
    { key: 'date',          label: 'Date',               type: 'date',   required: true  },
    { key: 'passenger_count', label: 'Guests',           type: 'number', required: true  },
  ],
  'baggage': [
    { key: 'airport_code',  label: 'Airport',            type: 'text',   required: true  },
    { key: 'date',          label: 'Collection date',    type: 'date',   required: true  },
    { key: 'bag_count',     label: 'Number of bags',     type: 'number', required: true  },
    { key: 'delivery_address', label: 'Delivery address',type: 'text',   required: true  },
  ],
}

const AIRPORT_SERVICE_LABELS: Record<string, string> = {
  'lounge':       'Airport Lounge',
  'meet-greet':   'Meet & Greet',
  'transfer':     'Airport Transfer',
  'sleeping-pod': 'Sleeping Pods',
  'baggage':      'Baggage Delivery',
}

function makeSyntheticAirportCategory(subType: string): ConciergeCategory {
  return {
    id:              `synthetic-airport-${subType}`,
    slug:            `airport-services/${subType}`,
    name:            AIRPORT_SERVICE_LABELS[subType] ?? 'Airport Service',
    description:     `Book ${AIRPORT_SERVICE_LABELS[subType] ?? 'an airport service'} through Walz Concierge.`,
    fulfilmentModes: ['instant'],
    requiredFields:  AIRPORT_SERVICE_FIELDS[subType] ?? [],
    isActive:        true,
    displayOrder:    0,
    metadata:        { airportServiceType: subType, selfServiceBooking: true },
  }
}

// ── Concierge resolution (DB-aware) ──────────────────────────────────────────

async function resolveConciergeContext(pathname: string): Promise<JadeContext> {
  // Airport service sub-paths get synthetic contexts — no DB needed
  if (pathname.startsWith('concierge/airport-services/')) {
    const subType = pathname.replace('concierge/airport-services/', '').split('/')[0]
    const category = makeSyntheticAirportCategory(subType)
    return {
      mode:         'concierge',
      category,
      label:        `Concierge — ${category.name}`,
      allowedTools: TOOLS_BY_MODE.concierge,
      quickActions: [
        { label: `Book ${category.name}`, value: `I'd like to book ${category.name.toLowerCase()} at an airport`, type: 'message' },
        { label: 'Check availability',    value: `What airports offer ${category.name.toLowerCase()}?`,            type: 'message' },
        { label: "What's included",       value: `What's included with the ${category.name.toLowerCase()}?`,       type: 'message' },
      ],
    }
  }

  if (pathname === 'concierge/airport-services') {
    return {
      mode:         'concierge',
      label:        'Concierge — Airport Services',
      allowedTools: TOOLS_BY_MODE.concierge,
      quickActions: [
        { label: 'Lounge access',   value: "I'd like airport lounge access",          type: 'message' },
        { label: 'Meet & Greet',    value: "I need a meet and greet at the airport",  type: 'message' },
        { label: 'Airport transfer',value: "I need an airport transfer",              type: 'message' },
        { label: 'Baggage delivery',value: "I need baggage delivery",                 type: 'message' },
      ],
    }
  }

  const categorySlug = pathname === 'concierge' ? null : pathname.replace('concierge/', '')

  // Load live categories (60-second cache in catalogue module)
  const categories = await getActiveCategories().catch(() => [] as ConciergeCategory[])

  const category = categorySlug
    ? categories.find(c => c.slug === categorySlug)
    : undefined

  // Quick actions for a specific category: use its required fields as prompts
  const quickActions: QuickAction[] = category
    ? category.requiredFields.slice(0, 3).map(f => ({
        label: f.label.length > 28 ? f.label.slice(0, 26) + '…' : f.label,
        value: `I'm interested in ${category.name.toLowerCase()}`,
        type:  'message' as const,
      }))
    : categories.slice(0, 4).map(c => ({
        label: c.name,
        value: `I'm interested in ${c.name.toLowerCase()}`,
        type:  'message' as const,
      }))

  return {
    mode:         'concierge',
    category:     category ?? undefined,
    label:        category ? `Concierge — ${category.name}` : 'Walz Concierge',
    allowedTools: TOOLS_BY_MODE.concierge,
    quickActions,
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function normalizePathname(raw: string): string {
  return raw
    .replace(/^\//, '')   // strip leading slash
    .toLowerCase()
    .split('?')[0]         // strip query string
    .split('#')[0]         // strip hash
    .trim()
}

function modeLabel(mode: JadeMode): string {
  const labels: Record<JadeMode, string> = {
    general:    'General',
    flights:    'Flights',
    hotels:     'Hotels',
    activities: 'Activities',
    visa:       'Visa',
    transfers:  'Transfers',
    packages:   'Packages',
    concierge:  'Walz Concierge',
  }
  return labels[mode]
}
