export interface CWAgent {
  id: number
  name: string
  email: string
  role: string
  availability_status: 'online' | 'offline' | 'busy'
  avatar_url?: string | null
}

export interface CWMessage {
  id: number
  content: string
  message_type: number // 0=incoming 1=outgoing 2=activity 3=template
  created_at: number
  private: boolean
  /** Chatwoot message metadata — jade_ai marks Jade-assisted outgoing messages (UX-2). */
  content_attributes?: { jade_ai?: boolean }
  sender?: {
    id: number
    name: string
    type: string
    avatar_url?: string | null
  }
  attachments?: Array<{
    id: number
    file_type: string
    data_url: string
    file_name?: string
  }>
}

export interface CWSender {
  id: number
  name: string
  type: string
  email?: string | null
  phone_number?: string | null
  avatar_url?: string | null
}

export interface CWConversation {
  id: number
  status: 'open' | 'resolved' | 'pending'
  created_at: number
  last_activity_at: number
  inbox_id: number
  channel?: string
  unread_count?: number
  assignee?: CWAgent | null
  meta: {
    sender: CWSender
    channel?: string
    assignee?: CWAgent | null
  }
  messages?: CWMessage[]
}

export interface AdminProfile {
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'agent'
  chatwootAgentId: number
  permissions: Record<string, boolean>
}

// email → chatwoot agent mapping (fallback; runtime auto-resolves from Chatwoot agents API)
export const EMAIL_TO_AGENT: Record<string, { id: number; role: AdminProfile['role'] }> = {
  'admin@walztravels.com':           { id: 1, role: 'super_admin' },
  'contact@walztravels.com':         { id: 1, role: 'super_admin' },
  'reservations@walztravels.com':    { id: 3, role: 'admin' },
  'visa@walztravels.com':            { id: 4, role: 'agent' },
  'priscilla.fsr@walztravels.com':   { id: 8, role: 'agent' },
}

export function timeAgo(ts: number): string {
  const now = Date.now()
  const t = ts > 1e12 ? ts : ts * 1000
  const diff = now - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function initials(name: string): string {
  return (name || '?').split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

export function channelIcon(conv: CWConversation): string {
  const ch = (conv.channel ?? conv.meta?.channel ?? '').toLowerCase()
  if (ch.includes('whatsapp')) return '📱'
  if (ch.includes('instagram')) return '📷'
  return '💬'
}

// UX-2 polish: human-readable channel word for the conversation header.
// Reads the SAME source as channelIcon (conv.channel ?? conv.meta?.channel).
const CHANNEL_LABELS: Record<string, string> = {
  'channel::whatsapp':     'WhatsApp',
  'channel::instagram':    'Instagram',
  'instagram':             'Instagram',
  'channel::facebookpage': 'Messenger',
  'channel::webwidget':    'Web',
  'channel::sms':          'SMS',
  'channel::twiliosms':    'WhatsApp',   // this deployment's WhatsApp inboxes ride Twilio (see whatsapp-chat route)
  'channel::email':        'Email',
  'channel::api':          'Chat',
}

export function channelLabel(conv: CWConversation): string {
  const raw = (conv.channel ?? conv.meta?.channel ?? '').trim()
  if (!raw) return 'Chat'
  const mapped = CHANNEL_LABELS[raw.toLowerCase()]
  if (mapped) return mapped
  // Unknown Chatwoot identifier: strip the 'Channel::' prefix, else 'Chat'.
  const stripped = raw.replace(/^channel::/i, '').trim()
  return stripped || 'Chat'
}
