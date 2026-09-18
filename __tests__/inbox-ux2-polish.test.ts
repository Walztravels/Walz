/**
 * INBOX UX-2 VISUAL POLISH — five-item patch.
 *
 *  1. Mobile Jade discoverability: bare ✨ icon → compact labeled `✨ Jade`
 *     chip (44px target, gold sparkle + muted-strong word per M3).
 *  2. Desktop Ask Jade: bordered ghost secondary action, clearly secondary
 *     to the blue Send. No FAB.
 *  3. Mobile header compaction: subtitle = `<channel word> · #id` (no status);
 *     row 2 = AssignDropdown · StatusControl — status renders EXACTLY once.
 *  4. channelLabel(conv): Chatwoot channel identifiers → human words.
 *  5. Safe message formatting: formatMessageText renders **bold** / *italic* /
 *     _italic_ with React elements ONLY — no dangerouslySetInnerHTML, no HTML
 *     parsing, no auto-linking; HTML in content stays escaped literal text.
 */
import fs from 'fs'
import path from 'path'
import { isValidElement } from 'react'
import { tokenizeInline, formatMessageText } from '../app/admin/inbox/components/formatMessageText'
import { channelLabel, CWConversation } from '../app/admin/inbox/types'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const chat   = read('app/admin/inbox/components/ChatWindow.tsx')
const reply  = read('app/admin/inbox/components/ReplyBox.tsx')
const bubble = read('app/admin/inbox/components/MessageBubble.tsx')
const fmt    = read('app/admin/inbox/components/formatMessageText.tsx')
const types  = read('app/admin/inbox/types.ts')

// ---------------------------------------------------------------------------
// Item 5 — formatMessageText / tokenizeInline (pure display formatting)
// ---------------------------------------------------------------------------
describe('tokenizeInline — pure token splitter', () => {
  it('splits **bold** into a bold token', () => {
    expect(tokenizeInline('a **b** c')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'bold', content: 'b' },
      { type: 'text', content: ' c' },
    ])
  })

  it('splits *italic* and _italic_ into italic tokens', () => {
    expect(tokenizeInline('*hi* and _yo_')).toEqual([
      { type: 'italic', content: 'hi' },
      { type: 'text', content: ' and ' },
      { type: 'italic', content: 'yo' },
    ])
  })

  it('unclosed markers stay literal text', () => {
    expect(tokenizeInline('**oops')).toEqual([{ type: 'text', content: '**oops' }])
    expect(tokenizeInline('*oops')).toEqual([{ type: 'text', content: '*oops' }])
    expect(tokenizeInline('_oops')).toEqual([{ type: 'text', content: '_oops' }])
  })

  it('nested markers degrade gracefully — bold wins, inner markers stay literal', () => {
    expect(tokenizeInline('**a *b* c**')).toEqual([{ type: 'bold', content: 'a *b* c' }])
  })

  it('preserves newlines inside text tokens (whitespace-pre-wrap handles them)', () => {
    expect(tokenizeInline('line1\nline2')).toEqual([{ type: 'text', content: 'line1\nline2' }])
  })

  it('markers never span line breaks', () => {
    expect(tokenizeInline('*a\nb*')).toEqual([{ type: 'text', content: '*a\nb*' }])
  })

  it('never mutates the stored content — pure display', () => {
    const input = '**bold** stays'
    const before = `${input}`
    tokenizeInline(input)
    formatMessageText(input)
    expect(input).toBe(before)
    // Deterministic: repeated calls agree.
    expect(tokenizeInline(input)).toEqual(tokenizeInline(input))
  })
})

