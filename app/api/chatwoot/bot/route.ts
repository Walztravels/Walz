// app/api/chatwoot/bot/route.ts
// Jade 2.1 — agentic WhatsApp/omnichannel support bot (ack-first).
//
// Chatwoot AgentBot webhook → immediate 200 ACK → background: Claude (with tools) → reply via Chatwoot API.
//
// Fixes vs v2.0 (root-caused live, 2026-07-02, convs 61 & 62):
//   1. CHATWOOT 5s BOT TIMEOUT: Chatwoot gives agent-bot webhooks ~5 seconds
//      before declaring "error with the agent bot", flipping the conversation
//      to open and auto-assigning a human. Any tool-using turn (flight/hotel
//      search ≈ 8-15s) blew past it. Fix: ACK instantly, process with
//      waitUntil() in the background (Vercel keeps the function alive up to
//      maxDuration after the response is sent).
//   2. FLIGHT SEARCH: /api/search/flights requires UPPERCASE cabinClass and
//      returns a BARE ARRAY of offers. v2.0 sent "economy" (→ 400) and parsed
//      data.offers (→ always empty). Both fixed in lib/jade/tools.ts.
//   3. Skip reasons are now logged for diagnostics.
//
// Required env: ANTHROPIC_API_KEY, CHATWOOT_API_TOKEN,
//               CHATWOOT_BASE_URL (optional), NEXT_PUBLIC_BASE_URL

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import {
  getConversationHistory,
  sendReply,
  handoffToHuman,
  getConversation,
  updateContactMemory,
  isLatestIncoming,
  markAsRead,
} from "@/lib/jade/chatwoot-client";
import { JADE_TOOLS, executeTool, type ToolContext } from "@/lib/jade/tools";
import { buildSystemPrompt } from "@/lib/jade/prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // ---- 1. Filter: only respond to real incoming customer messages -------
  const event = payload.event;
  const messageType = payload.message_type;
  const isPrivate = payload.private === true;
  const conversation = payload.conversation;
  const conversationId: number | undefined = conversation?.id ?? payload.conversation_id;
  const messageId: number | undefined = payload.id;
  const content: string | undefined = payload.content;

  // Strip bare Instagram/Facebook ad attachment labels — they're not real customer messages
  const AD_LABEL_RE = /^(shared post|ad response|story reply|story mention|post reply|reel reply|reels reply|\[.*?\])$/i;

  // ---- Human staff replied — just mark as read to clear the unread badge ----
  // Do NOT call openConversation() here. Chatwoot auto-assigns conversations
  // via routing rules, so "assigned to a human" ≠ "human has taken over".
  // Only an actual human-sent message is the handover signal (checked inside
  // processTurn via conversation history). We just clear the unread badge.
  if (
    event === "message_created" &&
    messageType === "outgoing" &&
    !isPrivate &&
    conversationId &&
    payload.sender?.type !== "agent_bot"
  ) {
    waitUntil(
      markAsRead(conversationId).catch((e) =>
        console.error(`[jade] markAsRead conv=${conversationId}:`, e)
      )
    );
    return NextResponse.json({ ok: true, handled: "staff-reply-cleanup" });
  }

  if (
    event !== "message_created" ||
    messageType !== "incoming" ||
    isPrivate ||
    !conversationId ||
    !content?.trim() ||
    AD_LABEL_RE.test(content.trim())
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Only skip resolved conversations at this stage.
  // Auto-assignment by Chatwoot routing rules does NOT mean a human has taken
  // over — the real check (did a human actually send a message?) happens inside
  // processTurn after loading the conversation history.
  const status = conversation?.status;
  if (status === "resolved") {
    return NextResponse.json({ ok: true, skipped: "resolved" });
  }

  console.log(`[jade] incoming conv=${conversationId} msg=${messageId}: "${content.slice(0, 80)}"`);

  // ---- 2. ACK NOW, think later -------------------------------------------
  // Chatwoot gives agent-bot webhooks ~5s before timing out and handing off.
  // We return 200 immediately and do all the slow work in the background.
  waitUntil(
    processTurn(payload, conversationId, messageId, content).catch((err) => {
      console.error(`[jade] background fatal conv=${conversationId}:`, err);
    })
  );

  return NextResponse.json({ ok: true, accepted: true });
}

