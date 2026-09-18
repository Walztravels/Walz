/**
 * INBOX UX-2 Phase A — conversation-experience restructuring.
 *
 * Pins:
 *  - clean conversation header: mobile row 1 = back/identity/•••; assign +
 *    status controls are desktop-only in row 1 and reappear on a compact
 *    mobile second row; Resolve/Reopen lives ONLY inside the status control
 *    popover and the ••• menu — the standalone header Resolve button is gone;
 *  - the floating Application Lookup pill is removed from the page — the
 *    lookup opens from the ••• menu and the ClientInfo APPLICATION section
 *    (the drawer mount + showAppLookup state stay, per the 0S pins);
 *  - message palette: white incoming / light Walz-blue outgoing bubbles,
 *    no solid gold slabs, subtle ✨ Jade indicator for jade_ai messages;
 *  - Ask Jade entry: ref-based ComposerDraftContext (the ChatWindow→ReplyBox
 *    JSX line is byte-pinned, so no new composer props), copilot stub panel
 *    with the frozen InboxJadeCopilot interface.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const page    = read('app/admin/inbox/page.tsx')
const chat    = read('app/admin/inbox/components/ChatWindow.tsx')
const bubble  = read('app/admin/inbox/components/MessageBubble.tsx')
const client  = read('app/admin/inbox/components/ClientInfo.tsx')
const reply   = read('app/admin/inbox/components/ReplyBox.tsx')
const assign  = read('app/admin/inbox/components/AssignDropdown.tsx')
const menu    = read('app/admin/inbox/components/HeaderActionMenu.tsx')
const copilot = read('app/admin/inbox/components/InboxJadeCopilot.tsx')
const ctx     = read('app/admin/inbox/ComposerDraftContext.tsx')
const drawer  = read('components/admin/ApplicationLookupDrawer.tsx')
const types   = read('app/admin/inbox/types.ts')

describe('application lookup entry points (UX-2)', () => {
  it('the absolute floating lookup pill is gone from the page', () => {
    expect(page).not.toContain('absolute top-2 right-2')
    expect(page).not.toContain('🔎 Application Lookup')
  })

  it('the drawer mount and showAppLookup state remain (0S pins), now opened from header/panel', () => {
    expect(page).toContain('ApplicationLookupDrawer')
    expect(page).toContain('showAppLookup')
    expect(page).toContain('onOpenLookup={() => setShowAppLookup(true)}')
  })

  it('ApplicationLookupDrawer gained ONE optional onVerified prop; pinned strings intact', () => {
    expect(drawer).toContain('onVerified?:')
    expect(drawer).toContain('onVerified?.(')
    // secure-application-lookup pins must survive:
    expect(drawer).toContain('Client Verified')
    expect(drawer).toContain('verifiedUntil')
    expect(drawer).toContain('Verification failed. Do not disclose application details.')
  })
})

describe('clean conversation header', () => {
  it('HeaderActionMenu exists with Client details and Link / View application items', () => {
    expect(chat).toContain('HeaderActionMenu')
    expect(menu).toContain('Client details')
    expect(menu).toContain('Link / View application')
    // Review L1: the duplicate desktop 'Application lookup' entry is gone —
    // one always-visible Link / View application entry only.
    expect(menu).not.toContain('Application lookup')
    expect(menu).toContain("e.key === 'Escape'")          // Esc closes
    expect(menu).toContain('mousedown')                   // outside click closes
    expect(menu).toContain('Z_INDEX.drawer')              // z from chrome tokens
  })

  it('assign + status controls are desktop-only in row 1; mobile gets the compact second row', () => {
    expect(chat).toContain('hidden md:flex items-center gap-2')
    // UX-2 polish: row 2 is a single compact line — AssignDropdown · StatusControl
    // (py-1.5 max, no plain 'Assigned:' label, no duplicated plain status text).
    expect(chat).toMatch(/md:hidden flex items-center[^"]*px-3 pb-1\.5/)
    expect(chat).not.toContain('Assigned:')
  })

  it('no standalone Resolve text button outside the status control', () => {
    // The Resolve/Reopen JSX labels appear only inside StatusControl —
    // everything before its definition wires handlers, never renders labels.
    const beforeStatusControl = chat.slice(0, chat.indexOf('function StatusControl'))
    expect(chat).toContain('function StatusControl')
    expect(beforeStatusControl).not.toMatch(/>\s*Resolve\s*</)
    expect(beforeStatusControl).not.toMatch(/\sResolve\s*\n/)
    // Status control shows the current state and reuses the existing handlers.
    expect(chat).toContain("isResolved ? 'Resolved' : 'Open'")
    expect(chat).toContain('<StatusControl isResolved={isResolved} onResolve={onResolve} onReopen={onReopen} />')
  })

  it('AssignDropdown supports the compact trigger with truncate + max-w', () => {
    expect(assign).toContain('compact?: boolean')
    expect(assign).toContain('truncate max-w-')
  })

  it('ChatWindow wiring is additive — optional onOpenLookup/onOpenClientPanel props', () => {
    expect(chat).toContain('onOpenLookup?:')
    expect(chat).toContain('onOpenClientPanel?:')
  })
})

describe('message palette', () => {
  it('bubble widths are 85% mobile / 72% desktop', () => {
    expect(bubble).toContain('max-w-[85%] md:max-w-[72%]')
    expect(bubble).not.toContain('max-w-[70%]')
  })

  it('no solid gold outgoing slab or hex navy incoming — tokens + light blue only', () => {
    expect(bubble).not.toContain('bg-[#C9A84C]')
    expect(bubble).not.toContain('bg-[#1e3a5f]')
    expect(bubble).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(bubble).toContain('bg-blue-50')                     // staff outgoing surface
    expect(bubble).toContain('bg-white border border-walz-border text-walz-deep-navy')  // incoming
  })

  it('jade_ai messages carry a subtle ✨ Jade indicator on the meta row (M3: gold sparkle, muted-strong word)', () => {
    expect(bubble).toContain('<span className="text-walz-gold">✨</span> Jade')
    expect(bubble).toContain('content_attributes?.jade_ai')
    expect(bubble).toContain('text-walz-gold')
    expect(bubble).toContain('text-walz-muted-strong')
    expect(types).toContain('content_attributes?: { jade_ai?: boolean }')
  })

  it('private notes keep the amber treatment; media never exceeds the bubble', () => {
    expect(bubble).toContain('bg-amber-500/10 border border-amber-500/40')
    expect(bubble).toContain('max-w-[min(260px,100%)]')
  })
})

describe('client panel — APPLICATION section', () => {
  it('default state shows No application linked + Link Application', () => {
    expect(client).toContain('No application linked')
    expect(client).toContain('Link Application')
  })

  it('verified-in-session state shows the ref summary + Open Application', () => {
    expect(client).toContain('linkedApp')
    expect(client).toContain('Open Application')
  })

  it('the page holds session-only linkage keyed by conversation id', () => {
    expect(page).toContain('linkedApp')
    expect(page).toContain('convId')
    expect(page).toContain('linkedApp.convId === selected.id')
  })

  it('below-lg Client details render ClientInfo in the UX-4 DetailsDrawer (the UX-2 overlay evolved as planned)', () => {
    // UX-4 replaced the interim full-screen overlay with the shared drawer
    // primitive — same trigger, same ClientInfo overlay variant, same
    // below-lg-only scope and safe-area padding, now in DetailsDrawer.tsx.
    const dd = read('app/admin/inbox/components/DetailsDrawer.tsx')
    expect(page).toContain('DetailsDrawer')
    expect(page).toContain("variant=\"overlay\"")
    expect(dd).toContain('lg:hidden')
    expect(dd).toContain('safe-area-inset-bottom')
    expect(dd).toContain('Z_INDEX.drawer')
  })
})

describe('Ask Jade entry + composer draft context', () => {
  it('ComposerDraftContext exposes the ref-based API with no-op defaults', () => {
    expect(ctx).toContain('registerInserter')
    expect(ctx).toContain('insertDraft')
    expect(ctx).toContain('openCopilot')
    expect(ctx).toContain('registerCopilotOpener')
    expect(ctx).toContain('const noop = () => {}')
  })

  it('ReplyBox consumes the context and offers Ask Jade', () => {
    expect(reply).toContain('useComposerDraft')
    expect(reply).toContain('registerInserter')
    expect(reply).toContain('openCopilot')
    expect(reply).toContain('Ask Jade')
    // Draft insertion switches to reply mode and appends with a blank line.
    expect(reply).toContain("setMode('reply')")
    expect(reply).toContain('${prev}\\n\\n${draft}')
  })

  it('the ChatWindow→ReplyBox pinned line is untouched (context, not props)', () => {
    expect(chat).toContain('<ReplyBox onSend={onSend} disabled={isResolved} />')
  })
})

describe('InboxJadeCopilot stub (interface frozen for the Jade release)', () => {
  it('the props interface carries every pinned field', () => {
    expect(copilot).toContain('export interface InboxJadeCopilotProps')
    expect(copilot).toContain('open: boolean')
    expect(copilot).toContain('onClose: () => void')
    expect(copilot).toContain('conversationId: number | null')
    expect(copilot).toContain('channel: string')
    expect(copilot).toContain('contactName: string')
    expect(copilot).toContain('contactEmail?: string | null')
    expect(copilot).toContain('contactPhone?: string | null')
    expect(copilot).toContain("recentMessages: Array<{ role: 'client' | 'agent'; text: string }>")
  })

  it('panel chrome — header, context line, close, real Staff Jade body', () => {
    expect(copilot).toContain('Staff Jade')
    expect(copilot).toContain('internal assistant')
    // Phase B replaced the stub placeholder with the real panel:
    expect(copilot).toContain('Ask Jade anything')
    expect(copilot).toContain('Insert into Reply')
    expect(copilot).toContain('w-[400px]')            // desktop peer panel
    expect(copilot).toContain('max-h-[80dvh]')        // mobile bottom sheet
    expect(copilot).toContain('z-[60]')               // drawer layer
  })

  it('the page renders the copilot and builds recentMessages skipping private + activity', () => {
    expect(page).toContain('InboxJadeCopilot')
    expect(page).toContain('!m.private && m.message_type !== 2')
    expect(page).toContain('.slice(-12)')
    expect(page).toContain('m.content?.slice(0, 400)')
    expect(page).toContain("m.message_type === 0 ? ('client' as const) : ('agent' as const)")
  })

  it('while the copilot is open on desktop, the ClientInfo rail yields its slot', () => {
    expect(page).toContain('{selected && !copilotOpen && (')
    expect(page).toContain('hidden lg:flex min-h-0')   // the rail wrapper itself is unchanged
  })
})