describe('formatMessageText — React elements only (security)', () => {
  it('<script>alert(1)</script> renders as literal text (plain string → React escapes)', () => {
    const out = formatMessageText('<script>alert(1)</script>')
    expect(out).toBe('<script>alert(1)</script>')
    expect(typeof out).toBe('string')
  })

  it('**<img onerror>** bolds the LITERAL text — a <strong> element, never HTML', () => {
    const out = formatMessageText('**<img onerror>**') as any[]
    expect(Array.isArray(out)).toBe(true)
    const strong = out.find(el => isValidElement(el) && el.type === 'strong') as any
    expect(strong).toBeTruthy()
    expect(strong.props.children).toBe('<img onerror>')
    expect(strong.props.dangerouslySetInnerHTML).toBeUndefined()
  })

  it('bold/italic render as <strong>/<em> elements with string children', () => {
    const out = formatMessageText('**b** and *i*') as any[]
    const kinds = out.filter(el => isValidElement(el)).map((el: any) => el.type)
    expect(kinds).toContain('strong')
    expect(kinds).toContain('em')
    const em = out.find((el: any) => isValidElement(el) && el.type === 'em') as any
    expect(em.props.children).toBe('i')
  })

  it('module contract: no dangerouslySetInnerHTML, no HTML parsing, no linkify', () => {
    // The doc comment names the banned APIs — check the CODE, comments stripped.
    const code = fmt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toContain('dangerouslySetInnerHTML')
    expect(code).not.toContain('innerHTML')
    expect(code).not.toContain('DOMParser')
    expect(code).not.toContain('href')            // no auto-linking
    expect(code).not.toMatch(/https?:/)
  })
})

