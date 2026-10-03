/**
 * @jest-environment jsdom
 *
 * Walz Business (Track C: /partners -> Walz Business integration) —
 * confirms /partners is treated as a normal public page by PublicShell
 * (Navbar + Footer render, no Jade/Business-portal exclusion applies),
 * exactly like every other consumer marketing page and unlike /business/**
 * or /admin/**.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

jest.mock('next/navigation', () => ({ usePathname: () => '/partners' }))
jest.mock('@/components/common/Navbar', () => ({ Navbar: () => <nav data-testid="mock-navbar" /> }))
jest.mock('@/components/common/Footer', () => ({ Footer: () => <footer data-testid="mock-footer" /> }))
jest.mock('@/components/common/ExitIntentPopup', () => ({ ExitIntentPopup: () => null }))
jest.mock('next/dynamic', () => () => () => null)

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { PublicShell } from '@/components/common/PublicShell'

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

describe('PublicShell on /partners', () => {
  it('renders the normal public Navbar and Footer (not the Business/admin bare-children branch)', () => {
    act(() => root.render(<PublicShell><div data-testid="page-content">partners page</div></PublicShell>))
    expect(container.querySelector('[data-testid="mock-navbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="mock-footer"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="page-content"]')).not.toBeNull()
  })
})
