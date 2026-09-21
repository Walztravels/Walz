/**
 * Cross-feature integration fix — ONE real Twilio Device per browser tab,
 * even though THREE independent trees can each mount their own
 * <TeamCallDeviceProvider>:
 *   - app/admin/team/page.tsx (the full Team Hub page)
 *   - app/admin/inbox/team-float/FloatingTeamWorkspace.tsx (Inbox's
 *     client-linked Floating Ask Team workspace — Feature "Inbox Floating
 *     Ask Team Workspace")
 *   - app/admin/team/floating/FloatingTeamHubProvider.tsx (the Admin-wide
 *     Floating Team Hub — Feature "Admin-wide Floating Team Hub")
 *
 * The Inbox workspace only guards against the FULL PAGE ("only mounted
 * while at least one Ask Team tab is open"); the admin-wide hub only
 * guards against the FULL PAGE too (force-closes on /admin/team). Neither
 * guards against the OTHER floating feature, and both are simultaneously
 * mountable on /admin/inbox (a staff member can have an Ask Team tab open
 * AND click the sidebar's Team Hub button without leaving /admin/inbox).
 *
 * Before this fix, useTeamCallDevice() held all its state in per-hook-
 * instance useState/useRef, so each independently-mounted
 * <TeamCallDeviceProvider> created and registered its OWN Twilio `Device`
 * for the SAME staff identity — two live Devices in one tab, able to
 * drift out of sync or double-handle the same incoming call.
 *
 * This codebase has no React Testing Library / component-mounting harness
 * (jest.config.ts: testEnvironment 'node', no @testing-library dependency),
 * so — matching the convention already used by
 * team-float-workspace-integration.test.ts (source-shape assertions) and
 * team-float-state.test.ts (direct calls into exported pure logic) — this
 * test exercises the module's own reference-counted acquire/release pair
 * directly (exposed for tests only via `__teamCallDeviceInternal`,
 * mirroring exactly what each <TeamCallDeviceProvider>'s mount/unmount
 * effect does) rather than mounting real React components.
 */
import fs from 'fs'
import path from 'path'
import { __teamCallDeviceInternal } from '@/app/admin/team/calls/useTeamCallDevice'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const hookSrc = () => read('app/admin/team/calls/useTeamCallDevice.ts')

describe('useTeamCallDevice — module-level singleton (shared across all mounted providers)', () => {
  beforeEach(() => {
    __teamCallDeviceInternal.__resetForTests()
  })

  it('starts with zero mounted consumers and no Device', () => {
    expect(__teamCallDeviceInternal.getRefCount()).toBe(0)
    expect(__teamCallDeviceInternal.hasDevice()).toBe(false)
  })

  it('two independent providers mounting (Inbox workspace + admin-wide hub, both on /admin/inbox) share ONE ref-counted lifecycle instead of each owning their own', () => {
    // Feature 1 (Inbox's Floating Ask Team workspace) mounts its
    // <TeamCallDeviceProvider> first.
    __teamCallDeviceInternal.acquire()
    expect(__teamCallDeviceInternal.getRefCount()).toBe(1)

    // Feature 2 (the Admin-wide Floating Team Hub) ALSO mounts its own,
    // independent <TeamCallDeviceProvider>, while Feature 1's is still up —
    // exactly the /admin/inbox collision scenario. This must NOT create a
    // second Device lifecycle: it just increments the shared ref count.
    __teamCallDeviceInternal.acquire()
    expect(__teamCallDeviceInternal.getRefCount()).toBe(2)

    // Feature 1's Ask Team tab closes (its provider unmounts) while
    // Feature 2's admin-wide hub is still open — the shared Device must
    // stay alive for the remaining consumer, not get torn down.
    __teamCallDeviceInternal.release()
    expect(__teamCallDeviceInternal.getRefCount()).toBe(1)

    // Only once the LAST mounted provider releases does the shared
    // lifecycle actually tear down.
    __teamCallDeviceInternal.release()
    expect(__teamCallDeviceInternal.getRefCount()).toBe(0)
  })

  it('release() never drops the ref count below zero (defensive — an extra/duplicate cleanup call must not desync the count)', () => {
    __teamCallDeviceInternal.acquire()
    __teamCallDeviceInternal.release()
    __teamCallDeviceInternal.release() // extra release with nothing acquired
    expect(__teamCallDeviceInternal.getRefCount()).toBe(0)
  })
})

describe('useTeamCallDevice — source-shape proof of the singleton wiring', () => {
  it('holds Device/call state at module scope, not per-hook-instance useState/useRef', () => {
    const s = hookSrc()
    // The shared mutable state lives in module-level `let` bindings...
    expect(s).toMatch(/let sharedState: SharedCallState = INITIAL_STATE/)
    expect(s).toMatch(/let device: Device \| null = null/)
    expect(s).toMatch(/let refCount = 0/)
    // ...and the exported hook reads it via useSyncExternalStore (a shared
    // external store), not useState/useRef holding its own private copy.
    expect(s).toContain('useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)')
  })

  it('acquireDevice() only initializes the Device on the 0 -> 1 transition, and releaseDevice() only tears it down on the 1 -> 0 transition', () => {
    const s = hookSrc()
    expect(s).toMatch(/function acquireDevice\(\): void \{\s*refCount \+= 1\s*if \(refCount === 1\) initDevice\(\)/)
    expect(s).toMatch(/function releaseDevice\(\): void \{\s*refCount = Math\.max\(0, refCount - 1\)\s*if \(refCount === 0\) teardownDevice\(\)/)
  })

  it('every useTeamCallDevice() call site (all three <TeamCallDeviceProvider> mount points) acquires/releases the SAME shared singleton via the hook\'s own effect', () => {
    expect(hookSrc()).toMatch(/useEffect\(\(\) => \{\s*acquireDevice\(\)\s*return \(\) => releaseDevice\(\)\s*\}, \[\]\)/)
  })

  it('the pagehide phantom-participant beacon is registered ONCE at module load (shared `meta`), not once per mounted provider — avoids a duplicate sendBeacon per concurrently-mounted feature', () => {
    const s = hookSrc()
    const occurrences = s.match(/addEventListener\('pagehide'/g) ?? []
    expect(occurrences.length).toBe(1)
    // Confirms it is the top-level, module-scope registration (guarded only
    // by `typeof window`), not one nested inside useTeamCallDevice()/a
    // per-instance effect.
    expect(s).toMatch(/if \(typeof window !== 'undefined'\) \{\s*window\.addEventListener\('pagehide'/)
  })
})

describe('Both TeamCallDeviceProvider mount sites still exist and both still mount the shared provider + overlay (architecture unchanged, only the underlying Device is now shared)', () => {
  it('Inbox Floating Ask Team workspace still mounts its own <TeamCallDeviceProvider> + <IncomingCallOverlay/> exactly as before', () => {
    const s = read('app/admin/inbox/team-float/FloatingTeamWorkspace.tsx')
    expect(s).toContain('<TeamCallDeviceProvider>')
    expect(s).toContain('<IncomingCallOverlay />')
  })

  it('Admin-wide Floating Team Hub still mounts its own <TeamCallDeviceProvider> + <IncomingCallOverlay/> exactly as before', () => {
    const s = read('app/admin/team/floating/FloatingTeamHubProvider.tsx')
    expect(s).toContain('<TeamCallDeviceProvider>')
    expect(s).toContain('<IncomingCallOverlay />')
  })
})
