/**
 * Automatic-assignment eligibility (assignment-integrity P1, 2026-09-18).
 *
 * Explicit non-routable identity rule: certain Chatwoot agent ids must
 * NEVER receive automatic conversation assignments, regardless of any
 * RoutingAgent flag state — the escalation path ignored active=false and
 * assigned live conversations to the owner's TEST identity ("Michael" /
 * Walz Admin, agent id 1; conversation #483, cron 2026-09-18 08:00Z).
 *
 * Defaults are ALWAYS excluded (id 1 = Chatwoot admin/token owner/test
 * identity, id 5 = Jade bot); CHATWOOT_NON_ROUTABLE_AGENT_IDS (csv)
 * EXTENDS the set — it can never re-enable a default.
 *
 * Scope: AUTOMATIC assignment only (router pools, escalation, cron).
 * Deliberate manual assignment by authorized staff through the admin
 * assign endpoint is intentionally NOT gated here.
 *
 * The fuller approved eligibility architecture (RoutingAgent.routingEnabled
 * + active-Staff conjunction) is a separate, later release; this module is
 * the smallest safe stop-the-bleed rule.
 */

const DEFAULT_NON_ROUTABLE = [1, 5]

function envNonRoutable(): number[] {
  return (process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS ?? '')
    .split(',')
    .map(s => Number.parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0)
}

export function nonRoutableAgentIds(): Set<number> {
  return new Set([...DEFAULT_NON_ROUTABLE, ...envNonRoutable()])
}

/** May this Chatwoot agent id receive an AUTOMATIC assignment? */
export function isAutoAssignable(chatwootAgentId: number | null | undefined): boolean {
  if (chatwootAgentId == null || !Number.isInteger(chatwootAgentId) || chatwootAgentId <= 0) return false
  return !nonRoutableAgentIds().has(chatwootAgentId)
}
