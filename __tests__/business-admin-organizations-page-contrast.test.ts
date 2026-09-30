// __tests__/business-admin-organizations-page-contrast.test.ts
//
// Regression guardrail for a production acceptance defect: the Organizations
// table on app/admin/business/page.tsx used raw inline styles with no
// explicit text color anywhere, so every element inherited the browser
// default (near-black) against app/admin/layout.tsx's dark navy
// (bg-[#0a1628]) shell — invisible until manually selected/highlighted.
//
// This is a static-source assertion test (matching the established pattern
// in lib/jade-club/__tests__/regression-miles-and-freeze.test.ts) rather
// than a rendered-DOM test, since this repo has no React Testing Library
// harness set up for 'use client' admin pages. It guards two things:
// zero unstyled inline `style={{` attributes ever creep back in, and the
// specific Tailwind contrast/hover/focus/responsive classes that fixed this
// defect remain present.

import fs from 'fs'
import path from 'path'

const PAGE_PATH = path.join(__dirname, '..', 'app', 'admin', 'business', 'page.tsx')

function readPageSource(): string {
  return fs.readFileSync(PAGE_PATH, 'utf8')
}

describe('Walz Business admin Organizations page — contrast regression guardrail', () => {
  const src = readPageSource()

  it('never uses a raw inline `style={{` attribute (the root cause of the invisible-text defect)', () => {
    expect(src).not.toMatch(/style=\{\{/)
  })

  it('the page heading has an explicit light text color against the dark admin shell', () => {
    expect(src).toMatch(/<h1[^>]*className="[^"]*text-white[^"]*"/)
  })

  it('table header row has an explicit (muted) text color, not inherited default', () => {
    expect(src).toMatch(/<tr className="[^"]*text-white\/40[^"]*"/)
  })

  it('table body cells have explicit text color classes (primary and secondary hierarchy)', () => {
    expect(src).toMatch(/<td className="[^"]*text-white"[^>]*>\{org\.tradingName/)
    expect(src).toMatch(/<td className="[^"]*text-white\/60[^"]*"[^>]*>\{org\.country\}/)
  })

  it('table rows have a hover state (not just default/static)', () => {
    expect(src).toMatch(/hover:bg-white\/3/)
  })

  it('form inputs have a visible focus state', () => {
    expect(src).toMatch(/focus:ring-2/)
  })

  it('the table is wrapped for responsive/mobile horizontal scroll, matching this admin\'s established table pattern', () => {
    expect(src).toMatch(/overflow-x-auto/)
  })

  it('the submit button uses the Walz Admin gold accent, not an unstyled/invisible default', () => {
    expect(src).toMatch(/bg-\[#C9A84C\]/)
  })

  it('did not change the form field set or table columns (no business-logic/data-shape change)', () => {
    // Same three create-form fields as before the fix.
    expect(src).toMatch(/legalName: ''.*country: ''.*businessEmail: ''/s)
    // Same five table columns as before the fix.
    for (const col of ['Legal name', 'Country', 'Email', 'Status', 'Currency']) {
      expect(src).toContain(`>${col}<`)
    }
  })

  it('did not change the API endpoints or HTTP methods called', () => {
    expect(src).toMatch(/fetch\('\/api\/admin\/business\/organizations'\)/)
    expect(src).toMatch(/method: 'POST'/)
  })
})
