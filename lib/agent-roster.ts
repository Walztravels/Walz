export interface Agent {
  id:               string
  name:             string
  email:            string
  chatwootId:       number
  role:             string
  specialisms:      string[]
  active:           boolean
  maxConversations: number
}

export const AGENTS: Agent[] = [
  {
    id:               'glory',
    name:             'Glory',
    email:            'reservations@walztravels.com',
    chatwootId:       3,
    role:             'senior_manager',
    specialisms: [
      'visa', 'passport', 'application',
      'uk visitor', 'schengen', 'canada',
      'documents', 'embassy', 'immigration',
      'biometric', 'residence permit',
    ],
    active:           true,
    maxConversations: 15,
  },
  {
    id:               'micheal',
    name:             'Micheal',
    email:            'admin@walztravels.com',
    chatwootId:       1,
    role:             'super_admin',
    specialisms: [
      'flight', 'book', 'fly', 'ticket',
      'airline', 'pnr', 'return',
      'one way', 'business class', 'economy',
      'first class', 'departure', 'arrival',
    ],
    active:           true,
    maxConversations: 20,
  },
  {
    id:               'anita',
    name:             'Anita',
    email:            'visa@walztravels.com',
    chatwootId:       4,
    role:             'coordinator',
    specialisms: [
      'hotel', 'tour', 'package',
      'transfer', 'whatsapp',
      'general', 'help', 'accommodation',
      'cruise', 'holiday', 'vacation',
    ],
    active:           true,
    maxConversations: 15,
  },
]

// ── Runtime-mutable state (in-process only — resets on cold start, fine for our load) ──
const _agentStatus = new Map<string, boolean>(
  AGENTS.map((a) => [a.id, a.active]),
)
let _roundRobinIndex = 0

export function isAgentActive(id: string): boolean {
  return _agentStatus.get(id) ?? false
}

export function setAgentActive(id: string, active: boolean): void {
  _agentStatus.set(id, active)
}

export function getActiveAgents(): Agent[] {
  return AGENTS.filter((a) => isAgentActive(a.id))
}

export function getRoundRobinIndex(): number {
  return _roundRobinIndex
}

export function getNextRoundRobin(): Agent {
  const active = getActiveAgents()
  if (active.length === 0) return AGENTS[0]
  const agent = active[_roundRobinIndex % active.length]
  _roundRobinIndex++
  return agent
}

export function getAgentBySpecialism(message: string): Agent | null {
  const lower = message.toLowerCase()
  for (const agent of AGENTS) {
    if (!isAgentActive(agent.id)) continue
    if (agent.specialisms.some((s) => lower.includes(s))) return agent
  }
  return null
}

export function getAgentById(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id)
}