// ---------------------------------------------------------------------------
// Background turn processor
// ---------------------------------------------------------------------------
async function processTurn(
  payload: any,
  conversationId: number,
  messageId: number | undefined,
  content: string
) {
  const conversation = payload.conversation;

  try {
    // ---- 3. Coalesce rapid messages --------------------------------------
    if (messageId && !(await isLatestIncoming(conversationId, messageId))) {
      console.log(`[jade] conv=${conversationId} msg=${messageId} superseded, skipping`);
      return;
    }

    // ---- 4. Rebuild full context ------------------------------------------
    const [history, convDetail] = await Promise.all([
      getConversationHistory(conversationId, 30),
      getConversation(conversationId),
    ]);

    // Human takeover check.
    // We stamp every Jade reply with content_attributes.jade_ai=true in sendReply().
    // Any outgoing non-private message WITHOUT that marker was sent by a human agent.
    // This is more reliable than sender.type, which varies based on whether the API
    // token is a bot token or a user token.
    const outgoing = history.filter((m) => m.message_type === 1 && !m.private);
    // Diagnostic: log sender info so we can verify content_attributes are returned
    console.log(
      `[jade] conv=${conversationId} outgoing_msgs:`,
      JSON.stringify(outgoing.slice(-3).map((m) => ({
        id: m.id,
        senderType: m.sender?.type,
        senderName: m.sender?.name,
        jadeAi: m.content_attributes?.jade_ai,
      })))
    );
    const humanHasReplied = outgoing.some((m) => !m.content_attributes?.jade_ai);
    if (humanHasReplied) {
      console.log(`[jade] conv=${conversationId} deferring — human agent has replied`);
      return;
    }

    const contactId: number | null =
      convDetail?.meta?.sender?.id ?? payload.sender?.id ?? null;
    const contactName: string | null =
      convDetail?.meta?.sender?.name ?? payload.sender?.name ?? null;
    const phone: string | null =
      convDetail?.meta?.sender?.phone_number ?? payload.sender?.phone_number ?? null;
    const contactMemory: Record<string, any> | null =
      convDetail?.meta?.sender?.custom_attributes ?? null;

    const ch: string = conversation?.channel || "";
    const channel: string =
      ch.includes("Twilio") || ch.includes("Whatsapp")
        ? "WhatsApp"
        : ch.includes("Facebook") || ch.includes("Instagram")
        ? "Instagram DM"
        : ch.includes("WebWidget") || ch.includes("Web")
        ? "website chat"
        : "chat";

    // Chatwoot history → Anthropic messages (merge consecutive same-role turns).
    // Strip bare attachment/ad labels that arrive when customers reply to Instagram/Facebook ads
    // (e.g. "Shared post", "Ad response", "Story reply") — they carry no useful content and
    // caused Jade to say "I can't see the post."
    // IMPORTANT: we still TRACK whether an ad label was present so the system prompt can
    // tell Jade the conversation started from an Instagram/Facebook ad click.
    const AD_LABEL_RE = /^(shared post|ad response|story reply|story mention|post reply|reel reply|reels reply|\[.*?\])$/i;
    const messages: Anthropic.MessageParam[] = [];
    let isAdReferral = false;
    for (const m of history) {
      const raw = (m.content ?? "").trim();
      if (!raw) continue;
      if (AD_LABEL_RE.test(raw)) {
        isAdReferral = true; // conversation started from an Instagram/Facebook ad click
        continue;            // still skip adding this as a message to Claude
      }
      const role = m.message_type === 0 ? "user" : "assistant";
      const last = messages[messages.length - 1];
      if (last && last.role === role && typeof last.content === "string") {
        last.content = `${last.content}\n${raw}`;
      } else {
        messages.push({ role, content: raw });
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content });
    }

    const system = buildSystemPrompt({
      contactName,
      channel,
      memory: contactMemory,
      today: new Date().toISOString().slice(0, 10),
      isAdReferral,
    });

    const toolCtx: ToolContext = { conversationId, contactId, phone, contactName };

    // ---- 5. Agentic loop ---------------------------------------------------
    let handoffReason: string | null = null;
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: JADE_TOOLS as any,
        messages,
      });

      const textBlocks = response.content.filter((b) => b.type === "text");
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");

      finalText = textBlocks.map((b: any) => b.text).join("\n").trim();

      if (toolBlocks.length === 0 || response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolBlocks as any[]) {
        const result = await executeTool(block.name, block.input, toolCtx);
        if (result === "HANDOFF_REQUESTED") {
          handoffReason = block.input?.reason || "Customer requested human agent";
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    // ---- 6. Guard: re-check before replying (race: human replied while Jade was thinking)
    const latestHistory = await getConversationHistory(conversationId, 30);
    const humanRepliedSince = latestHistory.some(
      (m) => m.message_type === 1 && !m.private && !m.content_attributes?.jade_ai
    );
    if (humanRepliedSince) {
      console.log(`[jade] conv=${conversationId} aborting reply — human replied while processing`);
      return;
    }

    // ---- 7. Reply + side effects -------------------------------------------
    if (finalText) {
      await sendReply(conversationId, finalText);
    }

    if (handoffReason) {
      await handoffToHuman(conversationId, handoffReason);
      console.log(`[jade] conv=${conversationId} handed off: ${handoffReason}`);
    }

    if (contactId) {
      updateContactMemory(contactId, {

        last_jade_contact: new Date().toISOString(),
        last_topic: content.slice(0, 120),
      }).catch(() => {});
    }

    console.log(
      `[jade] conv=${conversationId} done replied=${Boolean(finalText)} handoff=${Boolean(handoffReason)}`
    );
  } catch (err: any) {
    console.error(`[jade] fatal conv=${conversationId}:`, err);
    try {
      await sendReply(
        conversationId,
        "Sorry, I hit a small glitch on my end 🙈 One of our team will jump in shortly — or just send your message again!"
      );
      await handoffToHuman(conversationId, `Jade error: ${err?.message || "unknown"}`);
    } catch {}
  }
}
