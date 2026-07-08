// lib/jade/chatwoot-client.ts
// Chatwoot API client for Jade 2.0 (WhatsApp + all channels)
// Account 1 @ chat.walztravels.com

import { routeConversation, applyRouting } from "@/lib/conversation-router";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE_URL || "https://chat.walztravels.com";
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";
const API_TOKEN = process.env.CHATWOOT_API_TOKEN!; // agent-bot or admin user token

const api = (path: string) =>
  `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}${path}`;

const headers = {
  "Content-Type": "application/json",
  api_access_token: API_TOKEN,
};

export interface ChatwootMessage {
  id: number;
  content: string | null;
  message_type: 0 | 1 | 2 | 3; // 0=incoming, 1=outgoing, 2=activity, 3=template
  private: boolean;
  created_at: number;
  sender?: { name?: string; type?: string };
}

/**
 * Fetch conversation history (newest Chatwoot page = last ~20 msgs).
 * Returns oldest→newest, filtered to real dialogue only.
 * THIS is what kills the amnesia bug — every webhook rebuilds full context.
 */
export async function getConversationHistory(
  conversationId: number,
  limit = 30
): Promise<ChatwootMessage[]> {
  const res = await fetch(api(`/conversations/${conversationId}/messages`), {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[jade] history fetch failed ${res.status} conv=${conversationId}`);
    return [];
  }
  const data = await res.json();
  const messages: ChatwootMessage[] = data.payload || [];
  return messages
    .filter(
      (m) =>
        !m.private &&
        (m.message_type === 0 || m.message_type === 1) &&
        m.content &&
        m.content.trim().length > 0
    )
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-limit);
}

/** Send an outgoing reply into the conversation (relayed to WhatsApp by Chatwoot). */
export async function sendReply(conversationId: number, content: string) {
  // WhatsApp hard limit ~4096 chars; keep chunks conversational-sized.
  const chunks = splitMessage(content, 1500);
  for (const chunk of chunks) {
    const res = await fetch(api(`/conversations/${conversationId}/messages`), {
      method: "POST",
      headers,
      body: JSON.stringify({ content: chunk, message_type: "outgoing" }),
    });
    if (!res.ok) {
      console.error(
        `[jade] sendReply failed ${res.status} conv=${conversationId}: ${await res.text()}`
      );
    }
  }
  // Mark as read so the conversation doesn't sit as "unread" in agents' inbox
  // after Jade handles it. Chatwoot still shows it in the pending queue, but
  // agents won't see a red unread badge on top of Jade's reply.
  await markAsRead(conversationId).catch(() => {});
}

/**
 * Mark all messages in a conversation as read.
 * Chatwoot endpoint: GET /conversations/{id}/read (yes, GET — it's a side-effect call).
 */
export async function markAsRead(conversationId: number) {
  await fetch(api(`/conversations/${conversationId}/read`), {
    method: "GET",
    headers,
  });
}

/**
 * Move a conversation status to "open" if it's currently pending.
 * Called when a human agent sends a reply so the conversation exits the bot queue.
 */
export async function openConversation(conversationId: number) {
  await fetch(api(`/conversations/${conversationId}/toggle_status`), {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "open" }),
  }).catch((e) => console.error("[jade] openConversation error:", e));
}

/**
 * Human handoff:
 *  1. Move conversation pending → open
 *  2. Round-robin assign to next available agent via conversation-router
 *  3. Drop a private note with reason + assigned agent (staff-only context)
 *
 * The private note is INTERNAL only (private:true) — customers never see it.
 * The customer-facing message is whatever Jade sent before calling the tool.
 */
export async function handoffToHuman(conversationId: number, reason: string) {
  // 1. Open the conversation so it enters the agent queue
  await fetch(api(`/conversations/${conversationId}/toggle_status`), {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "open" }),
  }).catch((e) => console.error("[jade] toggle_status error:", e));

  // 2. Route via round-robin — gets the next agent and calls Chatwoot assignment API
  let assignedAgentName = "the team";
  try {
    const dec = await routeConversation(
      String(conversationId),
      reason,
      "WhatsApp",
    );
    if (dec) {
      await applyRouting(String(conversationId), dec, reason, "WhatsApp");
      assignedAgentName = dec.agentName;
    }
  } catch (e) {
    // Assignment failure is non-fatal — private note still lands below
    console.error("[jade] routing/assignment error:", e);
  }

  // 3. Private note for staff context (🔒 never customer-facing)
  await fetch(api(`/conversations/${conversationId}/messages`), {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: `🤖→👤 Jade handoff → ${assignedAgentName}\nReason: ${reason}`,
      message_type: "outgoing",
      private: true,
    }),
  }).catch((e) => console.error("[jade] private-note error:", e));
}

/** Read conversation meta (status, contact, custom attributes). */
export async function getConversation(conversationId: number) {
  const res = await fetch(api(`/conversations/${conversationId}`), {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Persistent per-contact memory via Chatwoot contact custom attributes.
 * Survives across conversations — Jade "remembers" returning customers.
 */
export async function updateContactMemory(
  contactId: number,
  memory: Record<string, string | number | boolean>
) {
  await fetch(api(`/contacts/${contactId}`), {
    method: "PUT",
    headers,
    body: JSON.stringify({ custom_attributes: memory }),
  });
}

export async function getContact(contactId: number) {
  const res = await fetch(api(`/contacts/${contactId}`), {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.payload ?? data;
}

/**
 * Dedup / coalescing guard: if a NEWER incoming message already exists than
 * the one this webhook is processing, skip — the newer webhook will handle
 * the full context. Prevents double-replies when users send rapid messages.
 */
export async function isLatestIncoming(
  conversationId: number,
  messageId: number
): Promise<boolean> {
  const history = await getConversationHistory(conversationId, 30);
  const incoming = history.filter((m) => m.message_type === 0);
  if (incoming.length === 0) return true;
  const latest = incoming[incoming.length - 1];
  return latest.id === messageId;
}

function splitMessage(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < max * 0.5) cut = remaining.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = remaining.lastIndexOf(". ", max);
    if (cut < max * 0.5) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
