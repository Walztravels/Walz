// lib/jade/tools.ts
// Jade v4 + v4.2 — 19 agentic tools (5 core + 7 intelligence + 7 intelligence-v2)

import db from "@/lib/db";
import {
  createPriceWatch, createGroupHive, scheduleJourneyAlerts,
  findUnifiedClient, buildMemoryInheritanceContext,
} from "@/lib/jade/intelligence";
import {
  calculateVisaProbability, saveVisaAssessment, getFxAdvice,
  upsertFamilyMember, buildFamilyContext, getFamilyConstellation,
  planWhisper, buildArrivalPack, analyseTranscript,
  type VisaApplicantProfile,
} from "@/lib/jade/intelligence-v2";

const SITE = process.env.NEXT_PUBLIC_BASE_URL || "https://walztravels.com";
const FLIGHTS_ENDPOINT = `${SITE}/api/search/flights`;
const HOTELS_ENDPOINT  = `${SITE}/api/search/hotels`;

export const JADE_TOOLS = [
  {
    name: "search_flights",
    description: "Search live flight offers via Walz Travels' Duffel integration. Use whenever the customer gives origin, destination and a date (even approximate — pick the nearest sensible date and say so). Returns real bookable prices.",
    input_schema: {
      type: "object" as const,
      properties: {
        origin:         { type: "string", description: "IATA code, e.g. YYZ, LOS, LHR" },
        destination:    { type: "string", description: "IATA code, e.g. YOW, ACC, DXB" },
        departure_date: { type: "string", description: "YYYY-MM-DD" },
        return_date:    { type: "string", description: "YYYY-MM-DD, omit for one-way" },
        adults:         { type: "integer", default: 1 },
        cabin:          { type: "string", enum: ["economy","premium_economy","business","first"], default: "economy" },
      },
      required: ["origin", "destination", "departure_date"],
    },
  },
  {
    name: "search_hotels",
    description: "Search live hotel availability and prices. Use when the customer mentions accommodation, a city + dates, or a package.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination: { type: "string", description: "City name, e.g. Rome, Dubai, Accra" },
        check_in:    { type: "string", description: "YYYY-MM-DD" },
        check_out:   { type: "string", description: "YYYY-MM-DD" },
        adults:      { type: "integer", default: 2 },
        rooms:       { type: "integer", default: 1 },
      },
      required: ["destination", "check_in", "check_out"],
    },
  },
  {
    name: "send_visa_form",
    description: "Send the customer the correct visa application link. Use when they ask about visas, requirements, or applications. Also mention the free Visa Intelligence checker.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination_country: { type: "string" },
        nationality:         { type: "string", description: "If known; otherwise omit" },
        visa_type:           { type: "string", enum: ["visitor","study","work","family","transit","unknown"], default: "unknown" },
      },
      required: ["destination_country"],
    },
  },
  {
    name: "save_lead",
    description: "Save/update this customer as a lead the moment you learn anything valuable. Call it silently — never tell the customer. Call again as new details emerge.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:     { type: "string" },
        email:    { type: "string" },
        interest: { type: "string", description: "e.g. 'YYZ→YOW flight July', 'Italy package'" },
        budget:   { type: "string" },
        notes:    { type: "string" },
        stage:    { type: "string", enum: ["browsing","qualified","quoted","ready_to_book"] },
      },
      required: ["interest"],
    },
  },
  {
    name: "handoff_to_agent",
    description: "Transfer to a human agent. Use when: customer explicitly asks for a human, wants to pay, has a complaint, or you've failed to help after 2 attempts.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "One-line summary for the agent" },
      },
      required: ["reason"],
    },
  },
  // ── INTELLIGENCE FEATURE 1: Emotional Resonance ────────────────────────────
  {
    name: "acknowledge_emotion",
    description: "Call this when you detect a strong emotional state (excited, anxious, grieving, frustrated, celebratory, overwhelmed, urgent, nostalgic, romantic, corporate, lonely). Respond to the PERSON before the travel request. Do not mention you are 'detecting emotions' — just be naturally empathetic.",
    input_schema: {
      type: "object" as const,
      properties: {
        emotion:  { type: "string", description: "The detected emotional state", enum: ["excited","anxious","grieving","frustrated","celebratory","lonely","overwhelmed","urgent","nostalgic","romantic","corporate","neutral"] },
        response: { type: "string", description: "Your empathetic acknowledgement (1-3 sentences), before addressing the travel need" },
      },
      required: ["emotion", "response"],
    },
  },
  // ── INTELLIGENCE FEATURE 2: Predictive Trip Proposer ─────────────────────
  {
    name: "propose_surprise_trip",
    description: "After 3-4 messages when you have enough conversation DNA, proactively propose ONE specific trip the client hasn't asked about but would love. Present it as a genuine personal recommendation. Only use once per conversation.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination:     { type: "string" },
        title:           { type: "string" },
        tagline:         { type: "string" },
        cost_estimate:   { type: "string", description: "e.g. from £899 per person" },
        personal_reason: { type: "string", description: "WHY this fits this specific client — reference what they said" },
        highlights:      { type: "array", items: { type: "string" }, description: "3 specific highlights" },
        booking_link:    { type: "string", description: "relative URL e.g. /packages" },
      },
      required: ["destination", "title", "tagline", "cost_estimate", "personal_reason", "highlights", "booking_link"],
    },
  },
  // ── INTELLIGENCE FEATURE 3: Price Guardian ────────────────────────────────
  {
    name: "set_price_guardian",
    description: "After every flight quote, silently set up fare monitoring. If the price drops >£10 or rises >15%, the client gets an automatic WhatsApp alert. Never tell the client you're setting this up unless they ask — just offer it as a feature: 'I'll watch this fare for you and alert you if it drops.'",
    input_schema: {
      type: "object" as const,
      properties: {
        origin:          { type: "string", description: "IATA code" },
        destination:     { type: "string", description: "IATA code" },
        departure_date:  { type: "string", description: "YYYY-MM-DD" },
        cabin:           { type: "string", default: "ECONOMY" },
        quoted_price:    { type: "number", description: "The price you just quoted" },
        quoted_currency: { type: "string", default: "GBP" },
      },
      required: ["origin", "destination", "departure_date", "quoted_price"],
    },
  },
  // ── INTELLIGENCE FEATURE 4: Group Hive Orchestrator ──────────────────────
  {
    name: "create_group_hive",
    description: "When a client mentions planning a group trip, create a Group Hive to collect everyone's preferences and synthesise a consensus trip. Returns a share link for each member to submit their preferences privately.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_name:  { type: "string", description: "Name for this group trip, e.g. 'Lagos Squad Summer 2026'" },
        members:     { type: "array", items: { type: "object", properties: { name: { type: "string" }, preferences: { type: "string" } }, required: ["name"] }, description: "Group members (collect names from conversation)" },
        destination: { type: "string", description: "If already known; omit if open" },
        dates:       { type: "string", description: "If already known; omit if flexible" },
      },
      required: ["group_name", "members"],
    },
  },
  // ── INTELLIGENCE FEATURE 5: Jade Vision ──────────────────────────────────
  {
    name: "request_document_image",
    description: "When you need to read a travel document (passport, visa, boarding pass, hotel confirmation), ask the client to send a photo. Then use /api/jade/vision to extract the data. Call this tool to record that you've made the request.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_type: { type: "string", enum: ["passport","visa","boarding_pass","hotel_confirmation"], description: "What document you're asking for" },
        reason:        { type: "string", description: "Why you need it, e.g. 'to check your passport expiry before applying for the visa'" },
      },
      required: ["document_type", "reason"],
    },
  },
  // ── INTELLIGENCE FEATURE 6: Cross-Channel Memory Inheritance ─────────────
  {
    name: "retrieve_client_history",
    description: "When you suspect this might be a returning client (they reference a past conversation, use your name, or mention a previous trip they discussed), look up their unified cross-channel history. Call this ONCE per conversation, early.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: { type: "string", description: "Client phone number if known" },
        email: { type: "string", description: "Client email if known" },
      },
    },
  },
  // ── INTELLIGENCE FEATURE 7: Journey Companion ─────────────────────────────
  {
    name: "activate_journey_companion",
    description: "After a booking is confirmed, schedule proactive journey alerts: document checklist 48h before, online check-in reminder 24h before, airport reminder 3h before, hotel check-in day before, welcome home message after return. Call this silently after any booking confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        booking_ref:    { type: "string" },
        passenger_name: { type: "string" },
        origin:         { type: "string", description: "IATA or city" },
        destination:    { type: "string", description: "IATA or city" },
        departure_date: { type: "string", description: "YYYY-MM-DD" },
        departure_time: { type: "string", description: "HH:MM UTC" },
        return_date:    { type: "string", description: "YYYY-MM-DD, omit for one-way" },
        hotel_name:     { type: "string", description: "If hotel booked" },
        hotel_check_in: { type: "string", description: "YYYY-MM-DD" },
        visa_required:  { type: "boolean", default: false },
      },
      required: ["booking_ref", "passenger_name", "origin", "destination", "departure_date"],
    },
  },
  // ── INTELLIGENCE FEATURE 8: Visa Probability ──────────────────────────────
  {
    name: "assess_visa_probability",
    description: "Score any visa application 0-100 with country-specific weightings. Call when a client asks about their chances or after a refusal. Give a real number — vague reassurances hurt more than honest assessment. If score < 55, tell them NOT to apply yet.",
    input_schema: {
      type: "object" as const,
      properties: {
        nationality:           { type: "string" },
        destination:           { type: "string" },
        employment_status:     { type: "string", enum: ["employed","self_employed","student","retired","unemployed"] },
        intended_stay_days:    { type: "integer" },
        average_balance_local: { type: "number", description: "Average bank balance in local currency" },
        income_currency:       { type: "string", description: "e.g. NGN, GHS, GBP" },
        months_bank_history:   { type: "integer" },
        property_owned:        { type: "boolean" },
        married_with_family:   { type: "boolean" },
        previous_refusals:     { type: "integer", default: 0 },
        previous_travel:       { type: "array", items: { type: "string" }, description: "IATA country codes e.g. ['AE','TR']" },
        has_sponsor:           { type: "boolean" },
        sponsor_relation:      { type: "string" },
        purpose_of_visit:      { type: "string" },
      },
      required: ["nationality", "destination", "employment_status", "intended_stay_days", "average_balance_local", "income_currency", "months_bank_history"],
    },
  },
  // ── INTELLIGENCE FEATURE 9: Voice Note Intelligence ───────────────────────
  {
    name: "process_voice_note",
    description: "When a client sends a voice note and the transcript is available, analyse intent, language, and urgency so you can reply appropriately — in their language and at the right emotional pace.",
    input_schema: {
      type: "object" as const,
      properties: {
        transcript: { type: "string", description: "The transcribed text of the voice note" },
      },
      required: ["transcript"],
    },
  },
  // ── INTELLIGENCE FEATURE 10: FX Timing Advisor ────────────────────────────
  {
    name: "get_fx_timing",
    description: "When a client asks about exchange rates or whether to pay now vs later, get the live rate with a timing recommendation. Advising a client to WAIT when rates are high builds enormous loyalty.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_currency: { type: "string", description: "e.g. GBP, USD, EUR" },
        to_currency:   { type: "string", description: "e.g. NGN, GHS, KES, ZAR" },
      },
      required: ["from_currency", "to_currency"],
    },
  },
  // ── INTELLIGENCE FEATURE 11: Family Constellation ─────────────────────────
  {
    name: "record_family_member",
    description: "When a client mentions a family member's travel (mum visiting, brother sending tickets, etc.), silently record it. Jade will proactively anticipate their recurring trips in future.",
    input_schema: {
      type: "object" as const,
      properties: {
        primary_client_id: { type: "string", description: "Phone number or chatwoot contact ID of the main client" },
        member_name:       { type: "string" },
        relation:          { type: "string", description: "e.g. 'mum', 'brother', 'sister'" },
        location:          { type: "string", description: "Where they live" },
        visa_status:       { type: "string", description: "e.g. 'UK citizen', 'needs Schengen visa'" },
        travel_pattern:    { type: "string", description: "e.g. 'visits every December'" },
      },
      required: ["primary_client_id", "member_name", "relation"],
    },
  },
  // ── INTELLIGENCE FEATURE 12: Visa Rejection Recovery ─────────────────────
  {
    name: "analyze_visa_refusal",
    description: "When a client shares a visa refusal, call request_document_image first to get the photo, then call this to present the full recovery strategy: what each refusal ground actually means, the exact evidence fix, and reapplication roadmap.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination:        { type: "string", description: "Country that refused" },
        client_nationality: { type: "string" },
        image_url:          { type: "string", description: "Image URL from Chatwoot attachment, if available" },
      },
      required: ["destination"],
    },
  },
  // ── INTELLIGENCE FEATURE 13: Jade Whisper ────────────────────────────────
  {
    name: "activate_whisper",
    description: "When a conversation seems to be ending without a booking (client went quiet after price, visa anxiety, etc.), register them for Jade Whisper — timed re-engagement messages that continue the thread. Call this silently.",
    input_schema: {
      type: "object" as const,
      properties: {
        stage:        { type: "string", enum: ["price_shock","ready_then_vanished","visa_anxiety","comparison_shopping","decision_pending","payment_abandoned","cold_lead","unresponsive"] },
        destination:  { type: "string" },
        quoted_price: { type: "string", description: "The price you quoted, if any" },
      },
      required: ["stage"],
    },
  },
  // ── INTELLIGENCE FEATURE 14: Cultural Bridge & Immigration Coach ──────────
  {
    name: "generate_arrival_pack",
    description: "Generate a complete Arrival Pack: immigration questions with good/bad answers, hand luggage doc list, red flags, cultural briefing, local phrases, first-day plan, emergency numbers. Deliver as separate WhatsApp messages for readability.",
    input_schema: {
      type: "object" as const,
      properties: {
        destination:      { type: "string" },
        nationality:      { type: "string" },
        purpose_of_visit: { type: "string", description: "e.g. 'visiting family', 'tourism', 'work'" },
      },
      required: ["destination", "nationality", "purpose_of_visit"],
    },
  },
] as const;

