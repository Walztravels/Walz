/**
 * @jest-environment jsdom
 *
 * /admin/settings/sms-test page behaviour. fetch mocked; no network.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SmsAcceptanceTestPage from '@/app/admin/settings/sms-test/page'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const READY = { ready: false, twilioAccountSid: 'PRESENT', twilioAuthToken: 'PRESENT', messagingServiceSid: 'MISSING' }
const fetchMock = jest.fn()
let container: HTMLDivElement
let root: Root
let postResolvers: Array<(v: unknown) => void> = []
let postMode: 'ok' | 'pending' | 'network-error' = 'ok'

const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
const gets = () => fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET')

beforeEach(() => {
  postMode = 'ok'
  postResolvers = []
  fetchMock.mockReset()
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      if (postMode === 'network-error') return Promise.reject(new TypeError('network down'))
      if (postMode === 'pending') return new Promise((r) => postResolvers.push(r))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ accepted: true, recipientMasked: '+1••••2336', message: 'Accepted by Twilio.' }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ readiness: READY }) })
  })
  ;(globalThis as any).fetch = fetchMock
  let n = 0
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const text = () => container.textContent ?? ''
const btn = (re: RegExp) => Array.from(container.querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''))
const phoneInput = () => container.querySelector<HTMLInputElement>('input[type="tel"]')!
const setValue = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const render = async () => { await act(async () => { root.render(<SmsAcceptanceTestPage />) }) }
const review = async (n = '+12317902336') => {
  setValue(phoneInput(), n)
  await act(async () => { btn(/Review test send/)!.click() })
}

describe('sms-test page', () => {
  it('on open performs only the readiness GET, no POST; shows PRESENT/MISSING only', async () => {
    await render()
    expect(gets()).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/settings/sms-test')
    expect(posts()).toHaveLength(0)
    expect(text()).toMatch(/Twilio account SID:PRESENT/)
    expect(text()).toMatch(/SMS Messaging Service SID:MISSING/)
  })

  it('shows Super-Admin-only message on 403 and no form', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: async () => ({}) }))
    await render()
    expect(text()).toMatch(/Super Admins only/)
    expect(phoneInput()).toBeNull()
  })

  it('valid number + Review shows exact confirmation text, still no POST', async () => {
    await render()
    await review()
    expect(text()).toContain('Send one CUSTOMER_CARE test SMS to +1••••2336')
    expect(text()).not.toContain('2317902336')
    expect(posts()).toHaveLength(0)
  })

  it('invalid number shows inline error and never opens confirmation', async () => {
    await render()
    for (const bad of ['abc', '08031234567', 'whatsapp:+12317902336']) {
      await review(bad)
      expect(text()).toMatch(/Enter a full international number/)
      expect(text()).not.toMatch(/Send one CUSTOMER_CARE/)
    }
    expect(posts()).toHaveLength(0)
  })

  it('Cancel closes confirmation without sending', async () => {
    await render()
    await review()
    await act(async () => { btn(/Cancel/)!.click() })
    expect(text()).not.toMatch(/Send one CUSTOMER_CARE/)
    expect(posts()).toHaveLength(0)
  })

  it('double-clicking Confirm sends exactly ONE POST with only phone + clientKey; button disabled while pending', async () => {
    postMode = 'pending'
    await render()
    await review()
    const confirm = btn(/Confirm and send/)!
    await act(async () => { confirm.click(); confirm.click() })
    expect(posts()).toHaveLength(1)
    const body = JSON.parse(posts()[0][1].body)
    expect(Object.keys(body).sort()).toEqual(['clientKey', 'phone'])
    expect(body.phone).toBe('+12317902336')
    expect(body.clientKey).toMatch(/^[0-9a-f-]{36}$/)
    expect((btn(/Sending/)! as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      postResolvers[0]({ ok: true, status: 200, json: async () => ({ accepted: true, recipientMasked: '+1••••2336', message: 'Accepted by Twilio.' }) })
    })
    expect(posts()).toHaveLength(1)
    expect(text()).toMatch(/Accepted/)
  })

  it('network error is not auto-retried and shows the may-or-may-not message', async () => {
    postMode = 'network-error'
    await render()
    await review()
    await act(async () => { btn(/Confirm and send/)!.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(posts()).toHaveLength(1)
    expect(text()).toMatch(/may or may not have been sent/)
  })

  it('failed (refused) response is shown and not retried', async () => {
    fetchMock.mockImplementation((_u: string, init?: { method?: string }) =>
      init?.method === 'POST'
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ accepted: false, message: 'Refused: nope' }) })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ readiness: READY }) }))
    await render()
    await review()
    await act(async () => { btn(/Confirm and send/)!.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(posts()).toHaveLength(1)
    expect(text()).toMatch(/Refused: nope/)
  })
})
