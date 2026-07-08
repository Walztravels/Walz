// lib/jade/tools.ts
// Jade 2.1 agentic tools — real capability: search flights, quote hotels,
// send visa forms, capture leads, hand off to humans.

import db from "@/lib/db"; // Prisma client (default export)

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
      "Search live flight offers via Walz Travels' Duffel integration. Use whenever the customer gives origin, destination and a date (even approximate — pick the nearest sensible date and say so). Returns real bookable prices.",
    input_schema: {
      type: "object" as const,
      properties: {
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
      properties: {
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
      properties: {
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
      properties: {
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
      properties: {
        reason: { type: "string", description: "One-line summary for the agent: who, what they want, where the deal stands" },
      },
      required: ["reason"],
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
  return `Visa application link: ${link}\nVisa Intelligence checker (free eligibility check — Walz's unique tool): ${SITE}/visa\nShare the link, briefly note what documents they'll typically need for a ${input.visa_type || "visitor"} visa to ${input.destination_country}, and offer to have a visa specialist review their case.`;
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