export interface ToolContext {
  conversationId: number;
  contactId:      number | null;
  phone:          string | null;
  contactName:    string | null;
}

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<string> {
  try {
    switch (name) {
      case "search_flights":           return await searchFlights(input)
      case "search_hotels":            return await searchHotels(input)
      case "send_visa_form":           return visaForm(input)
      case "save_lead":                return await saveLead(input, ctx)
      case "handoff_to_agent":         return "HANDOFF_REQUESTED"
      case "acknowledge_emotion":      return acknowledgeEmotion(input)
      case "propose_surprise_trip":    return proposeSurpriseTrip(input)
      case "set_price_guardian":       return await setPriceGuardian(input, ctx)
      case "create_group_hive":        return await createGroupHiveTool(input, ctx)
      case "request_document_image":   return requestDocumentImage(input)
      case "retrieve_client_history":  return await retrieveClientHistory(input, ctx)
      case "activate_journey_companion": return await activateJourneyCompanion(input, ctx)
      case "assess_visa_probability":  return await assessVisaProbabilityTool(input, ctx)
      case "process_voice_note":       return await processVoiceNoteTool(input)
      case "get_fx_timing":            return await getFxTimingTool(input)
      case "record_family_member":     return await recordFamilyMemberTool(input, ctx)
      case "analyze_visa_refusal":     return analyzeVisaRefusalTool(input)
      case "activate_whisper":         return await activateWhisperTool(input, ctx)
      case "generate_arrival_pack":    return await generateArrivalPackTool(input)
      default: return `Unknown tool: ${name}`
    }
  } catch (err: any) {
    console.error(`[jade] tool ${name} failed:`, err)
    return `Tool error: ${err?.message || "unknown"}. Apologise briefly and offer to connect a human agent.`
  }
}

