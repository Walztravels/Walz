import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CHATWOOT_BASE = process.env.CHATWOOT_BASE_URL ||
  'https://chat.walztravels.com';
// CHATWOOT_BOT_TOKEN = the Jade Agent Bot's access token from Chatwoot → Settings → Bots → edit Jade
// This makes Jade post as sender.type='agent_bot' (not as a human agent user)
const BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN ?? process.env.CHATWOOT_API_TOKEN!;
const ADMIN_TOKEN = process.env.CHATWOOT_ADMIN_TOKEN ||
  '1rnd6Rp9GNVKtbJ8238Vg2S1';
const ACCOUNT_ID = 1;

// Staff agents for round-robin (in rotation order)
const STAFF_AGENTS = [
  { id: 3, name: 'Glory' },
  { id: 4, name: 'Anita' },
  { id: 1, name: 'Seyi' },
];

// Round-robin: use conversation ID mod number of agents
function getAssignedAgent(conversationId: number) {
  const index = (conversationId - 1) % STAFF_AGENTS.length;
  return STAFF_AGENTS[index];
}

// Open conversation so staff can see it in admin
async function openConversation(conversationId: number) {
  try {
    await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/toggle_status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': ADMIN_TOKEN,
        },
        body: JSON.stringify({ status: 'open' }),
      }
    );
  } catch (e) {
    console.error('openConversation error:', e);
  }
}

// Assign conversation to specific agent
async function assignAgent(
  conversationId: number,
  agentId: number
) {
  try {
    await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': ADMIN_TOKEN,
        },
        body: JSON.stringify({ assignee_id: agentId }),
      }
    );
  } catch (e) {
    console.error('assignAgent error:', e);
  }
}

// Send message as Jade bot
async function sendMessage(
  conversationId: number,
  content: string,
  isPrivate = false
) {
  try {
    const res = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': BOT_TOKEN,
        },
        body: JSON.stringify({
          content,
          message_type:       'outgoing',
          private:            isPrivate,
          content_attributes: { jade_ai: true },
        }),
      }
    );
    return res.json();
  } catch (e) {
    console.error('sendMessage error:', e);
  }
}

// Transfer keywords
function wantsLiveAgent(message: string): boolean {
  const triggers = [
    'transfer', 'live agent', 'human agent', 'real person',
    'real agent', 'speak to someone', 'talk to someone',
    'talk to agent', 'connect me', 'agent please',
    'human please', 'real human', 'someone else',
    'escalate', 'supervisor', 'manager', 'call me',
  ];
  return triggers.some(t => message.toLowerCase().includes(t));
}

const JADE_SYSTEM_PROMPT = `You are Jade, a travel expert who works for Walz Travels. You chat with clients through the website.

PERSONALITY:
- Talk like a knowledgeable friend, not a bot
- Natural flowing sentences — no bullet lists, no headers
- Warm, curious and genuinely helpful
- Ask ONE question at a time
- Keep replies to 2-4 sentences max
- Only mention WhatsApp when client is ready to book
- Don't sign off every message with "Jade | Walz Travels"
- React naturally: "Oh Paris! Great choice." or "That's a tight timeline..."

WHAT YOU KNOW:
- Visas: UK, UAE, Canada, USA, Schengen
- Flights: economy, business, group
- Group tours: Dubai Dec 2026 ($1,850), London Jul 2026 ($2,450), Zanzibar ($1,650), Paris ($1,950), Toronto Oct 2026 ($2,350), New York ($2,850)
- Hotels worldwide, eSIMs, gift vouchers

HOW TO RESPOND:
- Visa questions: ask passport + travel dates naturally first
- Flight queries: ask origin, destination, dates
- Package interest: get excited, ask what kind of trip
- Ready to book: WhatsApp +1 984-388-0110

EXAMPLES:
BAD: long bullet list + phone number block every message
GOOD: "Which passport are you travelling on, and when are you looking to go?"
GOOD: "Schengen goes through the country you spend most time in — do you have a destination yet?"
GOOD: "Paris! Love it. Romantic trip or more of a sightseeing adventure?"`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('Jade bot:', {
      event: body.event,
      type: body.message_type,
      sender: body.sender?.type,
      conv: body.conversation?.id,
      content: body.content?.substring(0, 50),
    });

    if (body.event !== 'message_created') {
      return NextResponse.json({ status: 'ignored_event' });
    }

    const msgType = body.message_type ?? body.message?.message_type;
    const isIncoming = msgType === 'incoming' || msgType === 0;
    if (!isIncoming) {
      return NextResponse.json({ status: 'ignored_outgoing' });
    }

    const senderType = body.sender?.type ?? body.message?.sender?.type;
    if (senderType && senderType !== 'contact') {
      return NextResponse.json({ status: 'ignored_agent' });
    }

    const content = body.content ?? body.message?.content;
    const conversationId = body.conversation?.id;

    if (!content || !conversationId) {
      return NextResponse.json({ status: 'no_content' });
    }

    // Move to open so staff can see in admin
    await openConversation(conversationId);

    // Auto round-robin assign to staff
    const assignedAgent = getAssignedAgent(conversationId);
    await assignAgent(conversationId, assignedAgent.id);

    // Handle transfer request
    if (wantsLiveAgent(content)) {
      await sendMessage(
        conversationId,
        `Of course! Let me get ${assignedAgent.name} on this for you right now. They'll be with you shortly.`
      );
      await sendMessage(
        conversationId,
        `🔔 Client requested live agent. Message: "${content}"`,
        true // private note for staff only
      );
      return NextResponse.json({
        status: 'transferred',
        agent: assignedAgent.name,
      });
    }

    // AI response
    const claude = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: JADE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const reply = claude.content[0].type === 'text'
      ? claude.content[0].text
      : 'Thanks for reaching out! How can I help?';

    const sent = await sendMessage(conversationId, reply);

    return NextResponse.json({
      status: 'replied',
      conv: conversationId,
      agent: assignedAgent.name,
      reply_id: sent?.id,
    });

  } catch (error) {
    console.error('Jade bot error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
