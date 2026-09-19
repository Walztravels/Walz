/**
 * INBOX UX-3 — conversation rail + queue experience pins.
 *
 *  - formatPreview: pure last-message → display string (markdown stripped,
 *    whitespace collapsed, attachment fallbacks, never HTML-parsing).
 *  - Channel truth: ConversationItem reuses types.channelLabel (UX-2's
 *    Channel::TwilioSms → 'WhatsApp' fact); the mislabeling local duplicate
 *    is gone.
 *  - Honest counts: page passes resolved: null (authoritative resolved count
 *    is UX-5); a null count renders NO pill badge. all/mine/unassigned stay
 *    loaded-list counts.
 *  - State priority: failure → loading skeletons → search-empty → per-tab
 *    genuine empty (incident pin: failure evaluated BEFORE any empty).
 *  - Rail surface: tokenized dark navy (bg-walz-navy, walz-gold accents,
 *    no hex literals, no amber).
 */

import fs from 'fs'
import path from 'path'

import { formatPreview } from '../app/admin/inbox/components/formatPreview'
import { channelLabel, CWConversation } from '../app/admin/inbox/types'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const list = () => read('app/admin/inbox/components/ConversationList.tsx')
const item = () => read('app/admin/inbox/components/ConversationItem.tsx')
const page = () => read('app/admin/inbox/page.tsx')
const fmt  = () => read('app/admin/inbox/components/formatPreview.ts')

// ── formatPreview ─────────────────────────────────────────────────────────────

describe('formatPreview — pure preview text', () => {
  it('strips markdown emphasis markers (**, *, _)', () => {
    expect(formatPreview({ content: '**Bold** and *starred* and _underscored_' }))
      .toBe('Bold and starred and underscored')
  })

  it('collapses newlines and whitespace runs to single spaces and trims', () => {
    expect(formatPreview({ content: '  Hello\n\nthere\t   world  ' })).toBe('Hello there world')
  })

  it('maps attachment types when content is empty', () => {
    expect(formatPreview({ content: '', attachments: [{ file_type: 'image' }] })).toBe('📷 Image')
    expect(formatPreview({ content: '', attachments: [{ file_type: 'audio' }] })).toBe('🎙 Voice message')
    expect(formatPreview({ content: '', attachments: [{ file_type: 'video' }] })).toBe('🎞 Video')
  })

  it('unknown attachment types fall back to 📎 + file_name, else 📎 Document', () => {
    expect(formatPreview({ content: '', attachments: [{ file_type: 'file', file_name: 'quote.pdf' }] }))
      .toBe('📎 quote.pdf')
    expect(formatPreview({ content: '', attachments: [{ file_type: 'file' }] })).toBe('📎 Document')
  })

  it('empty content and no attachments → em dash; so do null/undefined messages', () => {
    expect(formatPreview({ content: '' })).toBe('—')
    expect(formatPreview({ content: '   ', attachments: [] })).toBe('—')
    expect(formatPreview(undefined)).toBe('—')
    expect(formatPreview(null)).toBe('—')
  })

  it('never parses HTML — markup stays a literal string (React escapes on render)', () => {
    expect(formatPreview({ content: '<script>alert(1)</script> <b>hi</b>' }))
      .toBe('<script>alert(1)</script> <b>hi</b>')
  })

  it('is pure: frozen input, no mutation, deterministic output', () => {
    const msg = Object.freeze({
      content: Object.freeze('**Trip** to\nParis') as string,
      attachments: Object.freeze([]) as never[],
    })
    const a = formatPreview(msg)
    const b = formatPreview(msg)
    expect(a).toBe('Trip to Paris')
    expect(b).toBe(a)
    expect(msg.content).toBe('**Trip** to\nParis')
  })
})

// ── Channel label reuse ───────────────────────────────────────────────────────

describe('channel truth — one channelLabel, from types.ts', () => {
  it('ConversationItem imports channelLabel from ../types and has no local duplicate', () => {
    expect(item()).toMatch(/import \{[^}]*channelLabel[^}]*\} from '\.\.\/types'/)
    expect(item()).not.toContain('function channelLabel')
    expect(item()).not.toContain("'SMS'") // the mislabeling local mapping is gone
  })

  it("the retired local 'voice' → 'Call' mapping was absorbed into types.channelLabel", () => {
    const conv = (channel?: string) => ({ channel, meta: { sender: {} } } as unknown as CWConversation)
    expect(channelLabel(conv('Channel::Voice'))).toBe('Call')
    expect(channelLabel(conv('voice'))).toBe('Call')
  })
})