// ── Original executors ────────────────────────────────────────────────────────

async function searchFlights(input: any): Promise<string> {
  const res = await fetch(FLIGHTS_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: input.origin?.toUpperCase(), destination: input.destination?.toUpperCase(),
      departureDate: input.departure_date, returnDate: input.return_date || undefined,
      adults: input.adults || 1, cabinClass: String(input.cabin || "economy").toUpperCase(),
    }),
  })
  if (!res.ok) return `Flight search unavailable (${res.status}). Offer to have an agent send options, or point to ${SITE}/flights/search`
  const data = await res.json()
  const all: any[] = Array.isArray(data) ? data : data.offers || data.data || []
  if (all.length === 0) return "No offers for those exact dates. Suggest flexible dates ±3 days, or offer the booking link."
  const priceOf = (o: any) => Number(o.price?.amount ?? o.displayPrice?.amount ?? o.total_amount ?? Infinity)
  const offers = [...all].sort((a, b) => priceOf(a) - priceOf(b)).slice(0, 3)
  const summary = offers.map((o: any, i: number) => {
    const seg = o.outbound?.[0]
    const carrier = seg?.airline || o.owner?.name || o.airline || "Airline"
    const flightNo = seg?.flightNumber ? ` ${seg.flightNumber}` : ""
    const amount = o.price?.amount ?? o.displayPrice?.amount ?? o.total_amount ?? "?"
    const currency = o.price?.currency || o.displayPrice?.currency || o.total_currency || "GBP"
    const dep = seg?.departureTime ? `dep ${String(seg.departureTime).slice(11,16)}` : ""
    const mins = Number(o.totalDuration)
    const dur = Number.isFinite(mins) ? `${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}m` : ""
    const stops = o.stops != null ? (Number(o.stops)===0 ? "direct" : `${o.stops} stop(s)`) : ""
    return [`${i+1}. ${carrier}${flightNo} — ${currency} ${amount}`, dep, dur, stops].filter(Boolean).join(" · ")
  }).join("\n")
  return `LIVE OFFERS (top 3, ${all.length} total):\n${summary}\n\nBooking link: ${SITE}/flights/search?origin=${input.origin}&destination=${input.destination}&date=${input.departure_date}\nPresent 1-2 best options with real prices, then push toward the booking link or agent.`
}

