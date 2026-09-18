/**
 * INBOX UX-4 — screen-state navigation + DetailsDrawer.
 *
 * Fixes pinned here (from the Phase-0 audit):
 *  - display:none screen switching destroyed scroll boxes (list position
 *    lost on back; chat scroller reset triggering spurious pagination) —
 *    both panes now stay MOUNTED below md, moved with transforms.
 *  - Browser Back left /admin/inbox entirely — ?c=<id> history entries
 *    with a walzInbox marker make chat→list an in-inbox pop.
 *  - Overlays (Jade sheet / client details) survived screen changes.
 *  - Tablet/mobile client details now use the shared DetailsDrawer.
 */

import fs from 'fs'
import path from 'path'

import {
  deriveScreenFromSearch, buildConvSearch, createListScrollMemory, applyInert,
  CONV_PARAM, HISTORY_MARKER,
} from '@/app/admin/inbox/useInboxScreens'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const page = () => read('app/admin/inbox/page.tsx')

describe('URL model (pure)', () => {
  it('derives chat + conv id from ?c=, list otherwise — non-numeric never navigates', () => {
    expect(deriveScreenFromSearch('?c=318')).toEqual({ screen: 'chat', convId: 318 })
    expect(deriveScreenFromSearch('c=42')).toEqual({ screen: 'chat', convId: 42 })
    expect(deriveScreenFromSearch('')).toEqual({ screen: 'list', convId: null })
    expect(deriveScreenFromSearch('?lead=99')).toEqual({ screen: 'list', convId: null })
    expect(deriveScreenFromSearch('?c=abc')).toEqual({ screen: 'list', convId: null })
    expect(deriveScreenFromSearch('?c=1e3')).toEqual({ screen: 'list', convId: null })
  })

  it('buildConvSearch sets ?c=, preserves unrelated params, and retires legacy ?lead=', () => {
    expect(buildConvSearch('', 318)).toBe(`?${CONV_PARAM}=318`)
    expect(buildConvSearch('?lead=99&x=1', 318)).toBe(`?x=1&${CONV_PARAM}=318`)
    expect(buildConvSearch('?c=318&x=1', null)).toBe('?x=1')
    expect(buildConvSearch('?c=318', null)).toBe('')
  })

  it('the history marker is a stable contract', () => {
    expect(HISTORY_MARKER).toBe('walzInbox')
    expect(CONV_PARAM).toBe('c')
  })
})

describe('scroll memory + inert (pure)', () => {
  it('saves and restores the list scrollTop across a round trip', () => {
    const mem = createListScrollMemory()
    const el = { scrollTop: 740 }
    mem.save(el)
    el.scrollTop = 0                     // what an off-screen reflow would do
    mem.restore(el)
    expect(el.scrollTop).toBe(740)
    mem.save(null)                       // null-safe
    mem.restore(null)
    expect(mem.saved).toBe(740)
  })

  it('applyInert toggles the DOM inert property and no-ops on null', () => {
    const el: { inert?: boolean } = {}
    applyInert(el, true)
    expect(el.inert).toBe(true)
    applyInert(el, false)
    expect(el.inert).toBe(false)
    applyInert(null, true)               // no throw
  })
})

describe('mounted screens below md — the display:none defect cannot return', () => {
  it('no hidden/flex mobileView class toggle remains; transforms move the panes', () => {
    const s = page()
    expect(s).not.toMatch(/mobileView === 'list' \? 'flex' : 'hidden'/)
    expect(s).not.toMatch(/mobileView === 'chat' \? 'flex' : 'hidden'/)
    expect(s).toContain("max-md:translate-x-0")
    expect(s).toContain("max-md:translate-x-[-100%]")
    expect(s).toContain("max-md:translate-x-[100%]")
    expect(s).toContain('motion-safe:max-md:transition-transform')
  })

  it('the off screen is aria-hidden and inert (focus/AT can never land there)', () => {
    const s = page()
    expect(s).toContain('aria-hidden={hideList || undefined}')
    expect(s).toContain('aria-hidden={hideChat || undefined}')
    expect(s).toContain('applyInert')
  })

  it('md+ keeps the side-by-side layout (transforms are max-md scoped only)', () => {
    const s = page()
    // rail width chain untouched (ux3 pin) and no md-and-up transform classes
    expect(s).toContain('md:w-72 xl:w-80')
    expect(s).not.toMatch(/(?<!max-)md:translate-x-/)
  })
})