// ── Honest counts ─────────────────────────────────────────────────────────────

describe('counts honesty — resolved is null until UX-5', () => {
  it('the page passes resolved: null (never a wrong number computed over an open-status payload)', () => {
    expect(page()).toMatch(/resolved:\s*null/)
    expect(page()).not.toContain("allPayload.filter(c => c.status === 'resolved')")
  })

  it('the counts prop admits null and a null count renders NO badge', () => {
    expect(list()).toContain('resolved: number | null')
    expect(list()).toContain('{n != null && n > 0 && (')
  })
})

// ── State priority ────────────────────────────────────────────────────────────

describe('list body states — failure → loading → search-empty → genuine empty', () => {
  it('failure state keeps its incident-pinned literals and retry wiring', () => {
    expect(list()).toContain('Could not load conversations.')
    expect(list()).toContain('Retry')
    expect(list()).toContain('onRetry')
  })

  it('states appear in priority order in the source', () => {
    const s = list()
    const fail     = s.indexOf('Could not load conversations.')
    const skeleton = s.indexOf('motion-safe:animate-pulse')
    const searchE  = s.indexOf('No conversations match your search.')
    const tabEmpty = s.indexOf('No conversations yet.')
    expect(fail).toBeGreaterThan(-1)
    expect(fail).toBeLessThan(skeleton)
    expect(skeleton).toBeLessThan(searchE)
    expect(searchE).toBeLessThan(tabEmpty)
  })

  it('each queue has its own genuine-empty copy', () => {
    const s = list()
    expect(s).toContain('No conversations yet.')            // 'all' — keeps the incident 'No conversations' substring
    expect(s).toContain('No conversations assigned to you.')
    expect(s).toContain('No unassigned conversations.')
    expect(s).toContain('No resolved conversations.')
  })

  it('skeletons pulse only under motion-safe (reduced-motion users get static blocks)', () => {
    const s = list()
    const all  = (s.match(/animate-pulse/g) ?? []).length
    const safe = (s.match(/motion-safe:animate-pulse/g) ?? []).length
    expect(safe).toBeGreaterThan(0)
    expect(all).toBe(safe)
  })

  it('the page wires its loading state into the list', () => {
    expect(page()).toContain('loading={loading}')
  })
})

// ── Queue pills ───────────────────────────────────────────────────────────────

describe('queue pills — scrollable tablist, no wrap regression', () => {
  it('the container scrolls horizontally and never wraps (UX-1 tab overflow defect stays dead)', () => {
    expect(list()).toContain('overflow-x-auto whitespace-nowrap')
  })

  it('pills carry tablist/tab/aria-selected semantics and arrow-key movement', () => {
    const s = list()
    expect(s).toContain('role="tablist"')
    expect(s).toContain('role="tab"')
    expect(s).toContain('aria-selected')
    expect(s).toContain("'ArrowLeft'")
    expect(s).toContain("'ArrowRight'")
  })

  it('pill anatomy: shrink-0 rounded pill with the walz-gold active state', () => {
    const s = list()
    expect(s).toContain('shrink-0 rounded-full px-3 min-h-[32px]')
    expect(s).toContain('bg-walz-gold/15 text-walz-gold border border-walz-gold/30')
    expect(s).toContain('text-white/50 border border-white/10 hover:text-white/80')
  })

  it("the 'All' and 'Unassigned' queues stay canViewAll-conditional (P1 hotfix, 2026-09-19 — Fix 4)", () => {
    const s = list()
    const gated = s.slice(s.indexOf('const TABS'), s.indexOf('Arrow left/right'))
    expect(gated).toContain('canViewAll ? [')
    expect(gated).toContain("{ key: 'all' as Tab,         label: 'All'         }")
    expect(gated).toContain("{ key: 'unassigned' as Tab,  label: 'Unassigned'  }")
    // 'Mine' and 'Resolved' remain unconditional — every staff member gets them.
    const alwaysOn = gated.slice(gated.indexOf('] : [])'))
    expect(alwaysOn).toContain("{ key: 'mine',       label: 'Mine'       }")
    expect(alwaysOn).toContain("{ key: 'resolved',   label: 'Resolved'   }")
  })
})