async function searchHotels(input: any): Promise<string> {
  const res = await fetch(HOTELS_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination: input.destination, checkIn: input.check_in, checkOut: input.check_out, adults: input.adults||2, rooms: input.rooms||1 }),
  })
  if (!res.ok) return `Hotel search unavailable (${res.status}). Point to ${SITE}/hotels or offer agent follow-up.`
  const data = await res.json()
  const hotels = (Array.isArray(data) ? data : data.hotels||data.results||data.data||[]).slice(0,3)
  if (!hotels.length) return "No availability for those dates. Suggest nearby dates or a different area."
  const summary = hotels.map((h: any, i: number) => {
    const name = h.name||h.hotelName||"Hotel"
    const price = h.minRate||h.price||h.totalPrice||"?"
    const currency = h.currency||"EUR"
    const rating = h.categoryName||h.stars||h.rating||""
    return `${i+1}. ${name} ${rating} — from ${currency} ${price}`
  }).join("\n")
  return `LIVE HOTELS (top 3):\n${summary}\n\nBooking link: ${SITE}/hotels\nPresent the best 1-2 with nightly price, then drive to the link or agent.`
}

function visaForm(input: any): string {
  const dest = (input.destination_country || "").toLowerCase()
  const known: Record<string,string> = {
    canada: `${SITE}/visa/canada-visa-nigeria`, uk: `${SITE}/visa`,
    "united kingdom": `${SITE}/visa`, schengen: `${SITE}/visa`, italy: `${SITE}/visa`,
    uae: `${SITE}/visa`, dubai: `${SITE}/visa`, usa: `${SITE}/visa`,
  }
  const link = known[dest] || `${SITE}/visa`
  return `Visa application link: ${link}\nVisa Intelligence checker (free eligibility check): ${SITE}/visa\nShare the link, note key requirements, offer visa specialist review.`
}

