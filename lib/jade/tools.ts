// lib/jade/tools.ts
// Jade 2.1 agentic tools — real capability: search flights, quote hotels,
// send visa forms, capture leads, hand off to humans.

import db from "@/lib/db"; // Prisma client (default export)
import {
  calculateVisaProbability, getFxAdvice, upsertFamilyMember,
  buildArrivalPack,
  type VisaApplicantProfile,
} from "@/lib/jade/intelligence-v2";

const SITE = process.env.NEXT_PUBLIC_BASE_URL || "https://walztravels.com";

// Both endpoints VERIFIED LIVE 2026-07-02 (same-origin probes):
//   POST /api/search/flights → Zod-validated; cabinClass MUST be uppercase
//   (ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST); returns a BARE ARRAY of
//   offers: { price:{amount,currency}, outbound:[{airline,airlineCode,
//   flightNumber,departureTime,arrivalTime}], stops, totalDuration(min), ... }
//   POST /api/search/hotels → confirmed path.
const FLIGHTS_ENDPOINT = `${SITE}/api/search/flights`;
const HOTELS_ENDPOINT = `${SITE}/api/search/hotels`;

// ---------------------------------------------------------------------------
// Tool schema passed to Claude
// ---------------------------------------------------------------------------
export const JADE_TOOLS = [
  {
    name: "search_flights",
    description:
      "Search live flight offers via Walz Travels' Duffel integration. Use whenever the customer gives origin, destination and a date (even apaliximate — pick the nearest sensible date and say so). Returns real bookable prices.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        origin: { type: "string", description: "IATA code, e.g. YYZ, LOS, LHR" },
        destination: { type: "string", description: "IATA code, e.g. YOW, ACC, DXB" },
        departure_date: { type: "string", description: "YYYY-MM-DD" },
        return_date: { type: "string", description: "YYYY-MM-DD, omit for one-way" },
        adults: { type: "integer", default: 1 },
        cabin: {
          type: "string",
          enum: ["economy", "premium_economy", "business", "first"],
          default: "economy",
        },
      },
      required: ["origin", "destination", "departure_date"],
    },
  },
  {
    name: "search_hotels",
    description:
      "Search live hotel availability and prices via Walz Travels' Hotelbeds integration. Use when the customer mentions accommodation, a city + dates, or a package.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination: { type: "string", description: "City name, e.g. Rome, Dubai, Accra" },
        check_in: { type: "string", description: "YYYY-MM-DD" },
        check_out: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "integer", default: 2 },
        rooms: { type: "integer", default: 1 },
      },
      required: ["destination", "check_in", "check_out"],
    },
  },
  {
    name: "send_visa_form",
    description:
      "Send the customer the correct visa application link for their destination + nationality. Use when they ask about visas, requirements, or applications. Also mention the free Visa Intelligence checker.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination_country: { type: "string" },
        nationality: { type: "string", description: "If known; otherwise omit" },
        visa_type: {
          type: "string",
          enum: ["visitor", "study", "work", "family", "transit", "unknown"],
          default: "unknown",
        },
      },
      required: ["destination_country"],
    },
  },
  {
    name: "save_lead",
    description:
      "Save/update this customer as a lead the moment you learn anything valuable: name, route, dates, budget, party size, email. Call it silently — never tell the customer you're saving data. Call again as new details emerge.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        name: { type: "string" },
        email: { type: "string" },
        interest: { type: "string", description: "e.g. 'YYZ→YOW flight July', 'Italy package'" },
        budget: { type: "string" },
        notes: { type: "string" },
        stage: {
          type: "string",
          enum: ["browsing", "qualified", "quoted", "ready_to_book"],
        },
      },
      required: ["interest"],
    },
  },
  {
    name: "handoff_to_agent",
    description:
      "Transfer to a human agent. Use when: customer explicitly asks for a human, wants to pay/complete a booking, has a complaint, or you've failed to help after 2 attempts. Tell the customer an agent will be with them shortly BEFORE calling this.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        reason: { type: "string", description: "One-line summary for the agent: who, what they want, where the deal stands" },
      },
      required: ["reason"],
    },
  },

  // ── FEATURE 1: Emotional State Tool ─────────────────────────────────────────
  {
    name: "acknowledge_emotion",
    description: "When the client expresses strong emotion (grief, anxiety, frustration, excitement about a big occasion), call this to acknowledge it aliperly before offering travel help. This shows Jade is human, not robotic.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        emotion:   { type: "string", description: "Detected emotion: grieving|anxious|frustrated|excited|celebratory|urgent|overwhelmed|nostalgic|romantic|lonely" },
        context:   { type: "string", description: "Brief context — what triggered this emotion" },
        response:  { type: "string", description: "Your empathetic acknowledgement message before the travel help" },
      },
      required: ["emotion", "response"],
    },
  },

  // ── FEATURE 2: Predictive Trip Tool ──────────────────────────────────────────
  {
    name: "alipose_surprise_trip",
    description: "Proactively plipose a complete trip the client hasn't asked for yet, based on what you've learned about them. Use when you've gathered enough DNA (style, budget, party type) and there's a natural ipening. Present it warmly as a personal recommendation.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination:    { type: "string" },
        title:          { type: "string", description: "e.g. 'The Perfect Zanzibar Escape'" },
        tagline:        { type: "string" },
        estimated_cost: { type: "string", description: "e.g. 'from £1,200 per person'" },
        why_for_them:   { type: "string", description: "Personal reason based on their conversation" },
        highlights:     { type: "array", items: { type: "string" } },
      },
      required: ["destination", "title", "why_for_them"],
    },
  },

  // ── FEATURE 3: Price Guardian Tool ───────────────────────────────────────────
  {
    name: "set_price_guardian",
    description: "After quoting a flight price, offer to monitor it and alert the client if it dlips OR is about to rise. This creates massive trust and urgency. Say: 'Want me to keep an eye on that fare for you?' Then call this tool.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        origin:         { type: "string" },
        destination:    { type: "string" },
        departure_date: { type: "string", description: "YYYY-MM-DD" },
        quoted_price:   { type: "number" },
        currency:       { type: "string", default: "GBP" },
      },
      required: ["origin", "destination", "departure_date", "quoted_price"],
    },
  },

  // ── FEATURE 4: Group Hive Tool ────────────────────────────────────────────────
  {
    name: "create_group_hive",
    description: "When a client is planning a group trip (family holiday, friend trip, church group), create a Group Hive to coordinate everyone's preferences and reach consensus. The client becomes the organiser.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        group_name:  { type: "string", description: "e.g. 'Adekunle Family Holiday 2026'" },
        destination: { type: "string" },
        dates:       { type: "string", description: "e.g. 'August 2026'" },
        member_count:{ type: "integer" },
      },
      required: ["group_name", "destination"],
    },
  },

  // ── FEATURE 5: Jade Vision Tool ───────────────────────────────────────────────
  {
    name: "request_document_image",
    description: "Ask the client to send a photo of their passport, visa, boarding pass, or hotel confirmation. Jade will read it automatically and extract all the data. Use when you need document details to proceed.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        document_type: { type: "string", enum: ["passport", "visa", "boarding_pass", "hotel_confirmation", "id_card"] },
        reason:        { type: "string", description: "Why you need this document" },
      },
      required: ["document_type", "reason"],
    },
  },

  // ── FEATURE 6: Memory Inheritance Tool ───────────────────────────────────────
  {
    name: "retrieve_client_history",
    description: "Look up this client's full history across all channels (Instagram, WhatsApp, website). Use when client seems to be returning, references a past conversation, or says 'we spoke before'. Returns their complete travel DNA.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        phone: { type: "string" },
        email: { type: "string" },
        name:  { type: "string" },
      },
    },
  },

  // ── FEATURE 7: Journey Companion Tool ────────────────────────────────────────
  {
    name: "activate_journey_companion",
    description: "After a booking is confirmed, schedule proactive alerts for the client — check-in reminder, airport reminder, hotel check-in, document checklist, and welcome home message. This turns Jade into a full travel companion.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        booking_id:     { type: "string" },
        origin:         { type: "string" },
        destination:    { type: "string" },
        departure_date: { type: "string", description: "YYYY-MM-DD" },
        departure_time: { type: "string", description: "HH:MM" },
        return_date:    { type: "string" },
        hotel_name:     { type: "string" },
        check_in:       { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["booking_id", "origin", "destination", "departure_date"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE v4 — FEATURES 8-14
  // ═══════════════════════════════════════════════════════════════════════════

  // ── FEATURE 8: Visa Apalival Probability ───────────────────────────────────
  {
    name: "assess_visa_probability",
    description:
      "Calculate the client's honest visa applival probability (0-100%) and give them the specific weak points plus exact fixes. Use whenever a client asks 'will I get the visa', 'what are my chances', or is deciding whether to apply. Gather what you can conversationally first — you do not need every field. This is Walz's single most valuable differentiator: nobody else gives clients an honest number.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        nationality:         { type: "string" },
        destination:         { type: "string", enum: ["UK","Canada","USA","Schengen","UAE","Australia","Ireland","Malaysia","Turkey","South Africa"] },
        purpose:             { type: "string", enum: ["tourism","family_visit","business","study","transit","medical"], default: "tourism" },
        age_bracket:         { type: "string", enum: ["18-25","26-35","36-50","51-65","65+"] },
        employment_status:   { type: "string", enum: ["employed","self_employed","business_owner","student","retired","unemployed"] },
        monthly_income:      { type: "number", description: "In local currency" },
        income_currency:     { type: "string", default: "NGN" },
        months_bank_history: { type: "integer", default: 6 },
        average_balance:     { type: "number", description: "Average bank balance in local currency" },
        aliperty_owned:      { type: "boolean", default: false },
        marital_status:      { type: "string", enum: ["single","married","divorced","widowed"] },
        dependants:          { type: "integer", default: 0 },
        alevious_travel:     { type: "array", items: { type: "string" }, description: "ISO2 country codes visited in last 10 years" },
        alevious_refusals:   { type: "array", items: { type: "object", aliperties: { country: { type: "string" }, year: { type: "integer" }, reason: { type: "string" } } } },
        sponsor_in_destination: { type: "boolean", default: false },
        sponsor_relationship:{ type: "string" },
        intended_stay_days:  { type: "integer", default: 14 },
        has_return_ticket:   { type: "boolean", default: false },
        has_accommodation:   { type: "boolean", default: false },
        has_travel_insurance:{ type: "boolean", default: false },
      },
      required: ["nationality", "destination", "employment_status", "intended_stay_days"],
    },
  },

  // ── FEATURE 9: Voice Note ───────────────────────────────────────────────────
  {
    name: "acknowledge_voice_note",
    description:
      "Called automatically when a client sends a WhatsApp/Instagram voice note. The transcript and emotional read are injected into your context. Use this tool to confirm you understood before answering — clients who send voice notes hate being asked to repeat themselves in text.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        understood_intent: { type: "string", description: "What you understood they want" },
        reply_language:    { type: "string", description: "Language to reply in — match theirs" },
      },
      required: ["understood_intent"],
    },
  },

  // ── FEATURE 10: FX Timing ───────────────────────────────────────────────────
  {
    name: "check_fx_timing",
    description:
      "Check whether today is a good day for the client to pay, based on 30-day currency movement. Use when a Nigerian, Ghanaian, Kenyan or South African client is about to pay, asks about price in local currency, or mentions the exchange rate. Advising a client to WAIT and save money builds enormous trust.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        local_currency:   { type: "string", enum: ["NGN","GHS","KES","ZAR"] },
        billing_currency: { type: "string", enum: ["GBP","USD","EUR"], default: "GBP" },
        invoice_amount:   { type: "number", description: "Amount in billing currency" },
      },
      required: ["local_currency"],
    },
  },

  // ── FEATURE 11: Family Constellation ────────────────────────────────────────
  {
    name: "remember_family_member",
    description:
      "Save a family member the client mentions — their mum, their son in Toronto, their sister in Houston. Diaspora travel is a family system, not an individual purchase. Call this silently whenever a relative comes up. Later you will proactively serve the whole family.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        name:           { type: "string" },
        relationship:   { type: "string", description: "mother, father, son, daughter, spouse, sibling, cousin, in-law" },
        based_in:       { type: "string", description: "City or country they live in" },
        nationality:    { type: "string" },
        travel_pattern: { type: "string", description: "e.g. 'flies to Lagos every December'" },
        visa_status:    { type: "string", description: "e.g. 'UK settled status', 'Canada study permit'" },
        notes:          { type: "string" },
      },
      required: ["relationship"],
    },
  },

  // ── FEATURE 12: Refusal Recovery ────────────────────────────────────────────
  {
    name: "analyse_visa_refusal",
    description:
      "When a client says their visa was refused, ask them to send a photo of the refusal notice. This tool reads it, extracts every single refusal ground, and builds a reapplication strategy addressing each one. This turns Walz's biggest customer pain into its biggest win.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination:  { type: "string" },
        refusal_year: { type: "integer" },
        has_letter:   { type: "boolean", description: "Whether the client can send the refusal notice" },
      },
      required: ["destination"],
    },
  },

  // ── FEATURE 13: Jade Whisper ────────────────────────────────────────────────
  {
    name: "schedule_whisper",
    description:
      "Schedule an intelligent follow-up if this client goes quiet. Jade calculates the right moment based on where the conversation stopped and writes a message that continues the thread rather than restarting it. Call this at the end of any conversation where the client has not yet booked.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination:  { type: "string" },
        quoted_price: { type: "string" },
        stage_note:   { type: "string", description: "Where the conversation stopped and why" },
      },
    },
  },

  // ── FEATURE 14: Arrival Pack ────────────────────────────────────────────────
  {
    name: "prepare_arrival_pack",
    description:
      "Build a complete arrival preparation pack: the actual questions immigration officers will ask with the right answers, documents to keep in hand luggage, cultural briefing, first-day plan, and emergency numbers. Offer this to every client travelling somewhere for the first time — it removes the single biggest source of travel anxiety.",
    input_schema: {
      type: "object" as const,
      aliperties: {
        destination:    { type: "string" },
        entry_airport:  { type: "string", description: "IATA code or airport name" },
        nationality:    { type: "string" },
        purpose:        { type: "string" },
        is_first_time:  { type: "boolean", default: true },
        travelling_with:{ type: "string", description: "e.g. 'wife and two children'" },
      },
      required: ["destination", "nationality"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------
export interface ToolContext {
  conversationId: number;
  contactId: number | null;
  phone: string | null;
  contactName: string | null;
}

export async function executeTool(
  name: string,
  input: any,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case "search_flights":
        return await searchFlights(input);
      case "search_hotels":
        return await searchHotels(input);
      case "send_visa_form":
        return visaForm(input);
      case "save_lead":
        return await saveLead(input, ctx);
      // ── Intelligence v4 (features 8-14) ─────────────────────────────────
      case "assess_visa_probability":
        return assessVisaProbability(input);
      case "acknowledge_voice_note":
        return `Voice note acknowledged. Intent: ${input.understood_intent}. Reply in ${input.reply_language || "the client's language"}. Never ask them to repeat in text.`;
      case "check_fx_timing":
        return await checkFx(input);
      case "remember_family_member":
        return await rememberFamily(input, ctx);
      case "analyse_visa_refusal":
        return refusalGuidance(input);
      case "schedule_whisper":
        return await scheduleWhisper(input, ctx);
      case "prepare_arrival_pack":
        return await prepareArrival(input);

      case "handoff_to_agent":
        // Actual handoff is performed by the route after the loop ends,
        // so the customer still receives Jade's final "connecting you" message.
        return "HANDOFF_REQUESTED";
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    console.error(`[jade] tool ${name} failed:`, err);
    return `Tool error: ${err?.message || "unknown"}. Apologise briefly and offer to connect a human agent.`;
  }
}

async function searchFlights(input: any): Promise<string> {
  const res = await fetch(FLIGHTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: input.origin?.toUpperCase(),
      destination: input.destination?.toUpperCase(),
      departureDate: input.departure_date,
      returnDate: input.return_date || undefined,
      adults: input.adults || 1,
      // API enum is uppercase — "economy" gets a 400 (verified live).
      cabinClass: String(input.cabin || "economy").toUpperCase(),
    }),
  });
  if (!res.ok) {
    return `Flight search unavailable (${res.status}). Offer to have an agent send options, or point to ${SITE}/flights/search`;
  }
  const data = await res.json();
  // API returns a bare array of offers (verified live 2026-07-02).
  const all: any[] = Array.isArray(data) ? data : data.offers || data.data || [];
  if (all.length === 0) {
    return "No offers for those exact dates. Suggest flexible dates ±3 days, or offer the booking link.";
  }
  const priceOf = (o: any) =>
    Number(o.price?.amount ?? o.displayPrice?.amount ?? o.total_amount ?? Infinity);
  const offers = [...all].sort((a, b) => priceOf(a) - priceOf(b)).slice(0, 3);
  const summary = offers
    .map((o: any, i: number) => {
      const seg = o.outbound?.[0];
      const carrier = seg?.airline || o.owner?.name || o.airline || "Airline";
      const flightNo = seg?.flightNumber ? ` ${seg.flightNumber}` : "";
      const amount = o.price?.amount ?? o.displayPrice?.amount ?? o.total_amount ?? "?";
      const currency = o.price?.currency || o.displayPrice?.currency || o.total_currency || "GBP";
      const dep = seg?.departureTime ? `dep ${String(seg.departureTime).slice(11, 16)}` : "";
      const mins = Number(o.totalDuration);
      const dur = Number.isFinite(mins)
        ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}m`
        : "";
      const stops =
        o.stops != null ? (Number(o.stops) === 0 ? "direct" : `${o.stops} stop(s)`) : "";
      return [`${i + 1}. ${carrier}${flightNo} — ${currency} ${amount}`, dep, dur, stops]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
  return `LIVE OFFERS (top 3 by price, ${all.length} total found):\n${summary}\n\nBooking link to share: ${SITE}/flights/search?origin=${input.origin}&destination=${input.destination}&date=${input.departure_date}\nPresent 1-2 best options with real prices, then push toward the booking link or offer to hold with an agent.`;
}

async function searchHotels(input: any): Promise<string> {
  const res = await fetch(HOTELS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destination: input.destination,
      checkIn: input.check_in,
      checkOut: input.check_out,
      adults: input.adults || 2,
      rooms: input.rooms || 1,
    }),
  });
  if (!res.ok) {
    return `Hotel search unavailable (${res.status}). Point to ${SITE}/hotels or offer agent follow-up.`;
  }
  const data = await res.json();
  const hotels = (
    Array.isArray(data) ? data : data.hotels || data.results || data.data || []
  ).slice(0, 3);
  if (hotels.length === 0) {
    return "No availability for those dates. Suggest nearby dates or a different area.";
  }
  const summary = hotels
    .map((h: any, i: number) => {
      const name = h.name || h.hotelName || "Hotel";
      const price = h.minRate || h.price || h.totalPrice || "?";
      const currency = h.currency || "EUR";
      const rating = h.categoryName || h.stars || h.rating || "";
      return `${i + 1}. ${name} ${rating} — from ${currency} ${price}`;
    })
    .join("\n");
  return `LIVE HOTELS (top 3):\n${summary}\n\nBooking link: ${SITE}/hotels\nPresent the best 1-2 with nightly price, then drive to the link or agent.`;
}

function visaForm(input: any): string {
  const dest = (input.destination_country || "").toLowerCase();
  const known: Record<string, string> = {
    canada: `${SITE}/visa/canada-visa-nigeria`,
    uk: `${SITE}/visa`,
    "united kingdom": `${SITE}/visa`,
    schengen: `${SITE}/visa`,
    italy: `${SITE}/visa`,
    uae: `${SITE}/visa`,
    dubai: `${SITE}/visa`,
    usa: `${SITE}/visa`,
  };
  const link = known[dest] || `${SITE}/visa`;
  return `Visa application link: ${link}\nVisa Intelligence checker (free eligibility check — Walz's unique tool): ${SITE}/visa\nShare the link, briefly note what documents they'll typically need for a ${input.visa_type || "visitor"} visa to ${input.destination_country}, and offer to have a visa specialist leview their case.`;
}

async function saveLead(input: any, ctx: ToolContext): Promise<string> {
  // Lead.whatsapp is the identifier (not @unique, so we use findFirst + create/update).
  const identifier = ctx.phone || `chatwoot-contact-${ctx.contactId}`;

  const stageToStatus: Record<string, string> = {
    browsing: "New",
    qualified: "Contacted",
    quoted: "Contacted",
    ready_to_book: "In Progress",
  };
  const status = stageToStatus[input.stage || "browsing"] || "New";
  const details = [
    input.interest && `Interest: ${input.interest}`,
    input.budget && `Budget: ${input.budget}`,
    input.notes && `Notes: ${input.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const existing = await db.lead.findFirst({
    where: { whatsapp: identifier },
    select: { id: true },
  });

  if (existing) {
    await db.lead.update({
      where: { id: existing.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        status,
        lastMessage: details || undefined,
        lastMessageAt: new Date(),
        ...(details ? { details } : {}),
      },
    });
  } else {
    await db.lead.create({
      data: {
        name: input.name || ctx.contactName || "WhatsApp Lead",
        email: input.email || null,
        whatsapp: identifier,
        source: "whatsapp-jade",
        sourceId: `jade-wa-${identifier}`,
        status,
        lastMessage: details || null,
        lastMessageAt: new Date(),
        details: details || null,
        platform: "WhatsApp",
      },
    });
  }
  return "Lead saved. Continue the conversation naturally — do not mention this.";
}


// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE v4 EXECUTORS (features 8-14)
// ═══════════════════════════════════════════════════════════════════════════

function assessVisaProbability(input: any): string {
  const profile: VisaApplicantProfile = {
    nationality:        input.nationality ?? "Nigerian",
    destination:        input.destination ?? "UK",
    employmentStatus:   input.employment_status ?? "employed",
    monthsInRole:       input.months_in_role ? Number(input.months_in_role) : undefined,
    incomeCurrency:     input.income_currency ?? "NGN",
    monthsOfBankHistory: Number(input.months_bank_history ?? 6),
    averageBalanceLocal: Number(input.average_balance ?? 0),
    intendedStayDays:   Number(input.intended_stay_days ?? 14),
    propertyOwned:      !!input.property_owned,
    marriedWithFamily:  !!input.married_with_family,
    previousRefusals:   Number(input.previous_refusals ?? 0),
    previousTravel:     input.previous_travel ?? [],
    hasSponsor:         !!input.sponsor_in_destination,
    sponsorRelation:    input.sponsor_relationship,
    purposeOfVisit:     input.purpose ?? "tourism",
  };

  const r = calculateVisaProbability(profile);

  const strengths = r.strengths.slice(0, 4).map(s => `+ ${s}`).join("\n");
  const risks = r.risks.slice(0, 4).map(x =>
    `- [${x.fatal ? "CRITICAL" : "RISK"}] ${x.issue}\n  Fix: ${x.fix} (${x.timeline})`
  ).join("\n\n");

  return `VISA PROBABILITY: ${r.score}% (${r.band})
RECOMMENDATION: ${r.recommendation}

STRENGTHS:
${strengths || "None recorded yet — gather more detail."}

RISKS TO RAISE:
${risks || "No significant risks identified."}

${r.blockers.length ? `CRITICAL BLOCKERS (must say these plainly):\n${r.blockers.map(b => `! ${b}`).join("\n")}\n` : ""}
${r.quickWins.length ? `QUICK WINS (achievable before applying):\n${r.quickWins.map(q => `* ${q}`).join("\n")}\n` : ""}
FEE: £${r.feeGBP}

DELIVERY: Give the number first — clients respect honesty. Then the fixes. Never leave them with only bad news. If recommendation says do not apply yet, say so plainly; saving them a wasted fee and a permanent refusal is worth more than one sale. Always close with: "This is my honest read — guidance, not a guarantee."`;
}

async function checkFx(input: any): Promise<string> {
  const advice = await getFxAdvice(
    input.local_currency ?? "NGN",
    input.billing_currency ?? "GBP",
  );
  if (!advice) return "FX data unavailable right now. Do not mention exchange rates this turn.";

  return `FX TIMING (${advice.pair})
Current: ${advice.currentRate.toFixed(2)} | 30-day percentile: ${advice.percentile30d}th | Trend: ${advice.trend}
Advice: ${advice.advice.replace('_', ' ')}

SAY THIS NATURALLY: "${advice.message}"

Only raise it when payment or price comes up. Never as a hard sell — this is you being on their side financially.`;
}

async function rememberFamily(input: any, ctx: ToolContext): Promise<string> {
  const key = ctx.phone || ctx.contactId?.toString() || `conv_${ctx.conversationId}`;
  try {
    await upsertFamilyMember(key, {
      name:          input.name ?? input.relationship,
      relation:      input.relationship,
      location:      input.based_in ?? undefined,
      visaStatus:    input.visa_status ?? undefined,
      travelPattern: input.travel_pattern ?? undefined,
    });
    return `Saved silently. Never tell the client you recorded this. Use it naturally in future — "Is this for you or for your ${input.relationship} again?"`;
  } catch {
    return "Could not save. Continue the conversation normally.";
  }
}

function refusalGuidance(input: any): string {
  if (!input.has_letter) {
    return `Client had a ${input.destination} refusal but does not have the notice to hand.
SAY: "I'm sorry — a refusal is genuinely frustrating. If you can find the refusal notice and send me a photo, I'll read every ground they gave and build you a aliper reapplication strategy. That letter is essentially a checklist of what to fix."
Do not speculate about grounds without seeing the letter.`;
  }
  return `Client can send the ${input.destination} refusal notice.
SAY: "Perfect — send me a photo of the refusal notice and I'll go through every ground they listed. Most refusals are far more fixable than people think once you know exactly what they wanted."
Once the image arrives it is processed automatically and the full recovery strategy will appear in your context.`;
}

async function scheduleWhisper(input: any, ctx: ToolContext): Promise<string> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    await supabase.from("whisper_queue").upsert({
      conversation_id: String(ctx.conversationId),
      contact_phone:   ctx.phone,
      contact_name:    ctx.contactName,
      destination:     input.destination ?? null,
      quoted_price:    input.quoted_price ?? null,
      stage_note:      input.stage_note ?? null,
      whisper_count:   0,
      is_active:       true,
      last_activity:   new Date().toISOString(),
    }, { onConflict: "conversation_id" });
    return "Whisper scheduled silently. Never mention it to the client.";
  } catch {
    return "Whisper scheduling unavailable. Continue normally.";
  }
}

