/**
 * @jest-environment jsdom
 *
 * Jade Conversation Polish — app/plan/[tripId]/page.tsx "Ask Jade" chat
 * panel, brought in line with PortalJadeChat.tsx (items 1, 2, 3, 4, 5, 6, 7,
 * 8 of the gap list). next-auth/navigation are mocked; the trip load and
 * share-status fetches are satisfied with a minimal fixture so the real
 * page component (not a stand-in harness) can be mounted and interacted
 * with directly.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom does not implement scrollIntoView — the chat panel's auto-scroll
// calls it on every message-list change.
Element.prototype.scrollIntoView = jest.fn()

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Ada' } }, status: 'authenticated' }),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const trip = {
  id: 't1', title: 'Dubai Trip', destination: 'Dubai, UAE', status: 'PLANNING',
  startDate: null, endDate: null, coverImage: null, budget: null, currency: 'GBP',
  notes: null, isPublic: false, days: [], items: [], collaborators: [], proposals: [],
}

import TripPlannerPage from '@/app/plan/[tripId]/page'

let container: HTMLDivElement
let root: Root
let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn((url: string) => {
    if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
    if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
    return Promise.reject(new Error(`unexpected fetch in setup: ${url}`))
  })
  ;(globalThis as any).fetch = fetchMock
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)
const findButton = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === label)

const mountAndOpenJadeTab = async () => {
  await act(async () => {
    root.render(<TripPlannerPage params={{ tripId: 't1' }} />)
    await Promise.resolve()
    await Promise.resolve()
  })
  const jadeTab = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Ask Jade'))!
  await act(async () => { jadeTab.click() })
}

const typeIntoJade = (text: string) => {
  const el = q<HTMLTextAreaElement>('textarea[aria-label="Message to Jade"]')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const sendJade = async (text: string) => {
  typeIntoJade(text)
  const btn = q<HTMLButtonElement>('button[aria-label="Send message"]')!
  await act(async () => { btn.click() })
}

describe('Trip Planner "Ask Jade" panel — markdown rendering reuse (item 1)', () => {
  it('renders an assistant chat reply with markdown through JadeMessageContent, not raw text', async () => {
    fetchMock.mockImplementation((url: string, init?: any) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url) === '/api/chat/jade') return Promise.resolve({ json: async () => ({ content: 'Here is **your** plan' }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()
    await sendJade('what should I pack')

    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('your')
    expect(container.textContent).not.toContain('**your**')
  })
})

describe('Trip Planner "Ask Jade" panel — bubble/avatar parity with PortalJadeChat (items 2, 3)', () => {
  it('the user bubble is solid gold with a flat bottom-right corner (not translucent)', async () => {
    await mountAndOpenJadeTab()
    typeIntoJade('hello')
    const bubble = container.querySelector('.bg-\\[\\#C9A84C\\].text-\\[\\#0B1F3A\\].font-medium.rounded-br-sm')
    // Bubble only exists once the message is actually sent, so submit it.
    const btn = q<HTMLButtonElement>('button[aria-label="Send message"]')!
    await act(async () => { btn.click() })
    expect(container.querySelector('.bg-\\[\\#C9A84C\\].text-\\[\\#0B1F3A\\].font-medium.rounded-br-sm')).toBeTruthy()
    expect(bubble).toBeFalsy() // sanity: wasn't present before sending
  })

  it('the assistant avatar uses the PortalJadeChat-aligned w-7 h-7 gradient-fill treatment', async () => {
    await mountAndOpenJadeTab()
    // The pre-seeded welcome message is from the assistant.
    const avatar = container.querySelector('.w-7.h-7.rounded-full.bg-gradient-to-br')
    expect(avatar).toBeTruthy()
  })
})

describe('Trip Planner "Ask Jade" panel — textarea auto-grow wiring (item 4)', () => {
  it('the textarea grows via onInput, matching PortalJadeChat\'s height-adjustment pattern', async () => {
    await mountAndOpenJadeTab()
    const el = q<HTMLTextAreaElement>('textarea[aria-label="Message to Jade"]')!
    Object.defineProperty(el, 'scrollHeight', { value: 90, configurable: true })
    act(() => { el.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(el.style.height).toBe('90px')
  })
})

describe('Trip Planner "Ask Jade" panel — accessibility (item 5)', () => {
  it('has the message log with role=log, aria-live=polite, and a labelled textarea + send button', async () => {
    await mountAndOpenJadeTab()
    const log = q('[role="log"]')!
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(q('textarea[aria-label="Message to Jade"]')).toBeTruthy()
    expect(q('button[aria-label="Send message"]')).toBeTruthy()
  })

  it('labels the typing indicator "Jade is thinking"', async () => {
    let resolveFetch: (v: any) => void = () => {}
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      if (String(url) === '/api/chat/jade') return new Promise(res => { resolveFetch = res })
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()
    typeIntoJade('still thinking?')
    const btn = q<HTMLButtonElement>('button[aria-label="Send message"]')!
    act(() => { btn.click() })
    await act(async () => { await Promise.resolve() })

    expect(q('[aria-label="Jade is thinking"]')).toBeTruthy()

    await act(async () => { resolveFetch({ json: async () => ({ content: 'done' }) }) })
  })
})

describe('Trip Planner "Ask Jade" panel — client-side retry on failed send (item 6)', () => {
  it('shows a restrained inline "Failed to send" + Retry on the failed user message, no assistant apology bubble', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      if (String(url) === '/api/chat/jade') return Promise.reject(new Error('network down'))
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()
    await sendJade('are we there yet')

    expect(container.textContent).toContain('Failed to send')
    expect(findButton('Retry')).toBeTruthy()
    expect(container.textContent).not.toMatch(/something went wrong/i)
  })

  it('retry re-submits the exact same original text to the same endpoint', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()

    let chatCalls = 0
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      if (String(url) === '/api/chat/jade') {
        chatCalls += 1
        if (chatCalls === 1) return Promise.reject(new Error('network down'))
        return Promise.resolve({ json: async () => ({ content: 'all good now' }) } as any)
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    await sendJade('please dont fail twice')
    expect(findButton('Retry')).toBeTruthy()

    await act(async () => { findButton('Retry')!.click() })

    expect(chatCalls).toBe(2)
    const [, secondInit] = fetchMock.mock.calls.filter(([u]: [string]) => u === '/api/chat/jade')[1]
    const lastMessage = JSON.parse(secondInit.body).messages.at(-1)
    expect(lastMessage.content).toContain('please dont fail twice')
    expect(container.textContent).toContain('all good now')
  })
})

describe('Trip Planner "Ask Jade" panel — guarded auto-scroll (item 7)', () => {
  it('shows the "New message" pill instead of auto-scrolling once the reader has scrolled up', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      if (String(url) === '/api/chat/jade') return Promise.resolve({ json: async () => ({ content: 'a new reply' }) } as any)
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()

    const log = q('[role="log"]')!
    Object.defineProperty(log, 'scrollTop', { value: 0, configurable: true })
    Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(log, 'clientHeight', { value: 200, configurable: true })
    act(() => { log.dispatchEvent(new Event('scroll', { bubbles: true })) })

    await sendJade('ping')

    expect(findButton('New message')).toBeTruthy()
  })
})

describe('Trip Planner "Ask Jade" panel — suggested prompts gated to the empty state (item 8)', () => {
  it('shows suggested prompts before any exchange, and hides them after the first exchange', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/share')) return Promise.resolve({ json: async () => ({ isPublic: false, shareUrl: null }) } as any)
      if (String(url).includes('/api/trips/')) return Promise.resolve({ json: async () => ({ trip }) } as any)
      if (String(url) === '/api/chat/jade') return Promise.resolve({ json: async () => ({ content: 'ok' }) } as any)
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    await mountAndOpenJadeTab()
    expect(container.textContent).toContain('Generate a full itinerary')

    await sendJade('tell me something')

    expect(container.textContent).not.toContain('Generate a full itinerary')
  })
})
