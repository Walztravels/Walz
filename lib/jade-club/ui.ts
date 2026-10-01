// lib/jade-club/ui.ts — shared presentation-only tokens for Jade Travel Club
// customer-facing surfaces (Digital Jade Card, /dashboard/club, Ask Jade
// message content). Styling only — no business logic, no data access.
//
// Introduced in the Jade Customer Experience Polish pass (step 5,
// accessibility/responsive consistency) to de-duplicate the identical
// focus-visible ring class string that had been copy-pasted inline across
// app/dashboard/club/page.tsx, app/dashboard/club/card/page.tsx, and
// RotateQrButton.tsx in earlier steps of the same pass — a single source
// now keeps all three (plus JadeMessageContent's rendered links) from
// drifting apart.

/**
 * Keyboard-only focus ring (no ring on mouse click) in the established gold
 * brand color, with an offset tuned for this surface's near-black
 * background (#060e1c). Apply alongside `focus:outline-none`.
 */
export const JADE_FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060e1c]'
