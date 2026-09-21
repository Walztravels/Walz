/**
 * Walz Team Hub V1.1 — lib/email-team-notification.ts.
 *
 * The template is a pure function, so both the single-event and the
 * batched multi-event shapes are asserted directly. Also pins the deep
 * link to the EXISTING /admin/team?c=<conversationId> convention, and
 * proves a Resend failure can never throw into the cron.
 */

const mockSend = jest.fn()
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: mockSend } }) }))

import {
  renderTeamHubEmail,
  sendTeamHubEmail,
  teamConversationLink,
  teamHubEmailSubject,
  type TeamHubEmailEvent,
} from '@/lib/email-team-notification'
import { parseDeepLinkConversationId } from '@/app/admin/team/lib/deepLink'

const BASE = 'https://walztravels.com'

const mention: TeamHubEmailEvent = {
  kind: 'MENTION', conversationId: 'conv-1', title: 'Ada mentioned you in #reservations', preview: 'can you check this booking?',
}
const dm: TeamHubEmailEvent = { kind: 'DM', conversationId: 'dm-9', title: 'Bo sent you a direct message', preview: 'morning!' }
const missed: TeamHubEmailEvent = { kind: 'MISSED_CALL', conversationId: 'dm-9', title: 'Missed call from Bo', preview: null }

beforeEach(() => {
  jest.clearAllMocks()
  mockSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('deep link', () => {
  it('uses the exact existing /admin/team?c=<id> convention the workspace already parses', () => {
    const link = teamConversationLink('conv-1', BASE)
    expect(link).toBe('https://walztravels.com/admin/team?c=conv-1')
    expect(parseDeepLinkConversationId(new URL(link).search)).toBe('conv-1')
  })

  it('url-encodes the id and carries no token or credential of any kind', () => {
    const link = teamConversationLink('a b&c', BASE)
    expect(link).toBe('https://walztravels.com/admin/team?c=a%20b%26c')
    expect(link).not.toMatch(/token|secret|key|auth|login/i)
  })
})

describe('single-event rendering', () => {
  it('renders one card, a deep-linked CTA and a singular subject', () => {
    const { subject, html } = renderTeamHubEmail({ staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention], baseUrl: BASE })
    expect(subject).toBe('Ada mentioned you in #reservations — Walz Team Hub')
    expect(html).toContain('Hi Joe,')
    expect(html).toContain('You missed something in Team Hub')
    expect(html).toContain('Ada mentioned you in #reservations')
    expect(html).toContain('can you check this booking?')
    expect(html).toContain('Mention')
    // CTA goes straight to the conversation.
    expect(html).toContain('href="https://walztravels.com/admin/team?c=conv-1"')
    expect(html).toContain('Open in Team Hub')
    // Walz branding conventions.
    expect(html).toContain('#0B1F3A')
    expect(html).toContain('#C9A84C')
    expect(html).toContain('Walz Travels &middot; walztravels.com')
    // Self-service preference link.
    expect(html).toContain('/admin/team/notifications')
    // Mobile-responsive.
    expect(html).toContain('max-width:560px')
    expect(html).toContain('@media only screen and (max-width:600px)')
  })

  it('renders without a preview (missed call) and escapes untrusted text', () => {
    const { html } = renderTeamHubEmail({
      staffName: '<script>x</script>',
      staffEmail: 'joe@walztravels.com',
      events: [{ ...missed, title: 'Missed call from <b>Bo</b>' }],
      baseUrl: BASE,
    })
    expect(html).toContain('Missed call')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Missed call from &lt;b&gt;Bo&lt;/b&gt;')
  })
})

describe('batched rendering', () => {
  it('lists every accumulated event, each with its own deep link, under a plural subject', () => {
    const { subject, html } = renderTeamHubEmail({
      staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention, dm, missed], baseUrl: BASE,
    })
    expect(subject).toBe('3 new things in Walz Team Hub while you were away')
    expect(html).toContain('3 new things while you were away')
    expect(html).toContain('Ada mentioned you in #reservations')
    expect(html).toContain('Bo sent you a direct message')
    expect(html).toContain('Missed call from Bo')
    expect(html).toContain('href="https://walztravels.com/admin/team?c=conv-1"')
    expect(html).toContain('href="https://walztravels.com/admin/team?c=dm-9"')
    // The batched CTA opens Team Hub rather than picking one conversation.
    expect(html).toContain('href="https://walztravels.com/admin/team"')
    expect(html).toContain('Open Team Hub')
  })

  it('summarises overflow events as "+N more" and counts them in the subject', () => {
    const { subject, html } = renderTeamHubEmail({
      staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention, dm], moreCount: 4, baseUrl: BASE,
    })
    expect(subject).toBe('6 new things in Walz Team Hub while you were away')
    expect(html).toContain('and 4 more updates waiting in Team Hub.')
  })

  it('subject helper agrees with the rendered total', () => {
    expect(teamHubEmailSubject([mention])).toContain('Walz Team Hub')
    expect(teamHubEmailSubject([mention, dm])).toBe('2 new things in Walz Team Hub while you were away')
  })
})

describe('sending', () => {
  it('sends through the shared (hardened) Resend client with the standard Walz From', async () => {
    const ok = await sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention], baseUrl: BASE })
    expect(ok).toBe(true)
    const payload = mockSend.mock.calls[0][0]
    expect(payload.from).toBe('Walz Travels <hello@walztravels.com>')
    expect(payload.to).toBe('joe@walztravels.com')
    expect(payload.subject).toContain('Ada mentioned you')
    // No text/plain is set here on purpose — lib/resend-hardened.ts derives it.
    expect(payload.text).toBeUndefined()
  })

  it('returns false (never throws) when Resend rejects', async () => {
    mockSend.mockRejectedValue(new Error('resend 500'))
    await expect(sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention] }))
      .resolves.toBe(false)
  })

  it('returns false (never throws) when Resend returns an error payload', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    await expect(sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention] }))
      .resolves.toBe(false)
  })

  it('refuses to send with no recipient address or no events', async () => {
    expect(await sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: '', events: [mention] })).toBe(false)
    expect(await sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [] })).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('logs metadata only — never the recipient address or message content', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {})
    await sendTeamHubEmail({ staffId: 's1', staffName: 'Joe', staffEmail: 'joe@walztravels.com', events: [mention] })
    const logged = info.mock.calls.flat().join(' ')
    expect(logged).toContain('staffId=s1')
    expect(logged).not.toContain('joe@walztravels.com')
    expect(logged).not.toContain('can you check this booking?')
  })
})
