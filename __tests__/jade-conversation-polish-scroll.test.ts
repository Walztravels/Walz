/**
 * Jade Conversation Polish — guarded auto-scroll predicate.
 *
 * `isNearBottom` is the pure function both chat surfaces (PortalJadeChat and
 * the Trip Planner "Ask Jade" tab) use to decide whether a newly-appended
 * message should auto-scroll the view (reader is already following along)
 * or hold position and surface the restrained "New message" pill instead
 * (reader has scrolled up). Extracted into lib/jade-club/chat-scroll.ts so
 * the decision logic can be verified without mounting a component or
 * faking a real DOM scroll container.
 */
import { isNearBottom } from '@/lib/jade-club/chat-scroll'

describe('isNearBottom', () => {
  it('is true when scrolled exactly to the bottom', () => {
    expect(isNearBottom({ scrollTop: 1000, scrollHeight: 1200, clientHeight: 200 })).toBe(true)
  })

  it('is true when within the default threshold of the bottom', () => {
    // 1200 - 950 - 200 = 50px from bottom, inside the 64px default threshold
    expect(isNearBottom({ scrollTop: 950, scrollHeight: 1200, clientHeight: 200 })).toBe(true)
  })

  it('is false when scrolled well above the bottom', () => {
    // 1200 - 500 - 200 = 500px from bottom
    expect(isNearBottom({ scrollTop: 500, scrollHeight: 1200, clientHeight: 200 })).toBe(false)
  })

  it('is false just past the threshold boundary', () => {
    // 1200 - 935 - 200 = 65px from bottom, 1px past the 64px default threshold
    expect(isNearBottom({ scrollTop: 935, scrollHeight: 1200, clientHeight: 200 })).toBe(false)
  })

  it('is true right at the threshold boundary (inclusive)', () => {
    // 1200 - 936 - 200 = 64px from bottom, exactly the default threshold
    expect(isNearBottom({ scrollTop: 936, scrollHeight: 1200, clientHeight: 200 })).toBe(true)
  })

  it('is true when content does not overflow the container at all', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 200 })).toBe(true)
  })

  it('respects a custom threshold', () => {
    const metrics = { scrollTop: 900, scrollHeight: 1200, clientHeight: 200 } // 100px from bottom
    expect(isNearBottom(metrics, 50)).toBe(false)
    expect(isNearBottom(metrics, 150)).toBe(true)
  })

  it('never mutates the metrics object passed in', () => {
    const metrics = { scrollTop: 900, scrollHeight: 1200, clientHeight: 200 }
    const copy = { ...metrics }
    isNearBottom(metrics)
    expect(metrics).toEqual(copy)
  })
})
