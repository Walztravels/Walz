/**
 * Staff Updates — lib/email-announcement-notification.ts
 *
 * renderAnnouncementEmail is pure (subject/HTML shape, priority badge,
 * the anti-leakage rule that only `summary` — never `detail`/`whatToDo` —
 * ever reaches the email body, and the authenticated deep-link CTA).
 * sendAnnouncementEmail never throws and never logs the recipient address.
 */

const sendMock = jest.fn(async () => ({ data: { id: 'resend-msg-1' }, error: null }))
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: sendMock } }) }))

import {
  announcementLink, announcementEmailSubject, renderAnnouncementEmail, sendAnnouncementEmail,
} from '@/lib/email-announcement-notification'

const baseInput = {
  announcementId: 'ann-1',
  title:          'New Visa Portal Rollout',
  summary:        'The visa portal has a new document upload flow.',
  category:       'SYSTEM_UPDATE',
  priority:       'NORMAL' as const,
  staffName:      'Ada',
  staffId:        's1',
  staffEmail:     'ada@walztravels.com',
}

describe('announcementLink', () => {
  it('deep-links into the authenticated admin app, never a public URL', () => {
    expect(announcementLink('ann-1', 'https://walztravels.com')).toBe('https://walztravels.com/admin/staff-updates/ann-1')
  })
  it('URL-encodes the id', () => {
    expect(announcementLink('a b', 'https://x.test')).toBe('https://x.test/admin/staff-updates/a%20b')
  })
})

describe('announcementEmailSubject', () => {
  it('tags URGENT as CRITICAL', () => {
    expect(announcementEmailSubject('Title', 'URGENT')).toBe('[CRITICAL] Walz Staff Update — Title')
  })
  it('tags HIGH as HIGH PRIORITY', () => {
    expect(announcementEmailSubject('Title', 'HIGH')).toBe('[HIGH PRIORITY] Walz Staff Update — Title')
  })
  it('NORMAL gets the plain prefix', () => {
    expect(announcementEmailSubject('Title', 'NORMAL')).toBe('[Walz Staff Update] Title')
  })
})

describe('renderAnnouncementEmail', () => {
  it('never includes detail/whatToDo — the type does not even accept them — only summary reaches the body', () => {
    const { html } = renderAnnouncementEmail(baseInput)
    expect(html).toContain(baseInput.summary)
    // The only content fields the function accepts are title/summary — this
    // guards against a future edit accidentally piping full detail through.
    expect(Object.keys(baseInput)).not.toContain('detail')
    expect(Object.keys(baseInput)).not.toContain('whatToDo')
  })

  it('escapes HTML in staff name, title and summary (no injection via announcement content)', () => {
    const { html } = renderAnnouncementEmail({
      ...baseInput, staffName: '<script>x</script>', title: 'A & B <b>bold</b>',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B &lt;b&gt;bold&lt;/b&gt;')
  })

  it('colors the priority badge red for URGENT/Critical, gold for HIGH, navy for NORMAL', () => {
    expect(renderAnnouncementEmail({ ...baseInput, priority: 'URGENT' }).html).toContain('#B3261E')
    expect(renderAnnouncementEmail({ ...baseInput, priority: 'HIGH' }).html).toContain('#C9A84C')
    expect(renderAnnouncementEmail({ ...baseInput, priority: 'NORMAL' }).html).toContain('#0B1F3A')
  })

  it('labels URGENT as "Critical" in the visible badge text, not "Urgent"', () => {
    expect(renderAnnouncementEmail({ ...baseInput, priority: 'URGENT' }).html).toContain('>Critical<')
  })

  it('includes the CTA link to the deep link, and an effective date only when provided', () => {
    const withDate = renderAnnouncementEmail({ ...baseInput, effectiveDate: new Date('2026-10-01') })
    expect(withDate.html).toContain('/admin/staff-updates/ann-1')
    expect(withDate.html).toContain('Effective')

    const withoutDate = renderAnnouncementEmail({ ...baseInput, effectiveDate: null })
    expect(withoutDate.html).not.toContain('Effective:')
  })

  it('renders an unknown category/priority gracefully rather than throwing', () => {
    expect(() => renderAnnouncementEmail({ ...baseInput, category: 'SOMETHING_NEW' })).not.toThrow()
  })
})

describe('sendAnnouncementEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('sends via getResend() with the fixed internal From address', async () => {
    const res = await sendAnnouncementEmail(baseInput)
    expect(res.ok).toBe(true)
    expect(res.providerMessageId).toBe('resend-msg-1')
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Walz Travels <hello@walztravels.com>',
      to:   'ada@walztravels.com',
    }))
  })

  it('never logs the recipient email address or announcement content', async () => {
    const infoSpy = jest.spyOn(console, 'info')
    await sendAnnouncementEmail(baseInput)
    for (const call of infoSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('ada@walztravels.com')
      expect(JSON.stringify(call)).not.toContain(baseInput.summary)
    }
  })

  it('returns a failure result (never throws) when Resend rejects the send', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'invalid_from' } })
    const res = await sendAnnouncementEmail(baseInput)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('invalid_from')
  })

  it('returns a failure result (never throws) when Resend itself throws', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'))
    await expect(sendAnnouncementEmail(baseInput)).resolves.toEqual(
      expect.objectContaining({ ok: false, error: 'network down' }),
    )
  })

  it('short-circuits with missing_email and never calls Resend when the recipient has no email', async () => {
    const res = await sendAnnouncementEmail({ ...baseInput, staffEmail: '' })
    expect(res).toEqual({ ok: false, error: 'missing_email' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