async function saveLead(input: any, ctx: ToolContext): Promise<string> {
  const identifier = ctx.phone || `chatwoot-contact-${ctx.contactId}`
  const stageToStatus: Record<string,string> = { browsing:"New", qualified:"Contacted", quoted:"Contacted", ready_to_book:"In Progress" }
  const status = stageToStatus[input.stage||"browsing"] || "New"
  const details = [input.interest&&`Interest: ${input.interest}`, input.budget&&`Budget: ${input.budget}`, input.notes&&`Notes: ${input.notes}`].filter(Boolean).join("\n")
  const existing = await db.lead.findFirst({ where: { whatsapp: identifier }, select: { id: true } })
  if (existing) {
    await db.lead.update({ where: { id: existing.id }, data: { ...(input.name?{name:input.name}:{}), ...(input.email?{email:input.email}:{}), status, lastMessage: details||undefined, lastMessageAt: new Date(), ...(details?{details}:{}) } })
  } else {
    await db.lead.create({ data: { name: input.name||ctx.contactName||"WhatsApp Lead", email: input.email||null, whatsapp: identifier, source: "whatsapp-jade", sourceId: `jade-wa-${identifier}`, status, lastMessage: details||null, lastMessageAt: new Date(), details: details||null, platform: "WhatsApp" } })
  }
  return "Lead saved. Continue the conversation naturally — do not mention this."
}

