// lib/portal/customer-actions.ts
// Release 6.2: Derives the deterministic "action required" list for the dashboard.
// Only creates items for things the customer can actually do — no speculative prompts.

export interface CustomerAction {
  id: string
  priority: 'urgent' | 'normal'
  label: string
  description: string
  href: string
}

export function deriveCustomerActions(opts: {
  applications: Array<{ id: string; stage: string; refNumber: string; title: string }>
  proposals: Array<{ id: string; referenceNumber: string; title: string; status: string }>
}): CustomerAction[] {
  const actions: CustomerAction[] = []

  for (const app of opts.applications) {
    if (app.stage === 'DOCUMENTS_PENDING') {
      actions.push({
        id:          `app-docs-${app.id}`,
        priority:    'urgent',
        label:       'Upload documents',
        description: `${app.title} (${app.refNumber}) is waiting for your documents`,
        href:        '/portal/documents',
      })
    }
  }

  for (const prop of opts.proposals) {
    if (prop.status === 'sent' || prop.status === 'viewed') {
      actions.push({
        id:          `proposal-${prop.id}`,
        priority:    'normal',
        label:       'Review your itinerary',
        description: `${prop.title} — your approval is needed`,
        href:        `/itinerary/${prop.referenceNumber}`,
      })
    }
  }

  // urgent before normal, preserving relative order within each group
  return [
    ...actions.filter(a => a.priority === 'urgent'),
    ...actions.filter(a => a.priority === 'normal'),
  ]
}
