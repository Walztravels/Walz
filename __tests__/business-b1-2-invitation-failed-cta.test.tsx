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
 *
 * B1 RETRY-FIX (this file's later addition): the original hotfix merged a
 * thrown fetch() exception (offline/DNS/timeout/connection drop — the
 * server never conclusively responded) into the exact same 'failed' state
 * as a conclusive, server-confirmed rejection. That is now split into two
 * distinguishable states: 'server-failed' (conclusive — unchanged wording
 * and behavior) and 'network-error' (a new, separate, retryable state that
 * never claims the invitation is invalid/expired and offers a "Try again"
 * control that re-invokes the same accept() function against the same,
 * unmodified server endpoint). The one test below that specifically
 * asserted the OLD merged behavior ("a network failure... also removes the
 * Accept button") has been replaced — see the "network-error" describe
 * block — because that assertion encoded the bug this track fixes.
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

function findButtonByText(re: RegExp): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(b => re.test(b.textContent ?? ''))
}

async function clickAccept() {
  const btn = acceptButton()!
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('AcceptInvitation: a conclusive (server-confirmed) failure removes the Accept CTA entirely', () => {
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

  it('a direct server-confirmed invalid response (res.ok === false, no thrown exception) shows no "Try again" control — matches unchanged server-failed behavior', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, error: 'This invitation link is invalid or has expired' }),
    })
    render()
    await clickAccept()
    expect(acceptButton()).toBeNull()
    expect(container.textContent?.toLowerCase()).not.toMatch(/try again/)
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

describe('AcceptInvitation: B1 retry-fix — thrown fetch exceptions are a distinct, retryable "network-error" state', () => {
  it('a thrown fetch error enters network-error, does NOT claim the invitation is invalid, and renders a "Try again" control', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'))
    render()
    await clickAccept()
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toMatch(/invalid/)
    expect(text).not.toMatch(/expired/)
    expect(text).toMatch(/couldn't verify or accept this invitation|check your connection/)
    expect(findButtonByText(/try again/i)).toBeTruthy()
  })

  it('network failure then successful retry: first fetch throws, Try again succeeds, success/done flow completes normally', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, organizationId: 'org_42' }) })

    render()
    await clickAccept() // first attempt -> network-error
    const tryAgain = findButtonByText(/try again/i)!
    expect(tryAgain).toBeTruthy()

    await act(async () => {
      tryAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
    // Both calls hit the exact same, real server endpoint.
    for (const call of (global.fetch as jest.Mock).mock.calls) {
      expect(call[0]).toBe('/api/business/invitations/accept')
    }
    expect(container.textContent).toMatch(/you've joined the organization/i)
    const link = Array.from(container.querySelectorAll('a')).find(a => /go to walz business/i.test(a.textContent ?? ''))
    expect(link!.getAttribute('href')).toBe('/business/org_42')
  })

  it('network failure then server rejection: retry via Try again lands in the non-actionable server-failed state, not stuck in network-error', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ ok: false, error: 'invalid' }) })

    render()
    await clickAccept() // network-error
    const tryAgain = findButtonByText(/try again/i)!

    await act(async () => {
      tryAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    // Now conclusively server-failed: no Accept button, no retry control,
    // and the existing (unchanged) generic invalid/expired copy is shown.
    expect(acceptButton()).toBeNull()
    expect(findButtonByText(/try again/i)).toBeFalsy()
    expect(container.textContent).toMatch(/invalid or has expired/i)
  })

  it('the client never tries to distinguish WHY a thrown exception happened — same neutral copy regardless of error type', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))
    render()
    await clickAccept()
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toMatch(/abort|timeout|dns|offline/)
    expect(text).toMatch(/check your connection and try again/)
  })

  it('clicking "Try again" immediately re-enters the working state (no plain Try again / network-error banner remains) — prevents duplicate submission', async () => {
    let resolveSecond: (v: unknown) => void = () => {}
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve }))

    render()
    await clickAccept()
    const tryAgain = findButtonByText(/try again/i)!

    act(() => { tryAgain.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    // Mid-flight: back to the generic disabled "Accepting…" button, and the
    // network-error banner/"Try again" control is gone.
    const workingBtn = acceptButton()
    expect(workingBtn).toBeTruthy()
    expect(workingBtn!.disabled).toBe(true)
    expect(workingBtn!.textContent).toMatch(/accepting/i)
    expect(findButtonByText(/try again/i)).toBeFalsy()

    // A second click while disabled cannot fire a third fetch call.
    act(() => { workingBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)

    await act(async () => {
      resolveSecond({ ok: true, status: 200, json: async () => ({ ok: true, organizationId: 'org_1' }) })
      await new Promise(r => setTimeout(r, 0))
    })
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