// ── Intelligence feature executors ────────────────────────────────────────────

function acknowledgeEmotion(input: any): string {
  return `EMOTION_ACKNOWLEDGED:${input.emotion}|${input.response}`
}

function proposeSurpriseTrip(input: any): string {
  const highlights = (input.highlights as string[]).map((h:string,i:number) => `${i+1}. ${h}`).join("\n")
  return `SURPRISE_TRIP_PROPOSED: Present this to the client now:\n\n✨ Based on everything you've told me, I think you'd absolutely love this:\n\n*${input.title}*\n${input.destination}\n\n${input.tagline}\n\n${highlights}\n\n💷 ${input.cost_estimate}\n\nWhy this for you? ${input.personal_reason}\n\nWant me to put together a full quote? → ${SITE}${input.booking_link}`
}

async function setPriceGuardian(input: any, ctx: ToolContext): Promise<string> {
  try {
    const id = await createPriceWatch({
      conversationId: String(ctx.conversationId),
      contactPhone:   ctx.phone,
      origin:         input.origin,
      destination:    input.destination,
      departureDate:  input.departure_date,
      cabin:          input.cabin,
      quotedPrice:    Number(input.quoted_price),
      quotedCurrency: input.quoted_currency || "GBP",
    })
    return `PRICE_GUARDIAN_SET: watch ${id} active. Tell the client: "I've set up a price watch on this fare — I'll alert you on WhatsApp if the price drops significantly."`
  } catch (e: any) {
    return `Price guardian failed to set: ${e.message}. Continue without mentioning this.`
  }
}

async function createGroupHiveTool(input: any, ctx: ToolContext): Promise<string> {
  try {
    const { id, shareLink } = await createGroupHive({
      name: input.group_name, creatorId: String(ctx.contactId || ctx.conversationId),
      members: input.members, destination: input.destination, dates: input.dates,
    })
    const memberLinks = (input.members as any[]).map((m: any, i: number) =>
      `${m.name}: ${shareLink}?member=${i}`
    ).join("\n")
    return `GROUP_HIVE_CREATED: id=${id}\nShare these private links with each member so they can submit their preferences without seeing each other's answers:\n${memberLinks}\n\nOnce everyone has submitted, I'll synthesise the best 3 trip options that satisfy everyone.`
  } catch (e: any) {
    return `Group hive creation failed: ${e.message}. Continue conversation manually.`
  }
}

