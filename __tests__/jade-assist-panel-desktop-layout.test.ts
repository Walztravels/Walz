/**
 * V1.4 closing fix — independent QA review found the original floating
 * desktop "Write with Jade" card geometrically occluded both the
 * ClientInfo rail and the composer's Send button (a panel wide enough to
 * be usable cannot avoid overlapping a fixed-position float alongside a
 * 288px rail at the lg breakpoint). Fixed by making the panel a peer panel
 * that replaces the rail's slot, exactly like the existing "Ask Jade"
 * copilot — without touching the two frozen source-pin tests
 * (inbox-ux2-conversation.test.ts, inbox-action-centre-drawer-shell.test.ts)
 * that assert the literal `{selected && !copilotOpen && (` rail condition.
 */
import fs from 'fs'

const pageSrc = fs.readFileSync(require.resolve('@/app/admin/inbox/page'), 'utf8')
const panelSrc = fs.readFileSync(require.resolve('@/app/admin/inbox/components/JadeAssistPanel'), 'utf8')

describe('ClientInfo rail visibility — hidden while EITHER Jade panel is open', () => {
  it('the pinned substring still appears verbatim (does not break the two frozen tests)', () => {
    expect(pageSrc).toContain('{selected && !copilotOpen && (')
  })

  it('the pinned condition is now wrapped in an outer !jadeAssistOpen check, not edited in place', () => {
    expect(pageSrc).toMatch(/\{!jadeAssistOpen && \(\s*<>\s*\{selected && !copilotOpen && \(/)
  })
})

describe('JadeAssistPanel desktop layout — peer panel, not a floating overlay', () => {
  it('uses the same peer-panel treatment as InboxJadeCopilot (w-[400px] flex-shrink-0, no fixed/floating positioning)', () => {
    expect(panelSrc).toContain('hidden lg:flex flex-col w-[400px] flex-shrink-0 min-h-0 h-full bg-white border-l border-walz-border')
  })

  it('no longer uses fixed bottom-right floating positioning on desktop', () => {
    expect(panelSrc).not.toMatch(/hidden lg:flex flex-col fixed bottom-6 right-6/)
  })
})