// ── Selected vs focus + keyboard nav ─────────────────────────────────────────

describe('selection and keyboard focus are distinct affordances', () => {
  it('selected = soft surface + gold left rule', () => {
    expect(item()).toContain('bg-white/5 border-l-2 border-l-walz-gold')
  })

  it('keyboard focus = separate inset gold ring, focus-visible only', () => {
    expect(item()).toContain('focus-visible:ring-2 ring-inset ring-walz-gold/60')
  })

  it('cards are keyboard-navigable: ArrowUp/ArrowDown roam over data-conv-card buttons', () => {
    expect(item()).toContain('data-conv-card')
    const s = list()
    expect(s).toContain("'ArrowDown'")
    expect(s).toContain("'ArrowUp'")
    expect(s).toContain('data-conv-card')
  })
})

// ── Unread treatment ──────────────────────────────────────────────────────────

describe('unread treatment — dot + weight + badge, tokenized gold', () => {
  it('unread rows get the gold avatar dot, semibold white name and gold count badge', () => {
    const s = item()
    expect(s).toContain('w-3 h-3 rounded-full bg-walz-gold') // dot
    expect(s).toContain("'font-semibold text-white'")
    expect(s).toContain('bg-walz-gold text-walz-deep-navy')  // count badge
    expect(s).toContain("'99+'")
  })

  it('read rows recede rather than disappear', () => {
    expect(item()).toContain("'font-medium text-white/75'")
  })
})

// ── Name fallback + time ──────────────────────────────────────────────────────

describe('name fallback chain — never a raw numeric id', () => {
  it('name || phone_number || email || channel-aware placeholder', () => {
    const s = item()
    expect(s).toMatch(/sender\?\.name \|\| sender\?\.phone_number \|\| sender\?\.email/)
    expect(s).toContain("'Website Visitor'")
    expect(s).toContain("'Unknown Contact'")
    expect(s).not.toMatch(/\bsender\?\.id\b/)
  })

  it("missing last_activity_at renders '' — never 'now' for missing data", () => {
    expect(item()).toContain("conv.last_activity_at ? timeAgo(conv.last_activity_at) : ''")
  })
})

// ── A11y + surface ────────────────────────────────────────────────────────────

describe('a11y and tokenized rail surface', () => {
  it('search and settings are labelled; the full name lives in a title attr', () => {
    const s = list()
    expect(s).toContain('aria-label="Search conversations"')
    expect(s).toContain('placeholder="Search conversations…"')
    expect(s).toContain('aria-label="Clear search"')
    expect(s).toContain('aria-label="Inbox settings"')
    expect(item()).toContain('title={name}')
  })

  it('settings button has a ≥44px hit area', () => {
    expect(list()).toContain('min-w-[44px] min-h-[44px]')
  })

  it('P1 hotfix closing fix: Inbox settings gear is gated on the real settings_integrations permission, not a dead role-string bucket', () => {
    // Round 2 of the P1 hotfix removed the hardcoded EMAIL_TO_AGENT map,
    // whose only remaining consumer was this gate's `profile?.role === 'admin'`
    // check — no REAL staff.role value is ever literally 'admin', so that
    // check regressed to permanently false for the one account that relied
    // on the map's shim. The correct fix reads the actual permission that
    // gates the underlying StaffModal mutation routes (settings_integrations,
    // see app/api/admin/routing/agents/route.ts), which any legitimately
    // permissioned staff member holds regardless of role.
    const s = list()
    expect(s).toContain("profile?.permissions?.settings_integrations === true")
    expect(s).not.toContain("profile?.role === 'admin'")
  })

  it('the rail root is bg-walz-navy and the touched files carry no hex literals and no amber', () => {
    expect(list()).toContain('bg-walz-navy')
    for (const s of [list(), item(), fmt()]) {
      expect(s).not.toMatch(/#[0-9a-fA-F]{6}\b/)
      expect(s).not.toMatch(/\bamber-/)
    }
  })
})
