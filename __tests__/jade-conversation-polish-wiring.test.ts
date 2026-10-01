/**
 * Jade Conversation Polish — source-level parity checks between
 * PortalJadeChat.tsx (the reference surface) and the Trip Planner "Ask
 * Jade" chat panel in app/plan/[tripId]/page.tsx (the surface that was
 * brought into alignment). Source-string assertions, matching the
 * convention established by jade-trip-planner-icon-consistency.test.ts —
 * these pin the exact wiring so the two surfaces cannot silently drift
 * apart again.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

const PORTAL = read('app/dashboard/jade/_components/PortalJadeChat.tsx')
const PLANNER = read('app/plan/[tripId]/page.tsx')

describe('item 1 — JadeMessageContent reuse in the Trip Planner chat panel', () => {
  it('imports JadeMessageContent from the shared component', () => {
    expect(PLANNER).toContain("import JadeMessageContent from '@/components/portal/JadeMessageContent'")
  })

  it('renders assistant content through JadeMessageContent, not raw {msg.content}', () => {
    expect(PLANNER).toContain('{msg.role === \'user\' ? msg.content : <JadeMessageContent text={msg.content} />}')
  })

  it('does not alter JadeMessageContent.tsx itself (new call site only)', () => {
    // The module's exported security-contract functions are untouched.
    const module = read('components/portal/JadeMessageContent.tsx')
    expect(module).toContain('export function tokenizeInline')
    expect(module).toContain('export function parseBlocks')
    expect(module).toContain('export default function JadeMessageContent')
  })
})

describe('item 2 — bubble presentation parity (solid gold user bubble, bordered assistant bubble, flat corners)', () => {
  const userBubble = "'bg-[#C9A84C] text-[#0B1F3A] font-medium rounded-br-sm'"
  const assistantBubble = "'bg-[#0B1F3A] border border-white/8 text-white/90 rounded-bl-sm'"

  it('PortalJadeChat (reference) uses the solid-gold user / bordered-assistant bubble classes', () => {
    expect(PORTAL).toContain(userBubble)
    expect(PORTAL).toContain(assistantBubble)
  })

  it('the Trip Planner panel now uses the exact same bubble classes as PortalJadeChat', () => {
    expect(PLANNER).toContain(userBubble)
    expect(PLANNER).toContain(assistantBubble)
  })

  it('the Trip Planner panel no longer uses the old translucent user bubble', () => {
    expect(PLANNER).not.toContain('bg-[#C9A84C]/20 text-white rounded-tr-sm')
  })
})

describe('item 3 — avatar size/fill parity', () => {
  const avatarDiv = 'w-7 h-7 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0'
  const avatarIcon = '<ConciergeBell className="w-3.5 h-3.5 text-[#0B1F3A]" />'

  it('PortalJadeChat (reference) avatar treatment', () => {
    expect(PORTAL).toContain(avatarDiv)
    expect(PORTAL).toContain(avatarIcon)
  })

  it('Trip Planner avatar treatment matches', () => {
    expect(PLANNER).toContain(avatarDiv)
    expect(PLANNER).toContain(avatarIcon)
  })

  it('Trip Planner no longer uses the old w-8 h-8 translucent-fill avatar', () => {
    expect(PLANNER).not.toContain('w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/30')
  })
})

describe('item 4 — textarea auto-grow wiring', () => {
  const growSnippet = "const t = e.currentTarget\n                      t.style.height = 'auto'\n                      t.style.height = `${Math.min(t.scrollHeight, 128)}px`"

  it('PortalJadeChat (reference) has the onInput height-adjustment pattern', () => {
    expect(PORTAL).toMatch(/t\.style\.height = 'auto'/)
    expect(PORTAL).toMatch(/t\.style\.height = `\$\{Math\.min\(t\.scrollHeight, 128\)\}px`/)
  })

  it('Trip Planner textarea now has the same onInput height-adjustment pattern', () => {
    expect(PLANNER).toMatch(/t\.style\.height = 'auto'/)
    expect(PLANNER).toMatch(/t\.style\.height = `\$\{Math\.min\(t\.scrollHeight, 128\)\}px`/)
  })
})

describe('item 5 — accessibility attributes present on both surfaces', () => {
  for (const [name, src] of [['PortalJadeChat', PORTAL], ['Trip Planner panel', PLANNER]] as const) {
    it(`${name}: textarea has aria-label="Message to Jade"`, () => {
      expect(src).toContain('aria-label="Message to Jade"')
    })
    it(`${name}: send button has aria-label="Send message"`, () => {
      expect(src).toContain('aria-label="Send message"')
    })
    it(`${name}: typing indicator has aria-label="Jade is thinking"`, () => {
      expect(src).toContain('aria-label="Jade is thinking"')
    })
    it(`${name}: message list has role="log" and aria-live="polite"`, () => {
      expect(src).toContain('role="log"')
      expect(src).toContain('aria-live="polite"')
    })
  }
})

describe('item 6 — client-side retry, restrained red treatment only (design decision)', () => {
  for (const [name, src] of [['PortalJadeChat', PORTAL], ['Trip Planner panel', PLANNER]] as const) {
    it(`${name}: catch block marks the failed message instead of pushing a fake assistant apology`, () => {
      expect(src).toMatch(/failed: true/)
    })
    it(`${name}: renders a small inline "Failed to send" + Retry, not a banner`, () => {
      expect(src).toContain('Failed to send')
      expect(src).toMatch(/>\s*Retry\s*</)
      expect(src).not.toContain('role="alert"')
    })
    it(`${name}: the failure affordance uses restrained red text, not a filled red bubble`, () => {
      const idx = src.indexOf('Failed to send')
      expect(idx).toBeGreaterThan(-1)
      // Look only at the small JSX block around the affordance itself —
      // text-red-400 for the icon/label/Retry link, no red background
      // (a filled bubble) anywhere in that block.
      const affordanceBlock = src.slice(idx - 400, idx + 400)
      expect(affordanceBlock).toMatch(/text-red-400/)
      expect(affordanceBlock).not.toMatch(/bg-red-(400|500|600)/)
    })
  }

  it('PortalJadeChat catch block no longer unconditionally pushes the old apology text', () => {
    const catchBlock = PORTAL.slice(PORTAL.indexOf('} catch {'), PORTAL.indexOf('} finally {', PORTAL.indexOf('} catch {')))
    expect(catchBlock).not.toContain("I'm having a technical issue")
  })

  it('Trip Planner catch block no longer unconditionally pushes the old apology text', () => {
    const catchBlock = PLANNER.slice(PLANNER.indexOf('} catch {'), PLANNER.indexOf('} finally {', PLANNER.indexOf('} catch {')))
    expect(catchBlock).not.toContain('Sorry, something went wrong')
  })
})

describe('item 7 — guarded auto-scroll on both surfaces', () => {
  for (const [name, src] of [['PortalJadeChat', PORTAL], ['Trip Planner panel', PLANNER]] as const) {
    it(`${name}: imports the shared isNearBottom scroll-guard predicate`, () => {
      expect(src).toContain("from '@/lib/jade-club/chat-scroll'")
      expect(src).toMatch(/isNearBottom\(/)
    })
    it(`${name}: has a "New message" pill affordance`, () => {
      expect(src).toContain('New message')
    })
  }
})

describe('item 8 — suggested prompts gated to the empty state in the Trip Planner panel', () => {
  it('the Trip Planner quick-suggestions block is now gated behind isJadeEmpty', () => {
    expect(PLANNER).toMatch(/\{isJadeEmpty && \(\s*<div className="px-4 pb-2 flex gap-2 flex-wrap">/)
  })

  it('PortalJadeChat (reference) gates its suggested prompts behind isEmpty — unchanged', () => {
    expect(PORTAL).toContain('isEmpty && (')
  })
})

describe('Hard boundaries — no Jade backend/model/payment files touched by this pass', () => {
  it('PortalJadeChat still posts to the same endpoint with the same contextHint-only contract', () => {
    expect(PORTAL).toContain("'/api/jade/portal/chat'")
    expect(PORTAL).toContain('contextHint:')
  })

  it('Trip Planner still posts to the same two endpoints with no new contract fields', () => {
    expect(PLANNER).toContain("'/api/chat/jade'")
    expect(PLANNER).toContain('/api/trips/${tripId}/generate')
  })
})