function requestDocumentImage(input: any): string {
  const labels: Record<string,string> = {
    passport: "passport photo (data page — the one with your photo and details)",
    visa: "visa page from your passport",
    boarding_pass: "boarding pass (photo or screenshot)",
    hotel_confirmation: "hotel booking confirmation",
  }
  const label = labels[input.document_type] || "travel document"
  return `DOCUMENT_REQUESTED: Ask the client to send their ${label}. Reason: ${input.reason}. Once they send it, the image will be automatically processed to extract the relevant details.`
}

async function retrieveClientHistory(input: any, ctx: ToolContext): Promise<string> {
  try {
    const client = await findUnifiedClient({
      phone: input.phone || ctx.phone || undefined,
      email: input.email || undefined,
      chatwootId: ctx.contactId ? String(ctx.contactId) : undefined,
    })
    if (!client) return "No previous cross-channel history found for this client. Treat as new."
    return `RETURNING_CLIENT:\n${buildMemoryInheritanceContext(client)}`
  } catch (e: any) {
    return `History lookup failed: ${e.message}. Treat as new client.`
  }
}

async function activateJourneyCompanion(input: any, ctx: ToolContext): Promise<string> {
  try {
    await scheduleJourneyAlerts({
      bookingRef:    input.booking_ref,
      passengerName: input.passenger_name,
      origin:        input.origin,
      destination:   input.destination,
      departureDate: input.departure_date,
      departureTime: input.departure_time,
      returnDate:    input.return_date,
      hotelName:     input.hotel_name,
      hotelCheckIn:  input.hotel_check_in,
      visaRequired:  input.visa_required ?? false,
    }, String(ctx.conversationId), ctx.phone)
    return `JOURNEY_COMPANION_ACTIVE: Proactive journey alerts scheduled for booking ${input.booking_ref}. The client will receive timely reminders without you having to do anything. Do not mention this to the client unless they ask.`
  } catch (e: any) {
    return `Journey companion activation failed: ${e.message}. Continue without alerts.`
  }
}

// ── Intelligence v2 executors ─────────────────────────────────────────────────

async function assessVisaProbabilityTool(input: any, ctx: ToolContext): Promise<string> {
  const profile: VisaApplicantProfile = {
    nationality:         input.nationality,
    destination:         input.destination,
    employmentStatus:    input.employment_status,
    intendedStayDays:    input.intended_stay_days,
    averageBalanceLocal: input.average_balance_local,
    incomeCurrency:      input.income_currency,
    monthsOfBankHistory: input.months_bank_history,
    propertyOwned:       input.property_owned,
    marriedWithFamily:   input.married_with_family,
    previousRefusals:    input.previous_refusals ?? 0,
    previousTravel:      input.previous_travel ?? [],
    hasSponsor:          input.has_sponsor,
    sponsorRelation:     input.sponsor_relation,
    purposeOfVisit:      input.purpose_of_visit,
    conversationId:      String(ctx.conversationId),
  }
  const assessment = calculateVisaProbability(profile)
  saveVisaAssessment(assessment, profile).catch(() => {})
  const sLines = assessment.strengths.map(s => `✅ ${s}`).join("\n")
  const bLines = assessment.blockers.map(b => `🚫 ${b}`).join("\n")
  const rLines = assessment.risks.map(r => `⚠️ ${r.issue} — fix: ${r.fix} (${r.timeline})`).join("\n")
  const qLines = assessment.quickWins.map(q => `💡 ${q}`).join("\n")
  return `VISA_ASSESSMENT: Score ${assessment.score}/100 — ${assessment.band}

${assessment.recommendation}

${sLines ? `STRENGTHS:\n${sLines}` : ""}${bLines ? `\n\nBLOCKERS:\n${bLines}` : ""}${rLines ? `\n\nRISKS:\n${rLines}` : ""}${qLines ? `\n\nQUICK WINS:\n${qLines}` : ""}${assessment.feeGBP ? `\n\nVisa fee: £${assessment.feeGBP}` : ""}

Present the score clearly: "Your profile scores ${assessment.score}/100 — ${assessment.band}." Be honest: if < 55, advise fixing gaps before applying. Offer our visa specialist service for full support.`
}

