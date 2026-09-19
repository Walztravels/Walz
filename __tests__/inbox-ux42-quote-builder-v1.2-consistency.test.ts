/**
 * QUOTE BUILDER V1.2 closing fix — breakpoint-consistency test for the
 * "Walz Service" item-type classification fix (QA finding #4 + the
 * mandatory investigation result).
 *
 * Investigation result (already confirmed, applied directly by this closing
 * pass): the canonical generic/catch-all Quote item type in this codebase
 * is 'custom' (the fallback icon bucket in app/admin/quotes/new/page.tsx),
 * NOT 'package' (a real, different item type — an actual bundled travel
 * package product). desktop/ServicesRail.tsx already used 'custom'
 * correctly; mobile/MobileWorkspace.tsx, mobile/panels/ManualItemPanel.tsx
 * and tablet/TabletWorkspace.tsx incorrectly used 'package' and have now
 * been fixed to match.
 *
 * Each of the three breakpoint trees implements its own `countFor`/counting
 * function inline (a deliberate small presentational duplication, not a
 * shared business-logic helper) rather than importing one shared function —
 * none of the three exports it as a standalone named function, so this test
 * reconstructs each one from its own source text (brace-matched extraction,
 * TS type annotations stripped) and actually EXECUTES all three against the
 * same synthetic fixture, asserting identical numeric results for all 7
 * ServiceKey values. This is a behavioral pin, not a string-content check —
 * it would catch a future regression even if the source text changed in a
 * way that preserved the bug (e.g. reintroducing 'package' under a
 * different literal).
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

type CountFor = (state: { attachedLive: { type: string }[]; items: { type: string }[] }, key: string) => number

/**
 * Extracts `function countFor(state: ..., key: ...): number { ... }` from a
 * source file via brace-matching (robust to comments/whitespace inside the
 * body), strips the TypeScript-only signature syntax (parameter type
 * annotations + return type annotation — the only TS-specific syntax any of
 * the three bodies contain), and compiles it into a callable JS function via
 * the Function constructor.
 */
function extractCountFor(src: string): CountFor {
  const signatureNeedle = 'function countFor(state: QuoteBuilderState, key: ServiceKey): number {'
  const sigIdx = src.indexOf(signatureNeedle)
  if (sigIdx === -1) throw new Error('countFor signature not found — source may have changed shape')

  const bodyStart = sigIdx + signatureNeedle.length - 1 // index of the opening '{'
  let depth = 0
  let i = bodyStart
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) throw new Error('could not brace-match countFor body')

  const body = src.slice(bodyStart + 1, i) // inner body, excluding outer braces
  // eslint-disable-next-line no-new-func
  return new Function('state', 'key', body) as CountFor
}

const desktopServicesRailSrc = read('app/admin/inbox/components/quote-builder/desktop/ServicesRail.tsx')
const mobileWorkspaceSrc = read('app/admin/inbox/components/quote-builder/mobile/MobileWorkspace.tsx')
const tabletWorkspaceSrc = read('app/admin/inbox/components/quote-builder/tablet/TabletWorkspace.tsx')

const desktopCountFor = extractCountFor(desktopServicesRailSrc)
const mobileCountFor = extractCountFor(mobileWorkspaceSrc)
const tabletCountFor = extractCountFor(tabletWorkspaceSrc)

// Minimal fixture covering all 7 ServiceKey buckets:
//   flight/hotel/activity/transfer -> state.attachedLive, by `type`
//   visa                           -> state.items, type 'visa_service'
//   walz_service                   -> state.items, type 'custom' (the fix)
//   manual                         -> state.items, any other type (e.g. 'tour')
const fixtureState = {
  attachedLive: [
    { type: 'flight' }, { type: 'flight' },
    { type: 'hotel' },
    { type: 'activity' },
    { type: 'transfer' }, { type: 'transfer' }, { type: 'transfer' },
  ],
  items: [
    { type: 'visa_service' },
    { type: 'custom' }, { type: 'custom' },
    { type: 'tour' },
  ],
}

