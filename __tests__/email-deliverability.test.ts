/**
 * Email deliverability — every outgoing email carries a text/plain
 * alternative (HTML-only mail is a classic spam-score factor), enforced
 * centrally by the hardened Resend wrapper, which every module must use.
 */

import { execSync } from 'child_process'
import { htmlToPlainText, Resend } from '@/lib/resend-hardened'

// The SDK client makes no network calls in these tests — we intercept send.
jest.mock('resend', () => {
  class Emails { send = jest.fn(async (p: unknown) => ({ data: { id: 'em_1' }, error: null, payload: p })) }
  class Resend { emails = new Emails(); constructor(_key?: string) {} }
  return { Resend }
})

describe('htmlToPlainText', () => {
  it('converts structure to readable lines and keeps link destinations', () => {
    const text = htmlToPlainText(
      '<html><head><style>p{color:red}</style></head><body>' +
      '<h1>Your booking</h1><p>Hello &amp; welcome,</p>' +
      '<ul><li>Flight ET0900</li><li>Seat 36D</li></ul>' +
      '<p><a href="https://walztravels.com/booking/123">View booking</a></p>' +
      '<script>alert(1)</script></body></html>')
    expect(text).toContain('Your booking')
    expect(text).toContain('Hello & welcome,')
    expect(text).toContain('- Flight ET0900')
    expect(text).toContain('View booking (https://walztravels.com/booking/123)')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('alert(1)')
    expect(text).not.toContain('<')
  })
  it('never yields entity debris or runaway blank lines', () => {
    const text = htmlToPlainText('<p>A&nbsp;B</p>\n\n\n<br><br><br><p>&#8358;5,000</p>')
    expect(text).toBe('A B\n\n₦5,000')
  })
})

describe('hardened Resend client', () => {
  it('the underlying send receives text derived from html, and explicit text is preserved', async () => {
    const client = new Resend('re_test')
    const r1 = await client.emails.send({ from: 'a@walztravels.com', to: 'b@x.com', subject: 's', html: '<p>Hi <b>there</b></p>' } as never) as unknown as { payload: { text?: string } }
    expect(r1.payload.text).toBe('Hi there')
    const r2 = await client.emails.send({ from: 'a@walztravels.com', to: 'b@x.com', subject: 's', html: '<p>Hi</p>', text: 'CUSTOM' } as never) as unknown as { payload: { text?: string } }
    expect(r2.payload.text).toBe('CUSTOM')
    const r3 = await client.emails.send({ from: 'a@walztravels.com', to: 'b@x.com', subject: 's', text: 'plain only' } as never) as unknown as { payload: { text?: string; html?: string } }
    expect(r3.payload.text).toBe('plain only')
    expect(r3.payload.html).toBeUndefined()
  })
})

describe('import pin', () => {
  it('no module imports the resend SDK directly except the hardened wrapper', () => {
    const out = execSync(
      `grep -rl "from ['\\"]resend['\\"]" lib app --include='*.ts' --include='*.tsx' || true`,
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
    expect(out).toEqual(['lib/resend-hardened.ts'])
  })
})