async function processVoiceNoteTool(input: any): Promise<string> {
  const analysis = await analyseTranscript(input.transcript)
  return `VOICE_ANALYSIS: language=${analysis.language} urgency=${analysis.urgency} intent="${analysis.intent}" entities=${JSON.stringify(analysis.entities)}
Reply instruction: ${analysis.replyLanguage}
Address the intent directly in the style indicated.`
}

async function getFxTimingTool(input: any): Promise<string> {
  const advice = await getFxAdvice(input.from_currency, input.to_currency)
  if (!advice) return `FX data unavailable for ${input.from_currency}/${input.to_currency}. Note the approximate rate from memory and remind the client rates change daily.`
  return `FX_ADVICE: ${advice.message}\nPresent this naturally without revealing you called a tool.`
}

async function recordFamilyMemberTool(input: any, ctx: ToolContext): Promise<string> {
  const clientId = input.primary_client_id || ctx.phone || String(ctx.contactId)
  await upsertFamilyMember(clientId, {
    name: input.member_name, relation: input.relation,
    location: input.location, visaStatus: input.visa_status, travelPattern: input.travel_pattern,
  })
  // Return current constellation context so Jade can mention it naturally
  const constellation = await getFamilyConstellation(clientId)
  const context = constellation ? buildFamilyContext(constellation) : ''
  return `FAMILY_RECORDED: ${input.relation} ${input.member_name} added.\n${context}\nContinue naturally — don't announce that you saved this.`
}

function analyzeVisaRefusalTool(input: any): string {
  return `REFUSAL_ANALYSIS: Ask the client to send a clear photo of their full refusal letter (all pages). Once received, process via /api/jade/refusal. Destination refused: ${input.destination}. While waiting, empathise: "A refusal isn't the end — let me see the letter and I'll tell you exactly what to fix."`
}

async function activateWhisperTool(input: any, ctx: ToolContext): Promise<string> {
  await planWhisper({
    conversationId: String(ctx.conversationId),
    stage:          input.stage,
    destination:    input.destination,
    quotedPrice:    input.quoted_price,
    contactName:    ctx.contactName || undefined,
  })
  return `WHISPER_PLANNED: stage=${input.stage}. Re-engagement messages will be sent on schedule. Do not mention this to the client.`
}

async function generateArrivalPackTool(input: any): Promise<string> {
  const pack = await buildArrivalPack({
    destination:    input.destination,
    nationality:    input.nationality,
    purposeOfVisit: input.purpose_of_visit,
  })
  const immigQ  = pack.immigration.questions
    .map((q, i) => `Q${i+1}: "${q.question}"\n  ✅ ${q.goodAnswer}\n  ❌ Avoid: ${q.avoid}`)
    .join("\n\n")
  const phrases = pack.cultural.localPhrases.map(p => `"${p.phrase}" = ${p.meaning}`).join(" · ")
  return `ARRIVAL_PACK for ${pack.destination} — send as SEPARATE WhatsApp messages:

MSG 1 — IMMIGRATION: "✈️ Before you land in ${pack.destination}, here's what to expect from immigration:\n\n${immigQ}"

MSG 2 — HAND LUGGAGE DOCS: "📋 Keep these in your hand luggage:\n${pack.immigration.handLuggageDocs.map(d => `• ${d}`).join("\n")}"

MSG 3 — RED FLAGS: "⚠️ Things that can trigger secondary questioning:\n${pack.immigration.redFlags.map(r => `• ${r}`).join("\n")}"

MSG 4 — FIRST DAY: "📍 Day 1 in ${pack.destination}:\n${pack.cultural.firstDayPlan.map((s, i) => `${i+1}. ${s}`).join("\n")}"

MSG 5 — PHRASES + EMERGENCY: "🗣️ Useful phrases: ${phrases}\n\n🚨 Emergency: ${pack.cultural.emergencyNumbers.map(e => `${e.label}: ${e.number}`).join(" | ")}"

Send each message separately. Ask if they want anything explained further.`
}
