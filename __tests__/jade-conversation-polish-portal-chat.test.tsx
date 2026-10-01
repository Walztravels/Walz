/**
 * @jest-environment jsdom
 *
 * Jade Conversation Polish — PortalJadeChat.tsx interactive behavior.
 *
 * Covers the two gaps this pass closes on PortalJadeChat itself:
 *   - client-side retry affordance for a failed send (item 6)
 *   - guarded auto-scroll / "New message" pill (item 7)
 * plus regression coverage that the pre-existing markdown rendering,
 * accessibility attributes, and bubble/avatar treatment this pass was
 * told to use as the reference are unchanged.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import PortalJadeChat from '@/app/dashboard/jade/_components/PortalJadeChat'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom does not implement scrollIntoView — PortalJadeChat's auto-scroll
// calls it on every message-list change.
Element.prototype.scrollIntoView = jest.fn()

const baseProps = {
  displayName: 'Ada',
  hasBookings: false,
  hasProposals: false,
  hasActionsRequired: false,
  initialContextHint: {},
}

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

const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)
const textarea = () => q<HTMLTextAreaElement>('textarea[aria-label="Message to Jade"]')!
const sendButton = () => q<HTMLButtonElement>('button[aria-label="Send message"]')!

const typeMessage = (text: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea(), text)
    textarea().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const send = async (text: string) => {
  typeMessage(text)
  await act(async () => { sendButton().click() })
}

describe('PortalJadeChat — markdown rendering reuse (background, regression guard)', () => {
  it('renders an assistant reply with markdown through JadeMessageContent, not raw text', async () => {
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ reply: 'Here is **your** itinerary' }),
    })
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    await send('plan my trip')

    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('your')
    expect(container.textContent).not.toContain('**your**')
  })
})

describe('PortalJadeChat — client-side retry on failed send (item 6)', () => {
  it('shows a restrained inline "Failed to send" + Retry on the failed user message, not an assistant apology bubble', async () => {
    ;(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('network down'))
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    await send('hello jade')

    expect(container.textContent).toContain('Failed to send')
    const retryBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Retry')
    expect(retryBtn).toBeTruthy()
    // No fake assistant apology bubble was pushed instead.
    expect(container.textContent).not.toMatch(/technical issue|something went wrong/i)
  })

  it('retry re-submits the exact same original text — no new API contract, same send path', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: 200, json: async () => ({ reply: 'Got it, retried fine' }) })
    ;(globalThis as any).fetch = fetchMock

    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    await send('retry me please')

    const retryBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Retry')!
    await act(async () => { retryBtn.click() })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = fetchMock.mock.calls[0]
    const [secondUrl, secondInit] = fetchMock.mock.calls[1]
    expect(firstUrl).toBe('/api/jade/portal/chat')
    expect(secondUrl).toBe('/api/jade/portal/chat')
    expect(JSON.parse(firstInit.body).message).toBe('retry me please')
    expect(JSON.parse(secondInit.body).message).toBe('retry me please')
    expect(container.textContent).toContain('Got it, retried fine')
  })

  it('the restrained red treatment is scoped to the failed row only — everything else stays navy/gold', async () => {
    ;(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('network down'))
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    await send('hello jade')

    // The user bubble itself keeps the solid-gold treatment — red is only
    // in the small inline affordance below it, never the bubble itself.
    const goldBubble = container.querySelector('.bg-\\[\\#C9A84C\\].text-\\[\\#0B1F3A\\]')
    expect(goldBubble).toBeTruthy()
    expect(goldBubble!.className).not.toMatch(/red/)
    // No full-width banner element.
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('PortalJadeChat — guarded auto-scroll (item 7)', () => {
  it('renders the message log with role=log and aria-live=polite', () => {
    ;(globalThis as any).fetch = jest.fn()
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    const log = q('[role="log"]')!
    expect(log.getAttribute('aria-live')).toBe('polite')
  })

  it('shows the "New message" pill instead of silently auto-scrolling once the reader has scrolled up', async () => {
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ reply: 'second reply' }),
    })
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })

    const log = q('[role="log"]')!
    // Simulate the reader having scrolled up, away from the bottom.
    Object.defineProperty(log, 'scrollTop', { value: 0, configurable: true })
    Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(log, 'clientHeight', { value: 200, configurable: true })
    act(() => { log.dispatchEvent(new Event('scroll', { bubbles: true })) })

    await send('are you still there')

    const pill = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('New message'))
    expect(pill).toBeTruthy()

    // Clicking it clears the pill.
    act(() => { pill!.click() })
    const pillAfter = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('New message'))
    expect(pillAfter).toBeFalsy()
  })

  it('does NOT show the pill when the reader is already at the bottom', async () => {
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ reply: 'reply while at bottom' }),
    })
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    await send('hi')

    const pill = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('New message'))
    expect(pill).toBeFalsy()
  })
})

describe('PortalJadeChat — suggested prompts gated to the empty state (regression guard)', () => {
  it('hides suggested prompts once the conversation is no longer empty', async () => {
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ reply: 'hi' }) })
    act(() => { root.render(<PortalJadeChat {...baseProps} />) })
    expect(container.textContent).toContain('What needs my attention?')

    await send('hello')

    expect(container.textContent).not.toContain('What needs my attention?')
  })
})
