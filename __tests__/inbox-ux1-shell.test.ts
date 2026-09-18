/**
 * INBOX UX-1 — inbox viewport ownership + responsive shell.
 *
 * Architecture pins:
 *  - The inbox route owns the box between AdminHeader and (mobile) MobileNav:
 *    [data-inbox-fullbleed] on the page root + a main:has() rule in globals.css
 *    zero the shell's padding and page scroll, so the only scrollers are the
 *    conversation list, ChatWindow's message viewport and the ClientInfo panel.
 *  - Mobile space reservation comes from one token (--walz-bottom-nav-h +
 *    env(safe-area-inset-bottom)) shared by MobileNav and the fullbleed rule.
 *  - Chrome z-scale lives in lib/admin/chrome.ts: nav 30 < fab 40 < drawer 60
 *    < modal 70 < toast 80.
 *  - No FAB renders over the inbox (Jade widget + Twilio mobile FAB hide on
 *    /admin/inbox via the isBuilder pathname pattern).
 */

import fs from 'fs'
import path from 'path'

import {
  BOTTOM_NAV_HEIGHT_PX,
  BOTTOM_NAV_HEIGHT_VAR,
  BOTTOM_NAV_SAFE_VAR,
  Z_INDEX,
} from '@/lib/admin/chrome'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const page    = read('app/admin/inbox/page.tsx')
const globals = read('app/globals.css')
const layout  = read('app/admin/layout.tsx')
const nav     = read('components/admin/MobileNav.tsx')
const jade    = read('app/admin/components/JadeStaffWidget.tsx')
const twilio  = read('components/admin/TwilioPhonePanel.tsx')
const chat    = read('app/admin/inbox/components/ChatWindow.tsx')
const client  = read('app/admin/inbox/components/ClientInfo.tsx')
const reply   = read('app/admin/inbox/components/ReplyBox.tsx')
const assign  = read('app/admin/inbox/components/AssignDropdown.tsx')