describe('history integration', () => {
  it('selection pushes ?c= state and back() walks the same history', () => {
    const hook = read('app/admin/inbox/useInboxScreens.ts')
    expect(hook).toContain('window.history.pushState')
    expect(hook).toContain("window.addEventListener('popstate'")
    expect(hook).toContain('window.history.back()')
    expect(hook).toContain('replaceState')          // deep-link fallback cleans the URL
    const s = page()
    expect(s).toContain('screens.selectConversation(conv.id)')
    expect(s).toContain('onBack={screens.back}')
  })

  it('legacy ?lead= deep links are still honored by the page', () => {
    expect(page()).toContain("searchParams.get('lead')")
  })

  it('list scroll restoration is registered on the conversation list scroller', () => {
    expect(page()).toContain('screens.registerListScroller')
  })
})

describe('overlays never survive a screen change', () => {
  it('the hook force-closes details on every screen transition', () => {
    const hook = read('app/admin/inbox/useInboxScreens.ts')
    expect(hook).toContain('setDetailsOpen(false) // overlays never survive a screen change')
  })

  it('the page closes the Jade copilot when the screen changes', () => {
    const s = page()
    const effect = s.slice(s.indexOf('prevScreenRef.current'), s.indexOf('}, [screens.screen])'))
    expect(effect).toContain('setCopilotOpen(false)')
  })
})

describe('DetailsDrawer primitive', () => {
  const dd = () => read('app/admin/inbox/components/DetailsDrawer.tsx')

  it('scrim + Esc close; focus enters on open and restores on close', () => {
    const s = dd()
    expect(s).toContain("e.key === 'Escape'")
    expect(s).toContain('restoreRef.current?.focus()')
    expect(s).toContain('closeRef.current?.focus()')
  })

  it('below-lg only, chrome z-scale, safe-area, own scroll, motion-safe slide', () => {
    const s = dd()
    expect(s).toContain('lg:hidden')
    expect(s).toContain('Z_INDEX.drawer')
    expect(s).toContain('safe-area-inset-bottom')
    expect(s).toContain('overflow-y-auto')
    expect(s).toContain('motion-safe')
  })

  it('the page hosts ClientInfo in the drawer for below-lg; the lg rail is unchanged', () => {
    const s = page()
    expect(s).toContain('<DetailsDrawer')
    expect(s).toContain('screens.detailsOpen')
    expect(s).toContain('hidden lg:flex')            // desktop rail untouched
  })
})

describe('a11y review fixes (UX-4 review chain)', () => {
  it('DetailsDrawer traps Tab inside the panel (aria-modal is honest)', () => {
    const s = read('app/admin/inbox/components/DetailsDrawer.tsx')
    expect(s).toContain("e.key !== 'Tab'")
    expect(s).toContain('panel.contains(active)')
    expect(s).toContain('e.shiftKey && active === first')
  })

  it('DetailsDrawer never captures <body> as the focus-restore target', () => {
    const s = read('app/admin/inbox/components/DetailsDrawer.tsx')
    expect(s).toContain('document.activeElement !== document.body')
  })

  it('HeaderActionMenu refocuses the trigger BEFORE running an action', () => {
    const s = read('app/admin/inbox/components/HeaderActionMenu.tsx')
    const run = s.slice(s.indexOf('function run('), s.indexOf('const itemCls'))
    const focus = run.indexOf('triggerRef.current?.focus()')
    const invoke = run.indexOf('action?.()')
    expect(focus).toBeGreaterThan(-1)
    expect(focus).toBeLessThan(invoke)
  })

  it('the mobile back button is named and meets the 44px target convention', () => {
    const s = read('app/admin/inbox/components/ChatWindow.tsx')
    const btn = s.slice(s.indexOf('onClick={onBack}'), s.indexOf('<ArrowLeft'))
    expect(btn).toContain('aria-label="Back to conversations"')
    expect(btn).toContain('min-w-[44px] min-h-[44px]')
  })
})
