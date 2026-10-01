/**
 * Jade Customer Experience Polish (4/5) — Trip Planner Jade icon consistency.
 *
 * The original jade-icon-polish branch swapped Sparkles -> ConciergeBell for
 * every "Ask Jade" concept inside the app/dashboard tree and the portal nav
 * components, but missed app/plan/[tripId]/page.tsx and app/plan/new/page.tsx — both
 * reachable from the portal sidebar's "Trip Planner" entry and both still
 * using the generic Sparkles icon for the same "Ask Jade"/"Jade AI" concept.
 * This file locks in that fix and confirms the explicitly out-of-scope
 * app/plan/library/page.tsx ("Templates", not confirmed Jade-branded) was
 * deliberately left untouched.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

describe('app/plan/[tripId]/page.tsx — Ask Jade now uses ConciergeBell', () => {
  const src = read('app/plan/[tripId]/page.tsx')

  it('imports ConciergeBell and no longer imports Sparkles', () => {
    expect(src).toMatch(/\bConciergeBell\b/)
    expect(src).not.toMatch(/\bSparkles\b/)
  })

  it('the "Ask Jade" panel tab icon is ConciergeBell', () => {
    expect(src).toMatch(/label:\s*'Ask Jade',\s*icon:\s*ConciergeBell/)
  })

  it('the "Ask Jade to plan it" empty-state button icon is ConciergeBell', () => {
    expect(src).toContain('<ConciergeBell className="w-4 h-4" /> Ask Jade to plan it')
  })

  it('both chat-avatar ConciergeBell icons (message + thinking indicator) are present', () => {
    expect(src).toContain('<ConciergeBell className="w-4 h-4 text-[#C9A84C]" />')
    expect(src).toContain('<ConciergeBell className="w-4 h-4 text-[#C9A84C] animate-pulse" />')
  })
})

describe('app/plan/new/page.tsx — "Let Jade plan" now uses ConciergeBell, gold instead of purple', () => {
  const src = read('app/plan/new/page.tsx')

  it('imports ConciergeBell and no longer imports Sparkles', () => {
    expect(src).toMatch(/\bConciergeBell\b/)
    expect(src).not.toMatch(/\bSparkles\b/)
  })

  it('the "Let Jade plan it" path-card icon is ConciergeBell', () => {
    expect(src).toMatch(/icon=\{<ConciergeBell className="w-7 h-7" \/>\}\s*\n\s*title="Let Jade plan it"/)
  })

  it('the "Jade AI will plan this" callout uses the established gold token, not purple', () => {
    expect(src).toContain('bg-[#C9A84C]/10 border border-[#C9A84C]/20')
    expect(src).toContain('<ConciergeBell className="w-5 h-5 text-[#C9A84C] flex-shrink-0 mt-0.5" />')
    expect(src).toContain('<p className="text-sm font-semibold text-[#C9A84C]">Jade AI will plan this</p>')
    expect(src).not.toMatch(/purple-600\/10|purple-500\/20|text-purple-400|text-purple-300/)
  })

  it('the "Create & let Jade plan" submit-button icon is ConciergeBell', () => {
    expect(src).toContain('<ConciergeBell className="w-4 h-4" />Create & let Jade plan')
  })
})

describe('app/plan/library/page.tsx — deliberately untouched (Decision 3)', () => {
  it('still uses Sparkles for its "Templates" feature — not changed in this release', () => {
    const src = read('app/plan/library/page.tsx')
    expect(src).toMatch(/\bSparkles\b/)
  })
})
