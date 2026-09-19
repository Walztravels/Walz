/**
 * CompleteClientProfile (Client Action Centre — shared layer).
 *
 * Source-pin tests (this component only mounts inside a full drawer at
 * runtime; the suite's jest config runs testEnvironment 'node' with no DOM,
 * matching every other UI test in this codebase — see
 * inbox-ux42-create-quote.test.ts's own "source pins" describe block for
 * the established convention this file follows).
 *
 * Covers three of the four QA/security fixes applied to this shared layer:
 *  - Fix 2: a Cancel action that collapses the expanded form back to the
 *    compact summary without submitting anything, without calling
 *    onComplete(), and without any ability to touch a calling drawer's own
 *    form state (the props contract is read-only and drawer-agnostic).
 *  - Fix 3: crossRecordConflicts is rendered as a distinct warning, never
 *    as a plain "— Missing" row — and the empty/common case is unchanged.
 *  - Fix 4: focus moves to the gate's own heading on mount, once, inside
 *    this component (so all four consuming drawers get it for free).
 *
 * Fix 1 (phone normalization) and the rest of Fix 3 (propagation through a
 * service's error response) are covered behaviorally in
 * __tests__/inbox-payment-contact-patch.test.ts and
 * __tests__/inbox-ux41b-payment-request.test.ts respectively.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const src = read('app/admin/inbox/components/CompleteClientProfile.tsx')

const DRAWERS = [
  'app/admin/inbox/components/PaymentRequestDrawer.tsx',
  'app/admin/inbox/components/CreateQuoteDrawer.tsx',
  'app/admin/inbox/components/VisaFormDrawer.tsx',
  'app/admin/inbox/components/ItineraryRequestDrawer.tsx',
]

// QUOTE BUILDER V1.2: CreateQuoteDrawer.tsx itself no longer renders
// <CompleteClientProfile> at all — it renders no workspace JSX of its own
// any more (see its own header comment). The profile-completeness gate now
// renders independently inside each of the three breakpoint-specific
// workspace trees instead. Used in place of DRAWERS for the one test below
// that actually asserts on the <CompleteClientProfile> call site itself.
const PROFILE_GATE_CONSUMERS = [
  'app/admin/inbox/components/PaymentRequestDrawer.tsx',
  'app/admin/inbox/components/VisaFormDrawer.tsx',
  'app/admin/inbox/components/ItineraryRequestDrawer.tsx',
  'app/admin/inbox/components/quote-builder/desktop/DesktopWorkspace.tsx',
  'app/admin/inbox/components/quote-builder/tablet/TabletWorkspace.tsx',
  'app/admin/inbox/components/quote-builder/mobile/MobileWorkspace.tsx',
]

// ── Fix 2: Cancel / collapse affordance ─────────────────────────────────────

describe('Fix 2 — Cancel collapses back to the compact summary', () => {
  it('a handleCancel function exists, collapses the form, and clears only its own error/conflict state', () => {
    const fn = src.slice(src.indexOf('function handleCancel'), src.indexOf('return (', src.indexOf('function handleCancel')))
    expect(fn).toContain('setExpanded(false)')
    expect(fn).toContain('setError(null)')
    expect(fn).toContain('setConflicts(null)')
  })

  it('Cancel never clears staff-entered values — re-expanding preserves what was typed', () => {
    const fn = src.slice(src.indexOf('function handleCancel'), src.indexOf('return (', src.indexOf('function handleCancel')))
    expect(fn).not.toContain('setValues(')
  })

  it('Cancel never submits and never calls onComplete — it is not a save path', () => {
    const fn = src.slice(src.indexOf('function handleCancel'), src.indexOf('return (', src.indexOf('function handleCancel')))
    expect(fn).not.toContain('fetch(')
    expect(fn).not.toContain('onComplete(')
    expect(fn).not.toContain('handleSave')
  })

  it('the Cancel button is wired to handleCancel and rendered alongside Save details, not replacing it', () => {
    const expandedBlock = src.slice(src.indexOf('expanded ? ('), src.lastIndexOf(')}'))
    expect(expandedBlock).toContain('onClick={handleCancel}')
    const cancelBtnBlock = expandedBlock.slice(
      expandedBlock.indexOf('onClick={handleCancel}'),
      expandedBlock.indexOf('</button>', expandedBlock.indexOf('onClick={handleCancel}')),
    )
    expect(cancelBtnBlock).toContain('Cancel')
    expect(expandedBlock).toContain("'Save details'")
  })

  it('Cancel is disabled while a save is in flight, matching the Save button\'s own guard', () => {
    const cancelBtn = src.slice(src.indexOf('onClick={handleCancel}'), src.indexOf('</button>', src.indexOf('onClick={handleCancel}')))
    expect(cancelBtn).toContain('disabled={saving}')
  })

  it('the props contract is read-only and drawer-agnostic — this component structurally cannot touch a calling drawer\'s own form state (quote/visa/payment/itinerary fields)', () => {
    const propsBlock = src.slice(src.indexOf('export interface CompleteClientProfileProps'), src.indexOf('export function CompleteClientProfile'))
    // Only ever conversationId / missingFields / availableFields /
    // crossRecordConflicts / onComplete — no callback or ref that could
    // reach into a parent's own amount/title/destination/visaType state.
    expect(propsBlock).not.toMatch(/amount|title|destination|visaType|purpose|provider|items\b/i)
  })

  it('every consumer of CompleteClientProfile passes only the documented props — no extra coupling was introduced', () => {
    // QUOTE BUILDER V1.2: three of these six call sites (the desktop/
    // tablet/mobile workspace trees) spell the gate's own field slightly
    // differently at the call site than the original CreateQuoteDrawer.tsx
    // did (`state.profileGate.X` or a locally-destructured `gate.X`,
    // instead of a bare `profileGate.X`) — a cosmetic difference between
    // three independently-built files, not a change in the underlying
    // guarantee. The check below asserts the guarantee itself (exactly
    // these five documented props, sourced from *.missingFields etc., no
    // extra coupling to a parent's own form fields) rather than pinning
    // one file's exact variable name.
    for (const path_ of PROFILE_GATE_CONSUMERS) {
      const consumerSrc = read(path_)
      // lastIndexOf, not indexOf: DesktopWorkspace.tsx's own header comment
      // separately mentions "<CompleteClientProfile>" in prose (explaining
      // why it needs the extra conversationId prop) — that mention sits
      // before the real JSX usage, so indexOf would grab the comment
      // instead of the actual call site.
      const start = consumerSrc.lastIndexOf('<CompleteClientProfile')
      expect(start).toBeGreaterThan(-1)
      const block = consumerSrc.slice(start, consumerSrc.indexOf('/>', start))
      expect(block).toMatch(/conversationId=\{[^}]+\}/)
      expect(block).toMatch(/missingFields=\{[^}]*\.missingFields\}/)
      expect(block).toMatch(/availableFields=\{[^}]*\.availableFields\}/)
      expect(block).toMatch(/crossRecordConflicts=\{[^}]*\.crossRecordConflicts\}/)
      expect(block).toContain('onComplete={')
      // No extra coupling: exactly these five documented props, nothing
      // reaching into a parent's own amount/title/destination/visaType/etc.
      const propNames = Array.from(block.matchAll(/(\w+)=\{/g)).map(m => m[1])
      expect(new Set(propNames)).toEqual(new Set([
        'conversationId', 'missingFields', 'availableFields', 'crossRecordConflicts', 'onComplete',
      ]))
    }
  })
})

// ── Fix 3: crossRecordConflicts renders as a distinct warning ──────────────

describe('Fix 3 — crossRecordConflicts renders distinctly, not as ordinarily-missing', () => {
  it('the prop is optional and defaults to [] — purely additive for the common case', () => {
    expect(src).toContain('crossRecordConflicts?: ProfileField[]')
    expect(src).toContain('crossRecordConflicts = []')
  })

  it('the compact summary shows a distinct conflict marker instead of ✓/— Missing for a conflicted field', () => {
    const summaryBlock = src.slice(src.indexOf('<ul className="space-y-1">'), src.indexOf('</ul>'))
    expect(summaryBlock).toContain('crossRecordConflicts.includes(f)')
    expect(summaryBlock).toContain('Conflicting records')
    // The original two states are untouched — regression-proofs the empty case.
    expect(summaryBlock).toContain('✓ {availableFields[f]}')
    expect(summaryBlock).toContain('— Missing')
  })

  it('the expanded form replaces the input with an explicit resolve-via-Client-Identity warning for a conflicted missing field', () => {
    const expandedBlock = src.slice(src.indexOf('missingFields.map(f => {'), src.indexOf('{conflicts && conflicts.length > 0'))
    expect(expandedBlock).toContain('crossRecordConflicts.includes(f)')
    expect(expandedBlock).toContain('This client has conflicting records on file — resolve via Client Identity before completing this field.')
    // A non-conflicted missing field still gets its normal editable input —
    // the fix does not touch the ordinary path.
    expect(expandedBlock).toContain('<input')
  })

  it('a field that is neither missing nor conflicted is unreachable in the expanded form loop (only missingFields are ever mapped) — no new code path for the already-correct STAFF-conflict case', () => {
    // The pre-existing CONTACT_CONFLICT (staff-entered-vs-existing) rendering
    // block is untouched by this fix.
    expect(src).toContain("data?.code === 'CONTACT_CONFLICT'")
    expect(src).toContain('This does not match what is already on file')
  })
})

// ── Fix 4: focus management on gate appearance ──────────────────────────────

describe('Fix 4 — focus moves to the gate on mount', () => {
  it('a headingRef + mount-only useEffect focuses the gate\'s own heading', () => {
    expect(src).toContain("import { useEffect, useRef, useState } from 'react'")
    expect(src).toContain('const headingRef = useRef<HTMLParagraphElement>(null)')
    const focusIdx = src.indexOf('headingRef.current?.focus()')
    expect(focusIdx).toBeGreaterThan(-1)
    // The call sits inside a useEffect with an EMPTY dependency array — a
    // mount-only effect, which is what makes this fire exactly once per
    // fresh instance (this component remounts each time the gate appears —
    // see the file's own header comment on the effect).
    const before = src.slice(Math.max(0, focusIdx - 60), focusIdx)
    const after = src.slice(focusIdx, focusIdx + 60)
    expect(before).toContain('useEffect(() => {')
    expect(after).toContain('}, [])')
  })

  it('the heading element is programmatically focusable and wired to the ref', () => {
    const refIdx = src.indexOf('ref={headingRef}')
    expect(refIdx).toBeGreaterThan(-1)
    // NOTE: 'Client details required' also appears earlier, in this file's
    // own top-of-file doc comment describing the rendered pattern — search
    // for the occurrence AT OR AFTER the ref, i.e. the actual JSX heading.
    const headingBlock = src.slice(refIdx, src.indexOf('Client details required', refIdx))
    expect(headingBlock).toContain('tabIndex={-1}')
    // The ref/tabIndex attributes sit on the SAME element that renders the
    // gate's heading text — not some unrelated node.
    expect(headingBlock.length).toBeLessThan(300)
  })

  it('this is owned entirely by CompleteClientProfile — no per-drawer focus-management duplication was added for the gate', () => {
    // QUOTE BUILDER V1.2: profileGate itself is no longer referenced at all
    // in CreateQuoteDrawer.tsx (this check is vacuously true for it now —
    // still included for completeness) — it moved into the three
    // breakpoint workspace trees, checked here too since that's where the
    // real risk of a duplicated focus effect would actually show up.
    for (const path_ of [...DRAWERS, ...PROFILE_GATE_CONSUMERS]) {
      const consumerSrc = read(path_)
      // Every drawer/workspace already has ITS OWN focus-trap/restore logic
      // for the whole panel (closeRef/restoreRef) — this fix must not add a
      // second, gate-specific focus effect alongside it.
      expect(consumerSrc).not.toMatch(/profileGate[\s\S]{0,80}\.focus\(\)/)
    }
  })
})