describe('MessageBubble uses the safe formatter', () => {
  it('both body types (regular + private note) render through formatMessageText', () => {
    expect(bubble).toContain("import { formatMessageText } from './formatMessageText'")
    expect((bubble.match(/\{formatMessageText\(msg\.content\)\}/g) ?? []).length).toBe(2)
    // No raw body text remains on the bubble paragraphs.
    expect(bubble).not.toContain('whitespace-pre-wrap">{msg.content}')
  })

  it('no dangerouslySetInnerHTML anywhere in the bubble; no auto-linking added', () => {
    expect(bubble).not.toContain('dangerouslySetInnerHTML')
    // The only anchors are attachment downloads/previews — never linkified body text.
    expect(bubble).not.toMatch(/href=\{msg\.content/)
  })
})

// ---------------------------------------------------------------------------
// Item 4 — channelLabel
// ---------------------------------------------------------------------------
const conv = (channel?: string, metaChannel?: string): CWConversation =>
  ({ id: 1, channel, meta: { channel: metaChannel, sender: { id: 1, name: 'X', type: 'contact' } } } as CWConversation)

describe('channelLabel — human channel words', () => {
  it.each([
    ['Channel::Whatsapp',     'WhatsApp'],
    ['Channel::Instagram',    'Instagram'],
    ['instagram',             'Instagram'],
    ['Channel::FacebookPage', 'Messenger'],
    ['Channel::WebWidget',    'Web'],
    ['Channel::Sms',          'SMS'],
    ['Channel::TwilioSms',    'WhatsApp'],   // deployment fact: WhatsApp inboxes are Twilio-backed
    ['Channel::Email',        'Email'],
    ['Channel::Api',          'Chat'],
  ])('%s → %s', (id, label) => {
    expect(channelLabel(conv(id))).toBe(label)
  })

  it('fallback strips the Channel:: prefix on unknown identifiers', () => {
    expect(channelLabel(conv('Channel::Telegram'))).toBe('Telegram')
  })

  it('empty/missing channel falls back to Chat', () => {
    expect(channelLabel(conv(undefined))).toBe('Chat')
    expect(channelLabel(conv(''))).toBe('Chat')
    expect(channelLabel(conv('Channel::'))).toBe('Chat')
  })

  it('reads the SAME source as channelIcon — conv.channel ?? conv.meta.channel', () => {
    expect(channelLabel(conv(undefined, 'Channel::Whatsapp'))).toBe('WhatsApp')
    expect(types).toContain('conv.channel ?? conv.meta?.channel')
  })
})

// ---------------------------------------------------------------------------
// Items 1 + 2 — Jade entries in ReplyBox
// ---------------------------------------------------------------------------
describe('mobile Jade discoverability — labeled chip', () => {
  it('the mobile control is a labeled `✨ Jade` chip, not a bare icon', () => {
    const mdHidden  = reply.indexOf('md:hidden')
    const mobileBtn = reply.slice(reply.lastIndexOf('<button', mdHidden), reply.indexOf('</button>', mdHidden))
    expect(mobileBtn).toContain('<span className="text-walz-gold text-sm leading-none">✨</span> Jade')
    // M3 contrast: the word reads in muted-strong, only the sparkle is gold.
    expect(mobileBtn).toContain('text-walz-muted-strong')
    // 44px touch target survives.
    expect(mobileBtn).toContain('min-w-[44px] min-h-[44px]')
    expect(mobileBtn).toContain('openCopilot')
  })
})

describe('desktop Ask Jade — compact bordered secondary action', () => {
  it('bordered ghost button, gold sparkle + muted-strong word, hover to navy', () => {
    expect(reply).toContain('border border-walz-border rounded-lg px-2.5 py-1.5 hover:bg-walz-navy/5')
    expect(reply).toContain('<span className="text-walz-gold">✨</span> Ask Jade')
    expect(reply).toContain('text-walz-muted-strong hover:text-walz-navy')
  })

  it('clearly secondary — Send keeps the only blue fill in the composer; no FAB', () => {
    expect((reply.match(/bg-blue-600/g) ?? []).length).toBe(1)
    expect(reply).not.toContain('fixed')
  })
})

// ---------------------------------------------------------------------------
// Item 3 — mobile header compaction
// ---------------------------------------------------------------------------
describe('ChatWindow header — compact, status EXACTLY once', () => {
  it('subtitle uses the human channel label + id at both breakpoints, no status', () => {
    expect(chat).toContain('{channelIcon(conv)} {channelLabel(conv)} · #{conv.id}')
    expect(chat).not.toContain('#{conv.id} · {conv.status}')
  })

  it('status renders exactly once — only StatusControl carries the status text', () => {
    // No plain interpolated status anywhere in the component.
    expect((chat.match(/\{conv\.status\}/g) ?? []).length).toBe(0)
    // The Open/Resolved label lives in exactly one place: StatusControl.
    expect((chat.match(/isResolved \? 'Resolved' : 'Open'/g) ?? []).length).toBe(1)
  })

  it("mobile row 2 = AssignDropdown · StatusControl — no 'Assigned:' label, no duplicated 'open'", () => {
    const row2 = chat.slice(chat.indexOf('md:hidden flex items-center'), chat.indexOf('</div>', chat.indexOf('md:hidden flex items-center')))
    expect(row2).toContain('AssignDropdown compact')
    expect(row2).toContain('<StatusControl isResolved={isResolved} onResolve={onResolve} onReopen={onReopen} />')
    expect(chat).not.toContain('Assigned:')
    // Reduced vertical padding (py-1.5 max).
    expect(chat).toMatch(/md:hidden flex items-center[^"]*px-3 pb-1\.5/)
    expect(chat).not.toMatch(/md:hidden flex items-center[^"]*pb-2/)
  })

  it('desktop row-1 controls untouched; Lookup/Resolve header buttons stay retired', () => {
    expect(chat).toContain('hidden md:flex items-center gap-2')
    const beforeStatusControl = chat.slice(0, chat.indexOf('function StatusControl'))
    expect(beforeStatusControl).not.toMatch(/>\s*Resolve\s*</)
    expect(beforeStatusControl).not.toMatch(/>\s*Lookup\s*</)
  })
})

// ---------------------------------------------------------------------------
// Token discipline — no hex literals in touched files
// ---------------------------------------------------------------------------
describe('no hex literals in touched files (walz tokens only)', () => {
  it.each([
    ['ChatWindow', chat],
    ['ReplyBox', reply],
    ['MessageBubble', bubble],
    ['formatMessageText', fmt],
    ['types', types],
  ])('%s has no hex color literals', (_name, src) => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })
})
