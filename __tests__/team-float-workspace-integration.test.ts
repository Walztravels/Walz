/**
 * Floating Ask Team Workspace — integration/wiring checks that complement
 * the pure-logic tests in team-float-state.test.ts and the API route tests
 * in team-inbox-links-for-conversation-route.test.ts.
 *
 * This codebase has no React Testing Library / component-mounting harness
 * (see jest.config.ts — testEnvironment: 'node', no @testing-library
 * dependency), so behavior that would normally be verified by simulating
 * clicks/pointer events on a mounted component is instead verified the way
 * this codebase's own tests already do it for similar cases (see
 * inbox-ux4-screens.test.ts's page.tsx source assertions): by asserting the
 * SOURCE contains the specific wiring/structural invariants the spec
 * requires. Real DOM/pointer-driven verification of drag/resize/minimize/
 * maximize interactions is exactly the "QA/accessibility review" this
 * implementation explicitly does not self-certify — see the final report.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const pageSrc = () => read('app/admin/inbox/page.tsx')
const composerSrc = () => read('app/admin/team/components/Composer.tsx')
const paneSrc = () => read('app/admin/team/components/ConversationPane.tsx')
const askTeamSrc = () => read('app/admin/inbox/components/AskTeamPanel.tsx')
const chromeSrc = () => read('app/admin/inbox/team-float/FloatWindowChrome.tsx')
const mobileSrc = () => read('app/admin/inbox/team-float/MobileTeamSheet.tsx')
const workspaceSrc = () => read('app/admin/inbox/team-float/FloatingTeamWorkspace.tsx')
const hostSrc = () => read('app/admin/inbox/team-float/TabConversationHost.tsx')
const hookSrc = () => read('app/admin/inbox/team-float/useFloatingTeamWorkspace.ts')

describe('OPEN — "Ask Team" wiring resolves CASE 1/2/3 instead of unconditionally opening the drawer', () => {
  it('registers the Ask Team opener to call floatTeam.askTeamFor before ever opening AskTeamPanel', () => {
    const s = pageSrc()
    expect(s).toMatch(/registerAskTeamOpener\(\(\) => \{/)
    expect(s).toContain('floatTeam.askTeamFor(')
    expect(s).toMatch(/resolution\.case === 3/)
  })

  it('AskTeamPanel is still rendered (CASE 3 fallback preserved, not duplicated) with its onCreated hook wired to floatTeam.openCreatedTab', () => {
    const s = pageSrc()
    expect(s).toContain('<AskTeamPanel')
    expect(s).toContain('onCreated={info =>')
    expect(s).toContain('floatTeam.openCreatedTab(')
  })

  it('FloatingTeamWorkspace is mounted at the persistent shell tier (module-level in InboxPageInner), not inside anything that unmounts on conversation switch', () => {
    const s = pageSrc()
    expect(s).toContain('<FloatingTeamWorkspace')
    expect(s).toContain('useFloatingTeamWorkspace()')
    // Sits alongside AskTeamPanel/JadeAssistPanel, not inside a `{selected && ...}` guard.
    const idx = s.indexOf('<FloatingTeamWorkspace')
    const before = s.slice(Math.max(0, idx - 400), idx)
    expect(before).not.toMatch(/\{selected &&\s*\($/)
  })
})

describe('PREPARE CLIENT REPLY SAFETY — Composer never offers "insert into current" when mismatched', () => {
  it('mismatched branch offers exactly Go-to + Copy Reply — nothing resembling an insert-into-current-reply action', () => {
    const s = composerSrc()
    expect(s).toContain('isViewingLinkedInbox')
    // Isolate JUST the mismatched (isViewingLinkedInbox === false) JSX branch
    // by slicing between its own two markers, so this assertion inspects
    // rendered UI text/handlers only — never this file's own doc comments
    // ABOUT the invariant (which necessarily discuss the forbidden phrase).
    const start = s.indexOf('Reply prepared for {linkedClientName')
    const end = s.indexOf('onGoToLinkedConversation ? (', start) // next branch below, or fall through to end
    const branch = s.slice(start, end === -1 ? s.indexOf(') : (', start) : end)
    expect(branch).toContain('Copy Reply')
    expect(branch).toContain('Go to {linkedClientName')
    expect(branch).not.toMatch(/insert/i)
    expect(branch).not.toContain('onSend(')
    expect(branch).not.toContain('replaceDraft(')
  })

  it('standalone Team Hub (no onGoToLinkedConversation) keeps the EXACT original "Draft handed off" + anchor-link behavior', () => {
    const s = composerSrc()
    expect(s).toContain('Draft handed off. Review and send it from the Inbox.')
    expect(s).toContain(`href={\`/admin/inbox?c=\${activeInboxConversationId}\`}`)
  })

  it('the actual safety mechanism is structural: confirmHandoff only ever writes the draft keyed by activeInboxConversationId, regardless of viewing state', () => {
    const s = composerSrc()
    const fnStart = s.indexOf('function confirmHandoff')
    const fnBody = s.slice(fnStart, fnStart + 300)
    expect(fnBody).toContain('writePendingClientDraft(activeInboxConversationId, prepareText)')
    expect(fnBody).not.toMatch(/viewingInboxConversationId/)
  })

  it('ConversationPane threads the three new props straight through to Composer, unmodified for existing callers (all optional)', () => {
    const s = paneSrc()
    expect(s).toContain('linkedClientName?: string | null')
    expect(s).toContain('isViewingLinkedInbox?: boolean')
    expect(s).toContain('onGoToLinkedConversation?: () => void')
    expect(s).toMatch(/linkedClientName=\{linkedClientName\}/)
  })

  it('TabConversationHost computes isViewingLinkedInbox via the shared pure safety gate, never a local ad-hoc comparison', () => {
    const s = hostSrc()
    expect(s).toContain('isReplySafeForCurrentComposer(activeInboxConversationId, viewingInboxConversationId)')
  })
})

describe('CASE 3 create flow — AskTeamPanel onCreated is additive, never mutates the existing create/link logic', () => {
  it('onCreated is optional and fired only after a successful link, using the create flow\'s own result — no second API call to create a conversation', () => {
    const s = askTeamSrc()
    expect(s).toContain('onCreated?: (info:')
    const fnStart = s.indexOf('async function submit()')
    const fnBody = s.slice(fnStart, s.indexOf('async function markResolved'))
    expect(fnBody).toContain('onCreated?.({')
    expect(fnBody).toContain('teamConversationId,')
    // submit() creates a Team conversation via exactly ONE of two MUTUALLY
    // EXCLUSIVE branches (DM vs GROUP; the CHANNEL branch creates nothing,
    // it just posts to an existing one) — never both in one invocation.
    // onCreated fires once, after that single creation, using its result.
    expect(fnBody).toMatch(/if \(target\.kind === 'dm'\)/)
    expect(fnBody).toMatch(/\} else if \(target\.kind === 'channel'\)/)
    expect(fnBody).toMatch(/\} else \{/)
    expect((fnBody.match(/onCreated\?\.\(/g) ?? []).length).toBe(1)
  })
})

describe('CLIENT SWITCH / context mismatch — the active tab never re-targets itself off the visible Inbox conversation', () => {
  it('FloatingTeamWorkspace/TabConversationHost never call focusTab/closeTab as a reaction to viewingInboxConversationId changing', () => {
    const s = workspaceSrc()
    // viewingInboxConversationId is read only for the mismatch note/safety gate, never passed to an effect keyed off it that mutates tab state.
    expect(s).not.toMatch(/useEffect\([^)]*viewingInboxConversationId[^)]*focusTab/s)
    expect(s).not.toMatch(/useEffect\([^)]*viewingInboxConversationId[^)]*closeTab/s)
  })

  it('the context-mismatch note only renders when the active tab\'s link differs from what is currently visible, and never restyled as an error', () => {
    const s = chromeSrc()
    expect(s).toContain('!isViewingActiveTabsClient && viewingClientName')
    expect(s).toContain('Currently viewing')
    expect(s).not.toMatch(/text-red|bg-red.*Currently viewing/)
  })
})

describe('SMALL SCREEN — mobile renders the sheet, never the draggable/resizable chrome', () => {
  it('FloatingTeamWorkspace branches on breakpoint === "mobile" to render MobileTeamSheet instead of FloatWindowChrome', () => {
    const s = workspaceSrc()
    expect(s).toContain("breakpoint === 'mobile'")
    expect(s).toContain('<MobileTeamSheet')
    expect(s).toContain('<FloatWindowChrome')
  })

  it('MobileTeamSheet renders no resize handles and no drag pointer handlers', () => {
    const s = mobileSrc()
    expect(s).not.toContain('useResizeHandle')
    expect(s).not.toContain('useDragHandle')
    expect(s).not.toContain('onPointerDown')
  })

  it('FloatWindowChrome omits resize handles while maximized', () => {
    const s = chromeSrc()
    expect(s).toContain('{!maximized && RESIZE_HANDLES.map(')
  })

  it('the drag handle guards against starting a drag from an interactive control inside the header (minimize/maximize/close never also drag)', () => {
    const s = read('app/admin/inbox/team-float/useDragResize.ts')
    expect(s).toContain("target.closest(INTERACTIVE_SELECTOR)")
    expect(s).toContain("'button, a, input, textarea, select, [role=\"button\"], [data-no-drag]'")
  })
})

describe('accessibility self-check — labels, roles, and a non-drag escape hatch exist in source', () => {
  it('every window control has an aria-label', () => {
    const s = chromeSrc()
    for (const label of ['Reset window position and size', 'Minimize Team Hub workspace', 'Close current Team Hub discussion tab']) {
      expect(s).toContain(`aria-label="${label}"`)
    }
    expect(s).toMatch(/aria-label=\{maximized \? 'Restore Team Hub workspace' : 'Maximize Team Hub workspace'\}/)
  })

  it('tabs expose role=tab/tablist/aria-selected/aria-controls, and panels expose role=tabpanel', () => {
    expect(chromeSrc()).toContain('role="tablist"')
    expect(chromeSrc()).toContain('role="tab"')
    expect(chromeSrc()).toContain('aria-selected={isActive}')
    expect(hostSrc()).toContain('role="tabpanel"')
  })

  it('a keyboard-only reset-position affordance exists (dragging is never the only way to reposition)', () => {
    expect(chromeSrc()).toContain('onResetPosition')
    expect(hookSrc()).toContain('resetPosition')
  })

  it('the workspace announces state changes to screen readers via an aria-live region', () => {
    expect(workspaceSrc()).toContain('aria-live="polite"')
  })
})

describe('SECURITY — no new endpoint skips existing authorization, and tab persistence is documented as non-authoritative', () => {
  it('the state module documents that a persisted tab id is a render REQUEST, never authorization', () => {
    const s = read('lib/team-float/state.ts')
    expect(s).toMatch(/never (treated as|trusted as) authorization/i)
  })

  it('the new for-conversation route enforces the same inbox permission + conversation access + team membership gates as its siblings', () => {
    const s = read('app/api/admin/team/inbox-links/for-conversation/route.ts')
    expect(s).toContain("checkInboxPermission(session, 'inbox_view')")
    expect(s).toContain('checkConversationAccess(session,')
    expect(s).toContain('checkConversationMembership(session as AdminSession,')
  })

  it('the floating workspace never enables a new Supabase realtime subscription (poll-only, per Team Hub\'s own documented decision)', () => {
    // Comments EXPLAINING the decision (why not to add postgres_changes) are
    // expected and fine — only actual code that opens a channel is checked.
    for (const file of ['app/admin/inbox/team-float/useFloatingTeamWorkspace.ts', 'app/admin/inbox/team-float/TabConversationHost.tsx']) {
      const s = read(file)
      expect(s).not.toMatch(/\.channel\(/)
      expect(s).not.toContain("from '@supabase/supabase-js'")
      expect(s).not.toMatch(/\.on\('postgres_changes'/)
    }
  })

  it('the floating workspace never calls the conversation-LIST hook (useTeamConversations) — one poller per open tab, not per open tab times the list poll too', () => {
    for (const file of ['app/admin/inbox/team-float/TabConversationHost.tsx', 'app/admin/inbox/team-float/FloatingTeamWorkspace.tsx']) {
      expect(read(file)).not.toMatch(/useTeamConversations\(/)
    }
  })
})

describe('UNREAD while minimized — tab hosts stay mounted (portal, never unmount-on-minimize)', () => {
  it('FloatingTeamWorkspace portals a single, stable `body` element into a target that falls back to a hidden host when minimized, instead of conditionally rendering TabConversationHost only while visible', () => {
    const s = workspaceSrc()
    expect(s).toContain('createPortal(body, portalTarget)')
    expect(s).toMatch(/const portalTarget = \(!minimized && visibleSlot\) \? visibleSlot : hiddenHostRef\.current/)
    // The portal call site must not be inside a `{minimized ? ... : ...}` branch — it needs to run every render regardless of minimized.
    const portalIdx = s.indexOf('createPortal(body, portalTarget)')
    const before = s.slice(Math.max(0, portalIdx - 200), portalIdx)
    expect(before).not.toMatch(/minimized \?\s*\($/)
  })

  it('FloatWindowChrome and MobileTeamSheet no longer accept body as `children` — they report a DOM slot instead, so the portal (not JSX children) controls mounting', () => {
    expect(chromeSrc()).not.toContain('children: ReactNode')
    expect(chromeSrc()).toContain('bodySlotRef: (el: HTMLDivElement | null) => void')
    expect(mobileSrc()).toContain('bodySlotRef: (el: HTMLDivElement | null) => void')
  })
})

describe('Escape behavior — non-destructive, scoped, never traps focus', () => {
  it('Escape while focus is inside the workspace minimizes it (never closes/discards a discussion)', () => {
    const s = workspaceSrc()
    const idx = s.indexOf("e.key !== 'Escape'")
    const fnBody = s.slice(idx, idx + 300)
    expect(fnBody).toContain('minimize()')
    expect(fnBody).not.toContain('closeTab(')
  })

  it('the Escape listener is skipped while already minimized, and only acts when focus is actually within the workspace container', () => {
    const s = workspaceSrc()
    expect(s).toContain('if (minimized) return')
    expect(s).toContain('container.contains(document.activeElement)')
  })
})

describe('CALLING — no Twilio/P1-adjacent files touched by this feature', () => {
  it('none of the new/modified floating-workspace files import from the Twilio voice route or verify.ts', () => {
    const files = [
      'app/admin/inbox/team-float/FloatingTeamWorkspace.tsx',
      'app/admin/inbox/team-float/TabConversationHost.tsx',
      'app/admin/inbox/team-float/FloatWindowChrome.tsx',
    ]
    for (const f of files) {
      const s = read(f)
      expect(s).not.toContain('api/team/twilio/voice')
      expect(s).not.toContain('lib/webhooks/verify')
    }
  })

  it('calling is reused via the existing shared TeamCallDeviceProvider/IncomingCallOverlay, mounted once, exactly like app/admin/team/page.tsx already does', () => {
    const s = workspaceSrc()
    expect(s).toContain('TeamCallDeviceProvider')
    expect(s).toContain('<IncomingCallOverlay />')
  })
})

describe('QA FIX 1 — tablist keyboard navigation (ArrowLeft/ArrowRight/Home/End), desktop and mobile', () => {
  for (const [label, srcFn] of [['FloatWindowChrome (desktop/tablet)', chromeSrc], ['MobileTeamSheet (mobile)', mobileSrc]] as const) {
    it(`${label}: the tablist container wires a keydown handler that moves AND activates focus across all four keys, wrapping at the ends`, () => {
      const s = srcFn()
      // The handler must live on (or be reachable from) the role="tablist" element.
      const tablistIdx = s.indexOf('role="tablist"')
      const tablistTagSlice = s.slice(tablistIdx, s.indexOf('>', s.indexOf('onKeyDown', tablistIdx)) + 1)
      expect(tablistTagSlice).toMatch(/onKeyDown=\{handleTabListKeyDown\}/)

      const fnStart = s.indexOf('function handleTabListKeyDown')
      expect(fnStart).toBeGreaterThan(-1)
      const fnBody = s.slice(fnStart, s.indexOf('\n  }\n', fnStart))

      // All four required keys are handled.
      expect(fnBody).toContain("'ArrowRight'")
      expect(fnBody).toContain("'ArrowLeft'")
      expect(fnBody).toContain("'Home'")
      expect(fnBody).toContain("'End'")

      // Wrapping arithmetic for both directions (mod tabs.length, and +tabs.length before mod for the leftward wrap).
      expect(fnBody).toMatch(/currentIdx \+ 1\)\s*%\s*tabs\.length/)
      expect(fnBody).toMatch(/currentIdx - 1 \+ tabs\.length\)\s*%\s*tabs\.length/)

      // Moving focus also ACTIVATES the tab (automatic activation) — it calls
      // onFocusTab with the computed next tab, not just DOM .focus().
      expect(fnBody).toContain('onFocusTab(nextTab.id)')
      expect(fnBody).toContain('.focus()')
    })

    it(`${label}: every tab element is reachable via a ref so the handler can move DOM focus to an inactive (tabIndex=-1) tab, not just React state`, () => {
      const s = srcFn()
      expect(s).toContain('tabRefs.current.set(t.id, el)')
      expect(s).toContain('tabRefs.current.get(nextTab.id)?.focus()')
      // The ref is attached to the exact element carrying role="tab"/tabIndex.
      const tabDivStart = s.indexOf('role="tab"')
      const tabDivSlice = s.slice(Math.max(0, tabDivStart - 200), tabDivStart)
      expect(tabDivSlice).toContain('ref={el =>')
    })
  }
})

describe('QA FIX 2 — mobile "Close" button actually closes the active tab, not just minimizes', () => {
  it('MobileTeamSheet has a distinct onCloseActiveTab prop, separate from the minimize-mapped onClose used by Back', () => {
    const s = mobileSrc()
    expect(s).toContain('onCloseActiveTab: () => void')
    expect(s).toContain('onClose: () => void')
  })

  it('the X button calls onCloseActiveTab (never onClose/minimize), and its aria-label matches what it actually does', () => {
    const s = mobileSrc()
    const xButtonIdx = s.indexOf('aria-label="Close current Team Hub discussion tab"')
    expect(xButtonIdx).toBeGreaterThan(-1)
    const buttonTag = s.slice(Math.max(0, xButtonIdx - 200), xButtonIdx + 50)
    expect(buttonTag).toContain('onClick={onCloseActiveTab}')
    expect(buttonTag).not.toContain('onClick={onClose}')
  })

  it('the Back button keeps the separate, correctly-labeled minimize affordance', () => {
    const s = mobileSrc()
    const backIdx = s.indexOf('aria-label="Back to Inbox"')
    const buttonTag = s.slice(Math.max(0, backIdx - 200), backIdx + 50)
    expect(buttonTag).toContain('onClick={onClose}')
  })

  it('FloatingTeamWorkspace wires onCloseActiveTab to handleCloseActiveTab — the SAME handler the desktop header X already uses — so mobile close removes the active tab (emptying `tabs` and returning null when it was the last one), never merely setting minimized', () => {
    const s = workspaceSrc()
    expect(s).toContain('const handleCloseActiveTab = useCallback(() => {')
    expect(s).toContain('if (activeTabId) closeTab(activeTabId)')
    // Desktop already used this for its own onClose; mobile must reuse it too.
    expect(s).toMatch(/<FloatWindowChrome[\s\S]*?onClose=\{handleCloseActiveTab\}/)
    expect(s).toMatch(/<MobileTeamSheet[\s\S]*?onCloseActiveTab=\{handleCloseActiveTab\}/)
    // Mobile's own onClose stays mapped to minimize (the Back affordance), not closeTab.
    expect(s).toMatch(/<MobileTeamSheet[\s\S]*?onClose=\{minimize\}/)
  })
})

describe('QA FIX 2 (part 3) — MinimizedBar has a mobile-aware position, not always the desktop bottom-right anchor', () => {
  it('positions top-right below the md breakpoint (768px, matching this feature\'s own mobile split) and bottom-right at md and up', () => {
    const s = read('app/admin/inbox/team-float/MinimizedBar.tsx')
    const classIdx = s.indexOf('className="fixed')
    const classAttr = s.slice(classIdx, s.indexOf('"', classIdx + 'className="'.length) + 1)
    expect(classAttr).toContain('top-4')
    expect(classAttr).toContain('md:top-auto')
    expect(classAttr).toContain('md:bottom-4')
  })
})

describe('QA FIX 3 — header drag handlers are inert while maximized (mirrors resize handles being hidden)', () => {
  it('FloatWindowChrome guards all four pointer handlers on the drag-handle row with `maximized ? undefined : ...`', () => {
    const s = chromeSrc()
    for (const handler of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
      expect(s).toContain(`${handler}={maximized ? undefined : dragHandlers.${handler}}`)
    }
  })
})

describe('QA FIX 4 — touch targets meet 44px on tablet (FloatWindowChrome renders on desktop AND tablet)', () => {
  it('FloatWindowChrome header controls and per-tab close-X are all min-w/min-h 44px, not the old 28px/16px', () => {
    const s = chromeSrc()
    expect(s).not.toContain('min-w-[28px]')
    expect(s).not.toContain('min-h-[28px]')
    // Per-tab close still keeps a small 16px unread-count badge — only the
    // BUTTON'S hit target grows, not the badge — so count occurrences on buttons.
    const closeButtonMatches = s.match(/aria-label=\{`Close \$\{t\.clientName\} discussion tab`\}[\s\S]{0,200}?min-w-\[44px\] min-h-\[44px\]/)
    expect(closeButtonMatches).not.toBeNull()
  })

  it('MobileTeamSheet per-tab close-X is min-w/min-h 44px, not the old 20px', () => {
    const s = mobileSrc()
    expect(s).not.toContain('min-w-[20px]')
    expect(s).not.toContain('min-h-[20px]')
    const closeButtonMatches = s.match(/aria-label=\{`Close \$\{t\.clientName\} discussion tab`\}[\s\S]{0,200}?min-w-\[44px\] min-h-\[44px\]/)
    expect(closeButtonMatches).not.toBeNull()
  })
})

describe('QA FIX 5 — window-blur fallback force-ends an interrupted drag/resize', () => {
  it('both useDragHandle and useResizeHandle register a window blur listener that calls the same end() used by pointerup/pointercancel', () => {
    const s = read('app/admin/inbox/team-float/useDragResize.ts')
    const blurRegistrations = s.match(/window\.addEventListener\('blur', end\)/g)
    expect(blurRegistrations?.length).toBe(2)
    expect(s).toMatch(/window\.removeEventListener\('blur', end\)/)
  })
})
