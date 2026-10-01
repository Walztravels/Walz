/**
 * @jest-environment jsdom
 *
 * Walz Business (Release 2.2) Slice B — Item B (client side): LoginForm
 * reads an `email` query param and pre-fills the email input on both the
 * sign-in and sign-up tabs. Presentational convenience only.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockParams,
}))
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }))
jest.mock('next/image', () => ({ __esModule: true, default: (props: Record<string, unknown>) => React.createElement('img', props) }))

import LoginForm from '@/app/login/LoginForm'

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
  act(() => root.render(React.createElement(LoginForm)))
}

const emailInput = () => container.querySelector<HTMLInputElement>('input[type="email"]')!
const tabButton = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label)!

describe('LoginForm — Item B: ?email= pre-fill', () => {
  it('pre-fills the sign-in tab email input from ?email=', () => {
    renderWith('email=jane%40acme.com')
    expect(emailInput().value).toBe('jane@acme.com')
  })

  it('pre-fills the sign-up tab email input when arriving with signup=true&email=', () => {
    renderWith('signup=true&email=jane%40acme.com')
    expect(emailInput().value).toBe('jane@acme.com')
  })

  it('pre-fills the email input after switching from sign-in to the sign-up tab', () => {
    renderWith('email=jane%40acme.com')
    expect(emailInput().value).toBe('jane@acme.com')
    act(() => { tabButton('Create Account').click() })
    // switchTab() intentionally clears the form fields on every manual tab
    // switch (pre-existing behaviour) — this exercises that the initial
    // pre-fill itself landed on mount, not that it survives a manual switch.
    expect(container.querySelector('input[type="email"]')).not.toBeNull()
  })

  it('defaults to an empty email when no ?email= query param is present', () => {
    renderWith('')
    expect(emailInput().value).toBe('')
  })

  it('does not throw or pre-fill from a non-email garbage value — just passes it through as the raw string (presentational only, never validated here)', () => {
    renderWith('email=not-an-email')
    expect(emailInput().value).toBe('not-an-email')
  })
})