describe('viewport ownership', () => {
  it('the inbox page roots carry the fullbleed marker', () => {
    expect(page).toContain('data-inbox-fullbleed')
  })

  it('globals.css zeroes main padding and page scroll for fullbleed routes via :has()', () => {
    expect(globals).toContain('main:has([data-inbox-fullbleed])')
    const afterRule = globals.slice(globals.indexOf('main:has([data-inbox-fullbleed])'))
    const block = afterRule.slice(0, afterRule.indexOf('}'))
    expect(block).toContain('padding: 0')
    expect(block).toContain('overflow: hidden')
  })

  it('page root is h-full inside the shell box — 100dvh belongs only to the pre-auth screen', () => {
    expect(page).toMatch(/data-inbox-fullbleed className="flex h-full/)
    expect((page.match(/h-\[100dvh\]/g) ?? []).length).toBe(1)
    // The single 100dvh sizes the pre-auth loading screen (rendered before the
    // shell hands over the box), keeping the inbox-history pin honest.
    expect(page).toMatch(/h-\[100dvh\][\s\S]{0,220}Loading inbox/)
  })

  it('the column stack is flex + min-h-0 all the way down (keyboard-safe, no fixed heights)', () => {
    expect(page).toContain('flex-shrink-0 flex flex-col min-h-0 w-full md:w-72 xl:w-80')
    expect(page).toContain('flex-1 flex flex-col min-h-0 min-w-0')
    expect(page).toContain('flex-1 flex flex-col relative min-h-0 min-w-0')
    expect(page).toContain('hidden lg:flex min-h-0')            // tablet keeps 2 panes; drawer is UX-4
    expect(layout).toContain('flex-1 min-h-0 overflow-y-auto')  // shell main unchanged for other routes
    expect(layout).toContain('data-inbox-fullbleed')            // contract documented at the source
  })
})

describe('mobile space reservation — one source of truth', () => {
  it('chrome tokens file exports the scale and nav metrics', () => {
    expect(Z_INDEX.nav).toBe(30)
    expect(Z_INDEX.fab).toBe(40)
    expect(Z_INDEX.drawer).toBe(60)
    expect(Z_INDEX.modal).toBe(70)
    expect(Z_INDEX.toast).toBe(80)
    expect(BOTTOM_NAV_HEIGHT_PX).toBe(64)
    expect(BOTTOM_NAV_HEIGHT_VAR).toBe('--walz-bottom-nav-h')
    expect(BOTTOM_NAV_SAFE_VAR).toBe('--walz-bottom-nav-safe')
  })

  it('globals declares the tokens and the fullbleed reservation consumes them', () => {
    expect(globals).toContain(`${BOTTOM_NAV_HEIGHT_VAR}: ${BOTTOM_NAV_HEIGHT_PX}px`)
    expect(globals).toContain('--walz-bottom-nav-safe: calc(var(--walz-bottom-nav-h) + env(safe-area-inset-bottom')
    expect(globals).toContain('padding-bottom: var(--walz-bottom-nav-safe)')
  })

  it('safe-area inset is part of the reservation and of the nav itself', () => {
    expect(globals).toContain('safe-area-inset-bottom')
    expect(nav).toContain('safe-area-inset-bottom')
  })

  it('MobileNav consumes the shared css var and sits at Z_INDEX.nav', () => {
    expect(nav).toContain('var(--walz-bottom-nav-h)')
    expect(nav).toContain('z-30')
  })
})

describe('FAB docking on /admin/inbox', () => {
  it('JadeStaffWidget hides on the inbox route (isBuilder pathname pattern)', () => {
    expect(jade).toContain("pathname.startsWith('/admin/inbox')")
    expect(jade).toContain('if (isBuilder || isInbox) return null')
  })

  it('JadeStaffWidget retired z-[1000]/z-[999] for the chrome scale', () => {
    expect(jade).not.toContain('z-[1000]')
    expect(jade).not.toContain('z-[999]')
    expect(jade).toContain('z-40')     // fab
    expect(jade).toContain('z-[60]')   // drawer (panel)
  })

  it('Twilio mobile FAB does not render on the inbox route', () => {
    expect(twilio).toContain("pathname?.startsWith('/admin/inbox')")
    // The bottom-20 FAB is inside the !isInbox gate.
    expect(twilio).toMatch(/\{!isInbox && \([\s\S]{0,500}bottom-20[\s\S]{0,300}aria-label="Phone"|\{!isInbox && \([\s\S]{0,500}aria-label="Phone"[\s\S]{0,300}bottom-20/)
  })

  it('no ungated bottom-20 FAB in either widget source', () => {
    // Jade: entire component returns null on inbox, so its bottom-20 bubble never renders there.
    expect(jade).toContain('bottom-20')
    // Twilio: every FAB occurrence of bottom-20 with aria-label="Phone" sits after the gate.
    const gateIdx = twilio.indexOf('{!isInbox && (')
    const fabIdx  = twilio.indexOf('aria-label="Phone"')
    expect(gateIdx).toBeGreaterThan(-1)
    expect(fabIdx).toBeGreaterThan(gateIdx)
  })
})

describe('visual direction — light premium workspace (start)', () => {
  it('lightened files use walz tokens and introduce no hex literals', () => {
    for (const src of [page, chat, client, reply, assign]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/)
      expect(src).toContain('walz-')
    }
  })

  it('conversation header, canvas, composer and client panel are light surfaces with walz-border hairlines', () => {
    expect(chat).toContain('border-b border-walz-border bg-white')      // header strip
    expect(chat).toContain('bg-walz-off-white')                          // message canvas
    expect(reply).toContain('border-t border-walz-border bg-white')      // composer strip
    expect(client).toContain('bg-white border-l border-walz-border')     // client panel
  })

  it('primary actions are blue; gold stays restrained', () => {
    expect(chat).toContain('bg-blue-600')     // Resolve
    expect(reply).toContain('bg-blue-600')    // Send
    expect(client).toContain('bg-blue-600')   // Mark Resolved
  })

  it('toasts sit at Z_INDEX.toast', () => {
    expect(page).toContain('z-[80]')
  })

  it('the conversation list rail keeps its dark surface, tokenized in UX-3 (bg-walz-navy, no hex)', () => {
    expect(read('app/admin/inbox/components/ConversationList.tsx')).toContain('bg-walz-navy')
  })
})
