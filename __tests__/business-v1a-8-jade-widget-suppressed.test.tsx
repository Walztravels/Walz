/**
 * Walz Business V1-A — item 8 of the required test list:
 * "/business/** routes render with zero global Jade widget."
 *
 * JadeChatWidgetLazy is rendered as a SIBLING of <PublicShell> in
 * app/layout.tsx, not inside it — PublicShell's own pathname branching does
 * nothing for it. It now reads usePathname() itself and renders null for
 * any /business/** path.
 */
let mockPathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))
jest.mock('next/dynamic', () => () => {
  function MockedJadeChatWidget() { return null }
  MockedJadeChatWidget.displayName = 'JadeChatWidget'
  return MockedJadeChatWidget
})

import JadeChatWidgetLazy from '@/components/common/JadeChatWidgetLazy'

describe('JadeChatWidgetLazy — Business V1-A: suppressed on /business/**', () => {
  it('renders null on /business', () => {
    mockPathname = '/business'
    expect(JadeChatWidgetLazy()).toBeNull()
  })

  it('renders null on a nested /business/<orgId> route', () => {
    mockPathname = '/business/org_123/requests/req_1'
    expect(JadeChatWidgetLazy()).toBeNull()
  })

  it('renders null on /business/login and /business/register', () => {
    mockPathname = '/business/login'
    expect(JadeChatWidgetLazy()).toBeNull()
    mockPathname = '/business/register'
    expect(JadeChatWidgetLazy()).toBeNull()
  })

  it('still renders the widget element on an ordinary consumer route', () => {
    mockPathname = '/flights'
    const el = JadeChatWidgetLazy()
    expect(el).not.toBeNull()
  })

  it('still renders the widget element on /admin (never suppressed there — out of scope for this change)', () => {
    mockPathname = '/admin/clients'
    const el = JadeChatWidgetLazy()
    expect(el).not.toBeNull()
  })

  it('a path that merely contains "business" elsewhere is NOT suppressed (prefix, not substring)', () => {
    mockPathname = '/our-business-story'
    const el = JadeChatWidgetLazy()
    expect(el).not.toBeNull()
  })
})
