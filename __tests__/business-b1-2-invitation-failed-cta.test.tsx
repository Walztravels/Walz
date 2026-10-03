/**
 * @jest-environment jsdom
 *
 * Walz Business Track B1 — B1.2: Invalid invitation CTA.
 *
 * BACKGROUND: AcceptInvitation.tsx showed a failure banner when
 * `state === 'failed'` (a CONCLUSIVE, server-confirmed failure — the POST to
 * /api/business/invitations/accept already ran and returned a non-ok,
 * non-409 result) but only disabled the Accept button for `state ===
 * 'working'` — so the button stayed live/clickable after a confirmed
 * failure, suggesting re-clicking could still succeed. Fix: once failed, the
 * button is removed entirely (not merely disabled) and safe recovery
 * actions are offered instead. No server-side check is touched —
 * acceptOrganizationInvitation()'s own revalidation remains the sole
 * authority (see lib/business/invitations.ts).
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

import AcceptInvitation from '@/app/business/invitations/[token]/AcceptInvitation'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  global.fetch = jest.fn() as any
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.restoreAllMocks()
})

function render() {
  act(() => root.render(React.createElement(AcceptInvitation, { token: 'tok_abc123' })))
}

function acceptButton(): HTMLButtonElement | null {
  return container.querySelector('button')
}

async function clickAccept() {
  const btn = acceptButton()!
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('AcceptInvitation: a conclusive failure removes the Accept CTA entirely', () => {
  it('a 404 (generic invalid/expired/consumed/mismatched) result removes the Accept button — not merely disables it', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: 'This invitation link is invalid or has expired' }),
    })
    render()
    expect(acceptButton()).toBeTruthy()
    await clickAccept()
    expect(acceptButton()).toBeNull() // gone entirely, not just disabled
    expect(container.textContent).toMatch(/invalid or has expired/i)
  })

  it('a network failure (thrown exception) also removes the Accept button', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network down'))
    render()
    await clickAccept()
    expect(acceptButton()).toBeNull()
  })

  it('offers "Back to Walz Business sign in" as a recovery action', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    render()
    await clickAccept()
    const link = Array.from(container.querySelectorAll('a')).find(a => /back to walz business sign in/i.test(a.textContent ?? ''))
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/business/login')
  })

  it('suggests asking the organization administrator for a new invitation', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    render()
    await clickAccept()
    expect(container.textContent).toMatch(/ask your organization administrator for a new invitation/i)
  })

  it('does NOT expose which specific reason caused the failure (expired/unknown/consumed/wrong-email all collapse to one generic message)', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: 'This invitation link is invalid or has expired' }),
    })
    render()
    await clickAccept()
    const text = container.textContent ?? ''
    expect(text.toLowerCase()).not.toMatch(/consumed|already used|wrong email address was entered|unknown token/)
  })
})

describe('AcceptInvitation: the distinguishable "already_active_member" (409/conflict) state is preserved', () => {
  it('a 409 result shows the distinct "already a member" message AND keeps the Accept button (existing, safe distinction)', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false, error: 'You are already a member of this organization' }),
    })
    render()
    await clickAccept()
    expect(container.textContent).toMatch(/already a member/i)
    // 'conflict' is a distinct, intentionally-preserved state — this hotfix
    // only removes the CTA for the generic 'failed' state, not 'conflict'.
    expect(acceptButton()).toBeTruthy()
  })
})

describe('AcceptInvitation: regressions — valid flow and in-flight state are unchanged', () => {
  it('REGRESSION: a successful accept still shows the "joined" state with a working link', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, organizationId: 'org_123', role: 'TRAVELLER' }),
    })
    render()
    await clickAccept()
    expect(container.textContent).toMatch(/you've joined the organization/i)
    const link = Array.from(container.querySelectorAll('a')).find(a => /go to walz business/i.test(a.textContent ?? ''))
    expect(link!.getAttribute('href')).toBe('/business/org_123')
  })

  it('REGRESSION: the "working" state still disables the button and prevents a duplicate submission', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    ;(global.fetch as jest.Mock).mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    render()
    const btn = acceptButton()!
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    // Still mid-flight: button now disabled, "Accepting…"
    const workingBtn = acceptButton()
    expect(workingBtn).toBeTruthy()
    expect(workingBtn!.disabled).toBe(true)
    expect(workingBtn!.textContent).toMatch(/accepting/i)

    // A second click while disabled cannot fire another fetch call.
    act(() => { workingBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)

    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, organizationId: 'org_1' }) })
      await new Promise(r => setTimeout(r, 0))
    })
  })

  it('idle state: the Accept button is enabled and clickable', () => {
    render()
    const btn = acceptButton()!
    expect(btn.disabled).toBe(false)
  })
})
