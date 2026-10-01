// lib/jade-club/chat-scroll.ts — shared scroll-position helper for Jade chat
// surfaces (the Ask Jade portal panel and the Trip Planner "Ask Jade" tab).
// Presentation state only — decides whether a newly-appended chat message
// should auto-scroll the view (the reader is already following the
// conversation) or should hold position and surface a restrained "New
// message" affordance instead (the reader has scrolled up to re-read
// something and should not be yanked back down).

export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * True when the viewport is already at/near the bottom of a scrollable
 * element, within `threshold` px. Pure function — exported for unit tests —
 * so the guarded-auto-scroll predicate can be verified without mounting a
 * component or faking a real DOM scroll container.
 */
export function isNearBottom(el: ScrollMetrics, threshold = 64): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}