const EXPECTED: Record<string, number> = {
  flight: 2,
  hotel: 1,
  activity: 1,
  transfer: 3,
  visa: 1,
  walz_service: 2,
  manual: 1,
}

const SERVICE_KEYS = Object.keys(EXPECTED)

describe('QA finding #4 / item-type classification investigation — breakpoint counting consistency', () => {
  it.each(SERVICE_KEYS)('desktop/ServicesRail.tsx, mobile/MobileWorkspace.tsx and tablet/TabletWorkspace.tsx all compute the SAME count for ServiceKey "%s"', (key) => {
    const d = desktopCountFor(fixtureState, key)
    const m = mobileCountFor(fixtureState, key)
    const t = tabletCountFor(fixtureState, key)
    expect(d).toBe(EXPECTED[key])
    expect(m).toBe(EXPECTED[key])
    expect(t).toBe(EXPECTED[key])
  })

  it('walz_service specifically counts type \'custom\', never \'package\', in all three trees (the regression this fix closes)', () => {
    const stateWithPackageItem = {
      attachedLive: [],
      items: [{ type: 'package' }, { type: 'custom' }],
    }
    // A stray 'package'-typed item (a real bundled travel package product,
    // per the investigation result) must NOT be counted as walz_service —
    // only the 'custom' item should be.
    expect(desktopCountFor(stateWithPackageItem, 'walz_service')).toBe(1)
    expect(mobileCountFor(stateWithPackageItem, 'walz_service')).toBe(1)
    expect(tabletCountFor(stateWithPackageItem, 'walz_service')).toBe(1)
    // ...and it falls into "manual" instead (everything not visa_service/custom).
    expect(desktopCountFor(stateWithPackageItem, 'manual')).toBe(1)
    expect(mobileCountFor(stateWithPackageItem, 'manual')).toBe(1)
    expect(tabletCountFor(stateWithPackageItem, 'manual')).toBe(1)
  })
})

describe('mobile/panels/ManualItemPanel.tsx — item-type clobber fix (QA finding #4)', () => {
  const mobileManualItemPanelSrc = read('app/admin/inbox/components/quote-builder/mobile/panels/ManualItemPanel.tsx')
  const desktopManualItemPanelSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/ManualItemPanel.tsx')

  it('mobile no longer auto-sets itemType on variant change (the useEffect that silently overwrote a staff-picked type, and never restored it, is removed entirely)', () => {
    expect(mobileManualItemPanelSrc).not.toContain("setItemType('package')")
    expect(mobileManualItemPanelSrc).not.toMatch(/useEffect\(\(\) => \{\s*if \(variant === 'walz_service'/)
    expect(mobileManualItemPanelSrc).not.toContain("import { useEffect } from 'react'")
  })

  it('mobile filters relevantItems by \'custom\' (not \'package\'), matching desktop\'s own filter exactly', () => {
    const mobileFilterIdx = mobileManualItemPanelSrc.indexOf('const relevantItems = items.filter')
    expect(mobileFilterIdx).toBeGreaterThan(-1)
    const mobileFilterBlock = mobileManualItemPanelSrc.slice(mobileFilterIdx, mobileFilterIdx + 250)
    expect(mobileFilterBlock).toContain("if (variant === 'walz_service') return i.type === 'custom'")
    expect(mobileFilterBlock).toContain("return i.type !== 'visa_service' && i.type !== 'custom'")
    expect(mobileFilterBlock).not.toContain("'package'")
  })

  it('mobile documents the same deliberate non-behavior desktop already documents (no silent auto-overwrite of a staff-picked type)', () => {
    // Desktop's own rationale, kept as the shared source of truth for the
    // "why" — mobile's fix mirrors it with an equivalent explanatory
    // comment rather than just deleting code silently.
    expect(desktopManualItemPanelSrc).toMatch(/silently overwriting whatever the\s*\n?\/\/\s*staff member already picked/)
    expect(mobileManualItemPanelSrc).toMatch(/silently overwriting whatever the staff member/)
  })
})
