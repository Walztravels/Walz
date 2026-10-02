/**
 * @jest-environment jsdom
 *
 * Orbit Creative Studio — app/admin/orbit/studio/page.tsx `?returnTo=` LOW
 * open-redirect regression suite.
 *
 * BACKGROUND: the page previously rendered its "← Back to campaign" link as:
 *
 *   const returnTo = params.get('returnTo')
 *   ...
 *   {returnTo && returnTo.startsWith('/admin/') && (
 *     <Link href={returnTo}>← Back to campaign</Link>
 *   )}
 *
 * Same bug family as the two already-fixed CRITICAL findings (a raw-string
 * prefix check instead of validating the normalized/parsed path) — LOW
 * severity here specifically because the sink is a `<Link href>` requiring a
 * user click, not an automatic post-auth redirect. A payload like
 * `/admin/../../../login` literally starts with `/admin/` but the WHATWG URL
 * parser's dot-segment normalization resolves it outside `/admin` entirely.
 *
 * THE FIX: reuses the existing, already triple-reviewed `safeAdminCallback`
 * from lib/safe-redirect.ts (no new validator, lib/safe-redirect.ts itself
 * untouched):
 *
 *   const returnTo = safeAdminCallback(params.get('returnTo'))
 *   ...
 *   {returnTo && <Link href={returnTo}>← Back to campaign</Link>}
 *
 * This suite tests the ACTUAL component's rendered output (whether the
 * "← Back to campaign" link renders at all, and what `href` it gets) — not
 * just the pure `safeAdminCallback` helper in isolation (that already has
 * its own dedicated coverage in __tests__/admin-login-adversarial-redirect
 * .test.tsx and __tests__/safe-redirect.test.ts, re-run unmodified
 * alongside this suite).
 */

const ADVERSARIAL_PAYLOADS: Array<{ name: string; payload: string }> = [
  { name: 'absolute external URL (https)', payload: 'https://evil.example' },
  { name: 'protocol-relative //evil.example', payload: '//evil.example' },
  { name: 'backslash variant /\\evil.example', payload: '/\\evil.example' },
  { name: 'backslash variant /\\/evil.example', payload: '/\\/evil.example' },
  { name: 'raw TAB control char /\t/evil.example', payload: '/\t/evil.example' },
  { name: 'raw LF control char /\n/evil.example', payload: '/\n/evil.example' },
  { name: 'raw CR control char /\r/evil.example', payload: '/\r/evil.example' },
  { name: 'dot-segment traversal /admin/../../../login', payload: '/admin/../../../login' },
  { name: 'encoded dot-segment /admin/%2e%2e/%2e%2e/etc/passwd', payload: '/admin/%2e%2e/%2e%2e/etc/passwd' },
  { name: 'javascript: scheme', payload: 'javascript:alert(document.cookie)' },
  { name: 'data: scheme', payload: 'data:text/html,<script>alert(1)</script>' },
  { name: 'non-admin same-origin path /dashboard', payload: '/dashboard' },
  { name: 'non-admin same-origin path /business', payload: '/business' },
  { name: 'prefix-boundary bypass /admino', payload: '/admino' },
  { name: 'prefix-boundary bypass /administrator', payload: '/administrator' },
]

// Post-decode control-character variant, as it would actually arrive through
// useSearchParams()/URLSearchParams decoding of an encoded query string.
function decodedControlCharPayload(): string {
  const url = new URL('https://www.walztravels.com/admin/orbit/studio?returnTo=%2F%09%2Fevil.example')
  return url.searchParams.get('returnTo')!
}

async function renderStudioPage(returnToParam: string | null) {
  jest.resetModules()
  const mockParams = new URLSearchParams()
  if (returnToParam !== null) mockParams.set('returnTo', returnToParam)

  jest.doMock('next/navigation', () => ({
    useSearchParams: () => mockParams,
  }))

  // The real CreativeStudioSection pulls in the full designer/composer
  // stack (canvas compositing, AI generation, etc.) which is irrelevant to
  // this redirect-sink test and far too heavy to mount here — stub it with
  // an inert placeholder, matching how the page only ever reads its props.
  jest.doMock('@/app/admin/orbit/campaigns/[id]/CreativeStudioSection', () => ({
    __esModule: true,
    CreativeStudioSection: () => null,
  }))

  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { act } = React
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const StudioPage = require('@/app/admin/orbit/studio/page').default
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(StudioPage))
    await new Promise(r => setTimeout(r, 0))
  })

  const backLink = Array.from(container.querySelectorAll('a')).find(a =>
    a.textContent?.includes('Back to campaign'),
  ) as HTMLAnchorElement | undefined

  act(() => root.unmount())
  container.remove()

  return backLink
}

describe('INTEGRATION: app/admin/orbit/studio/page.tsx routes returnTo through safeAdminCallback', () => {
  it('imports and calls safeAdminCallback, and no longer contains the old raw-prefix check', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/admin/orbit/studio/page.tsx'), 'utf-8')
    expect(src).toContain("import { safeAdminCallback } from '@/lib/safe-redirect'")
    expect(src).toContain("safeAdminCallback(params.get('returnTo'))")
    expect(src).not.toContain("returnTo.startsWith('/admin/')")
  })
})

describe('INTEGRATION: the actual "← Back to campaign" Link, adversarial returnTo values', () => {
  it.each(ADVERSARIAL_PAYLOADS)(
    'a malicious ?returnTo=$name never renders the back-link at all',
    async ({ payload }) => {
      const backLink = await renderStudioPage(payload)
      expect(backLink).toBeUndefined()
    },
  )

  it('rejects a post-decode control-character variant exactly as it would arrive via searchParams.get()', async () => {
    const backLink = await renderStudioPage(decodedControlCharPayload())
    expect(backLink).toBeUndefined()
  })

  it('no ?returnTo param at all renders no back-link (unchanged default behavior)', async () => {
    const backLink = await renderStudioPage(null)
    expect(backLink).toBeUndefined()
  })
})

describe('INTEGRATION: the actual "← Back to campaign" Link, legitimate admin returnTo values', () => {
  const LEGITIMATE = ['/admin', '/admin/orbit/campaigns/cmp_123', '/admin/orbit/campaigns/cmp_123?tab=creative#top']

  it.each(LEGITIMATE)('a legitimate ?returnTo=%s renders the back-link with that exact sanitized href', async (value) => {
    const backLink = await renderStudioPage(value)
    expect(backLink).toBeDefined()
    expect(backLink!.getAttribute('href')).toBe(value)
    expect(backLink!.textContent).toContain('Back to campaign')
  })

  it('a dot-segment payload that normalizes BACK INTO /admin is accepted with the normalized href, not the raw string', async () => {
    const raw = '/admin/orbit/campaigns/foo/../bar'
    const backLink = await renderStudioPage(raw)
    expect(backLink).toBeDefined()
    expect(backLink!.getAttribute('href')).toBe('/admin/orbit/campaigns/bar')
    expect(backLink!.getAttribute('href')).not.toBe(raw)
  })
})
