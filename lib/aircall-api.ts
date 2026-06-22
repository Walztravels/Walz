const AIRCALL_AUTH = () =>
  Buffer.from(
    `${process.env.AIRCALL_API_ID ?? ''}:${process.env.AIRCALL_API_TOKEN ?? ''}`,
  ).toString('base64')

async function aircallFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T | null> {
  const auth = AIRCALL_AUTH()
  if (!auth || auth === ':' || Buffer.from(auth, 'base64').toString() === ':') {
    console.warn('[aircall] Credentials not configured — skipping', path)
    return null
  }

  const res = await fetch(`https://api.aircall.io/v1${path}`, {
    ...options,
    headers: {
      Authorization:  `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    console.error(`[aircall-api] ${path} failed:`, res.status, await res.text().catch(() => ''))
    return null
  }

  return res.json() as Promise<T>
}

export async function transferCallToAgent(callId: string, aircallUserId: number): Promise<boolean> {
  const result = await aircallFetch(`/calls/${callId}/transfers`, {
    method: 'POST',
    body:   JSON.stringify({ user_id: aircallUserId }),
  })
  return result !== null
}

export async function sendInsightCard(
  callId: string,
  data: { callerNumber: string; assignedTo: string; reason: string },
): Promise<void> {
  await aircallFetch(`/calls/${callId}/insight_cards`, {
    method: 'POST',
    body:   JSON.stringify({
      contents: [
        { type: 'title',     text: 'Walz Travels Routing'    },
        { type: 'shortText', label: 'Caller',      text: data.callerNumber },
        { type: 'shortText', label: 'Assigned to', text: data.assignedTo  },
        { type: 'shortText', label: 'Reason',      text: data.reason      },
      ],
    }),
  })
}

export async function getAircallCall(callId: string) {
  return aircallFetch<{ call: Record<string, unknown> }>(`/calls/${callId}`)
}

export async function getAircallCalls(perPage = 50) {
  return aircallFetch<{ calls: unknown[] }>(`/calls?order=DESC&per_page=${perPage}`)
}

export async function getAircallUsers() {
  return aircallFetch<{ users: Array<{ id: number; name: string; email: string; availability_status: string }> }>('/users')
}
