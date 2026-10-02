/**
 * @jest-environment jsdom
 *
 * Walz Business V1-A — item 4 of the required test list:
 * "Invited email remains bound through registration (pre-filled, read-only,
 * and actually submitted unchanged to /api/auth/signup)."
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockParams,
}))

import BusinessRegisterForm from '@/app/business/register/BusinessRegisterForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderWith(qs: string) {
  mockParams = new URLSearchParams(qs)
  act(() => root.render(React.createElement(BusinessRegisterForm)))
}

const emailInput = () => container.querySelector<HTMLInputElement>('input[type="email"]')!
const nativeValueSetter = () => Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!

describe('Item 4: invited email stays bound through Business registration', () => {
  it('pre-fills the email field from ?email= when arriving from an invitation', () => {
    renderWith('email=bound%40acme.com')
    expect(emailInput().value).toBe('bound@acme.com')
  })

  it('renders the email field as both disabled and readOnly when ?email= is present', () => {
    renderWith('email=bound%40acme.com')
    expect(emailInput().disabled).toBe(true)
    expect(emailInput().readOnly).toBe(true)
  })

  it('a simulated attempt to type a different email into the locked field has no effect — the onChange handler no-ops', () => {
    renderWith('email=bound%40acme.com')
    const input = emailInput()
    act(() => {
      nativeValueSetter().call(input, 'attacker@evil.com')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // React state (and therefore the eventual submitted value) is governed
    // by the controlled `value` prop, which the component's onChange
    // handler deliberately never updates while emailLocked is true.
    expect(emailInput().value).toBe('bound@acme.com')
  })

  it('without ?email=, the field is editable (not locked) and starts empty', () => {
    renderWith('')
    expect(emailInput().disabled).toBe(false)
    expect(emailInput().readOnly).toBe(false)
    expect(emailInput().value).toBe('')
  })

  it('submits the exact bound email to /api/auth/signup, unchanged', async () => {
    renderWith('email=bound%40acme.com')
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    global.fetch = mockFetch as any

    const passwordInputs = Array.from(container.querySelectorAll('input[type="password"]')) as HTMLInputElement[]
    const [passwordInput, confirmInput] = passwordInputs
    act(() => {
      nativeValueSetter().call(passwordInput, 'correct-horse-battery-staple')
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
      nativeValueSetter().call(confirmInput, 'correct-horse-battery-staple')
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 0))
    })

    expect(mockFetch).toHaveBeenCalled()
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.email).toBe('bound@acme.com')
  })
})
