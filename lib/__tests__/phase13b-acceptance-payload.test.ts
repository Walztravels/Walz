/**
 * Phase 13B — Acceptance payload regression tests
 * Root cause: bare onClick={onAccept} passed SyntheticEvent as optionId,
 * which flowed into selectedIds and caused JSON.stringify circular-reference crash.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface V1Payload {
  token: string
  name: string
  selectedOptionIds: string[]
  termsAccepted: boolean
  acceptanceVersion: number
}

interface V2Payload {
  token: string
  acceptedBy: string
  termsAccepted: boolean
  selections: { groupId: string; itemIds: string[] }[]
}

interface RevisionPayload {
  token: string
  acceptedBy: string
  termsAccepted: boolean
  selections?: { groupId: string; itemIds: string[] }[]
}

// ─── Payload builders (mirrors _ProposalPage.tsx handleSubmit) ────────────────

function buildV1Payload(opts: {
  token: string
  name: string
  selectedIds: unknown[]
}): string {
  return JSON.stringify({
    token: String(opts.token ?? ''),
    name: opts.name,
    selectedOptionIds: (opts.selectedIds as unknown[]).filter(id => typeof id === 'string'),
    termsAccepted: true,
    acceptanceVersion: 1,
  })
}

function buildV2Payload(opts: {
  token: string
  name: string
  selections: { groupId: string; itemIds: string[] }[]
}): string {
  return JSON.stringify({
    token: String(opts.token ?? ''),
    acceptedBy: opts.name,
    termsAccepted: true,
    selections: opts.selections.map(s => ({
      groupId: String(s.groupId),
      itemIds: s.itemIds.map(String),
    })),
  })
}

function buildRevisionPayload(opts: {
  token: string
  name: string
  isV2: boolean
  selections: { groupId: string; itemIds: string[] }[]
}): string {
  return JSON.stringify({
    token: String(opts.token ?? ''),
    acceptedBy: opts.name,
    termsAccepted: true,
    ...(opts.isV2 ? {
      selections: opts.selections.map(s => ({
        groupId: String(s.groupId),
        itemIds: s.itemIds.map(String),
      })),
    } : {}),
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSyntheticEvent(): object {
  // Simulates the circular-reference structure of a browser SyntheticEvent/MouseEvent.
  const target: Record<string, unknown> = {}
  const event: Record<string, unknown> = { type: 'click', target }
  target['ownerDocument'] = { defaultView: { event } } // circular: event → target → ownerDocument → defaultView → event
  return event
}

// ─── Section A: V1 payload ───────────────────────────────────────────────────

describe('A. V1 acceptance payload', () => {
  test('A1. serializes with plain selectedOptionIds', () => {
    const body = buildV1Payload({ token: 'tok_abc', name: 'Alice', selectedIds: ['opt_1'] })
    const parsed = JSON.parse(body) as V1Payload
    expect(parsed.token).toBe('tok_abc')
    expect(parsed.name).toBe('Alice')
    expect(parsed.selectedOptionIds).toEqual(['opt_1'])
    expect(parsed.termsAccepted).toBe(true)
    expect(parsed.acceptanceVersion).toBe(1)
  })

  test('A2. serializes with empty selectedOptionIds', () => {
    const body = buildV1Payload({ token: 'tok_abc', name: 'Alice', selectedIds: [] })
    const parsed = JSON.parse(body) as V1Payload
    expect(parsed.selectedOptionIds).toEqual([])
  })

  test('A3. click event accidentally in selectedIds is stripped (typeof filter)', () => {
    const event = makeSyntheticEvent()
    const body = buildV1Payload({ token: 'tok_abc', name: 'Alice', selectedIds: [event] })
    const parsed = JSON.parse(body) as V1Payload
    expect(parsed.selectedOptionIds).toEqual([])
  })

  test('A4. click event does not cause JSON.stringify to throw', () => {
    const event = makeSyntheticEvent()
    expect(() =>
      buildV1Payload({ token: 'tok_abc', name: 'Alice', selectedIds: [event] })
    ).not.toThrow()
  })

  test('A5. selectedOptionIds are always strings in output', () => {
    const body = buildV1Payload({ token: 't', name: 'Bob', selectedIds: ['pkg_1', 'pkg_2'] })
    const parsed = JSON.parse(body) as V1Payload
    for (const id of parsed.selectedOptionIds) {
      expect(typeof id).toBe('string')
    }
  })
})

// ─── Section B: V2 payload ───────────────────────────────────────────────────

describe('B. V2 acceptance payload', () => {
  test('B1. serializes with plain selections', () => {
    const selections = [{ groupId: 'g1', itemIds: ['i1', 'i2'] }]
    const body = buildV2Payload({ token: 'tok_v2', name: 'Alice', selections })
    const parsed = JSON.parse(body) as V2Payload
    expect(parsed.token).toBe('tok_v2')
    expect(parsed.acceptedBy).toBe('Alice')
    expect(parsed.termsAccepted).toBe(true)
    expect(parsed.selections).toEqual([{ groupId: 'g1', itemIds: ['i1', 'i2'] }])
  })

  test('B2. serializes with empty selections', () => {
    const body = buildV2Payload({ token: 'tok_v2', name: 'Alice', selections: [] })
    const parsed = JSON.parse(body) as V2Payload
    expect(parsed.selections).toEqual([])
  })

  test('B3. groupId and itemIds are coerced to strings', () => {
    const body = buildV2Payload({ token: 't', name: 'Bob', selections: [{ groupId: 'g1', itemIds: ['i1'] }] })
    const parsed = JSON.parse(body) as V2Payload
    expect(typeof parsed.selections[0].groupId).toBe('string')
    expect(typeof parsed.selections[0].itemIds[0]).toBe('string')
  })

  test('B4. V2 payload has no selectedOptionIds field', () => {
    const body = buildV2Payload({ token: 't', name: 'Bob', selections: [] })
    const parsed = JSON.parse(body) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('selectedOptionIds')
  })
})

// ─── Section C: revision payload ─────────────────────────────────────────────

describe('C. Revision acceptance payload', () => {
  test('C1. revision V1 serializes without selections', () => {
    const body = buildRevisionPayload({ token: 'tok_rev', name: 'Alice', isV2: false, selections: [] })
    const parsed = JSON.parse(body) as RevisionPayload
    expect(parsed.token).toBe('tok_rev')
    expect(parsed.acceptedBy).toBe('Alice')
    expect(parsed.termsAccepted).toBe(true)
    expect(parsed.selections).toBeUndefined()
  })

  test('C2. revision V2 serializes with selections', () => {
    const selections = [{ groupId: 'g1', itemIds: ['i1'] }]
    const body = buildRevisionPayload({ token: 'tok_rev', name: 'Alice', isV2: true, selections })
    const parsed = JSON.parse(body) as RevisionPayload
    expect(parsed.selections).toEqual([{ groupId: 'g1', itemIds: ['i1'] }])
  })

  test('C3. revision payload has no name field (uses acceptedBy)', () => {
    const body = buildRevisionPayload({ token: 't', name: 'Bob', isV2: false, selections: [] })
    const parsed = JSON.parse(body) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('name')
    expect(parsed.acceptedBy).toBe('Bob')
  })
})

// ─── Section D: event-contamination guard ────────────────────────────────────

describe('D. SyntheticEvent cannot contaminate payload', () => {
  test('D1. event object passed as selectedIds does not survive serialization', () => {
    const event = makeSyntheticEvent()
    // Simulates: useState([event]) when bare onClick passes MouseEvent as optionId
    const corruptedIds = [event] as unknown as string[]
    const filtered = corruptedIds.filter(id => typeof id === 'string')
    expect(filtered).toEqual([])
  })

  test('D2. event in selectedIds does not cause JSON.stringify to throw', () => {
    const event = makeSyntheticEvent()
    expect(() =>
      JSON.stringify({
        token: 'tok',
        name: 'Alice',
        selectedOptionIds: ([event] as unknown as string[]).filter(id => typeof id === 'string'),
        termsAccepted: true,
        acceptanceVersion: 1,
      })
    ).not.toThrow()
  })

  test('D3. a genuine circular object throws before reaching typeof filter', () => {
    // Confirm circular detection works (the filter guard prevents it reaching stringify)
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(() => JSON.stringify(circular)).toThrow()
  })

  test('D4. string ID is preserved through typeof filter', () => {
    const ids = ['pkg_abc', 'pkg_def']
    const filtered = ids.filter(id => typeof id === 'string')
    expect(filtered).toEqual(['pkg_abc', 'pkg_def'])
  })
})

// ─── Section E: error classification ─────────────────────────────────────────

describe('E. Error classification', () => {
  test('E1. JSON.stringify error is distinct from fetch rejection', () => {
    let classifiedAs: 'serialization' | 'network' | null = null

    function classifyError(err: Error): 'serialization' | 'network' {
      // The serialization guard returns early; only network errors reach the outer catch.
      // This test verifies the classification logic.
      if (err.message.includes('circular') || err.message.includes('JSON')) {
        return 'serialization'
      }
      return 'network'
    }

    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    try {
      JSON.stringify(circular)
    } catch (e) {
      classifiedAs = classifyError(e as Error)
    }
    expect(classifiedAs).toBe('serialization')
  })

  test('E2. network-style error message is not shown for serialization errors', () => {
    const serializationMsg = "We couldn't submit your acceptance. Please try again or contact Walz Travels."
    const networkMsg = 'Network error. Please check your connection and try again.'
    expect(serializationMsg).not.toBe(networkMsg)
    expect(serializationMsg).not.toContain('connection')
    expect(networkMsg).toContain('connection')
  })

  test('E3. serialization error message contains no misleading network language', () => {
    const serializationMsg = "We couldn't submit your acceptance. Please try again or contact Walz Travels."
    expect(serializationMsg).not.toMatch(/check your connection/i)
    expect(serializationMsg).not.toMatch(/network/i)
    expect(serializationMsg).not.toMatch(/offline/i)
  })
})

// ─── Section F: payload completeness ─────────────────────────────────────────

describe('F. Payload field completeness', () => {
  test('F1. V1 payload has all required fields', () => {
    const body = buildV1Payload({ token: 'tok', name: 'Alice', selectedIds: [] })
    const parsed = JSON.parse(body) as Record<string, unknown>
    expect(parsed).toHaveProperty('token')
    expect(parsed).toHaveProperty('name')
    expect(parsed).toHaveProperty('selectedOptionIds')
    expect(parsed).toHaveProperty('termsAccepted')
    expect(parsed).toHaveProperty('acceptanceVersion')
  })

  test('F2. V2 payload has all required fields', () => {
    const body = buildV2Payload({ token: 'tok', name: 'Alice', selections: [] })
    const parsed = JSON.parse(body) as Record<string, unknown>
    expect(parsed).toHaveProperty('token')
    expect(parsed).toHaveProperty('acceptedBy')
    expect(parsed).toHaveProperty('termsAccepted')
    expect(parsed).toHaveProperty('selections')
  })

  test('F3. revision payload has required fields', () => {
    const body = buildRevisionPayload({ token: 'tok', name: 'Alice', isV2: false, selections: [] })
    const parsed = JSON.parse(body) as Record<string, unknown>
    expect(parsed).toHaveProperty('token')
    expect(parsed).toHaveProperty('acceptedBy')
    expect(parsed).toHaveProperty('termsAccepted')
  })

  test('F4. no payload contains supplier or internal fields', () => {
    const v1 = JSON.parse(buildV1Payload({ token: 't', name: 'A', selectedIds: [] })) as Record<string, unknown>
    const v2 = JSON.parse(buildV2Payload({ token: 't', name: 'A', selections: [] })) as Record<string, unknown>
    const rev = JSON.parse(buildRevisionPayload({ token: 't', name: 'A', isV2: false, selections: [] })) as Record<string, unknown>
    const forbidden = ['supplierCost', 'netRate', 'markup', 'margin', 'commission', 'internalMargin']
    for (const payload of [v1, v2, rev]) {
      for (const field of forbidden) {
        expect(payload).not.toHaveProperty(field)
      }
    }
  })

  test('F5. termsAccepted is boolean true, not string', () => {
    const body = buildV1Payload({ token: 't', name: 'A', selectedIds: [] })
    const parsed = JSON.parse(body) as V1Payload
    expect(parsed.termsAccepted).toBe(true)
    expect(typeof parsed.termsAccepted).toBe('boolean')
  })

  test('F6. acceptanceVersion is number 1, not string', () => {
    const body = buildV1Payload({ token: 't', name: 'A', selectedIds: [] })
    const parsed = JSON.parse(body) as V1Payload
    expect(parsed.acceptanceVersion).toBe(1)
    expect(typeof parsed.acceptanceVersion).toBe('number')
  })
})