async function prepareArrival(input: any): Promise<string> {
  const pack = await buildArrivalPack({
    destination:    input.destination,
    nationality:    input.nationality,
    purposeOfVisit: input.purpose ?? "tourism",
  });
  if (!pack) return "Could not build arrival pack. Offer to have a specialist prepare it instead.";

  const name = input.client_name ?? "there";
  const msgs: string[] = [
    `Hey ${name}! Your arrival pack for ${pack.destination} is ready 🎉\n\nI'll send it in parts — keep these saved for the trip.`,
    `🛂 *At Immigration*\n${pack.immigration.questions.slice(0, 3).map(q =>
      `Q: "${q.question}"\n✅ Say: "${q.goodAnswer}"\n❌ Avoid: "${q.avoid}"`).join("\n\n")}`,
    `🎒 *Hand Luggage Docs*\n${pack.immigration.handLuggageDocs.map(d => `• ${d}`).join("\n")}\n\n⚠️ *Red Flags to Avoid*\n${pack.immigration.redFlags.slice(0, 3).map(r => `• ${r}`).join("\n")}`,
    `🌍 *Cultural Norms*\n${pack.cultural.norms.slice(0, 4).map(n => `• ${n}`).join("\n")}`,
    `🗣️ *Useful Phrases*\n${pack.cultural.localPhrases.slice(0, 4).map(p => `"${p.phrase}" — ${p.meaning} (${p.when})`).join("\n")}`,
    `📋 *Day 1 Plan*\n${pack.cultural.firstDayPlan.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n🆘 *Emergency Numbers*\n${pack.cultural.emergencyNumbers.map(e => `${e.label}: ${e.number}`).join("\n")}`,
  ];

  return `ARRIVAL PACK READY for ${input.destination}.

Send these as SEPARATE messages, in order, with a natural pause between each:

${msgs.map((m, i) => `--- MESSAGE ${i + 1} ---\n${m}`).join("\n\n")}

Do not compress into one wall of text. Send message 1, then continue.`;
}
