/**
 * Client-safe pieces of the Speak-to-a-Human handoff.
 *
 * Split out of lib/jade/human-handoff.ts so the floating widget control
 * (a 'use client' component rendered in the ROOT layout) can compute its
 * state without importing the handoff engine — that module pulls in
 * Prisma, the conversation router and the email stack (node crypto),
 * which otherwise land in the first-load JS of every page.
 */
export type SpeakToHumanControlState = 'speak_button' | 'human_active' | 'hidden'

/**
 * Pure state function for the floating control:
 *  - Jade-owned open chat → "Speak to a Human" button
 *  - human-owned chat     → "Human Support Active" pill (no handoff action)
 *  - chat closed          → hidden
 * Cancelling the selector performs NO transition — ownership stays with Jade.
 */
export function speakToHumanControlState(opts: { chatOpen: boolean; isHandedOff: boolean }): SpeakToHumanControlState {
  if (!opts.chatOpen) return 'hidden'
  return opts.isHandedOff ? 'human_active' : 'speak_button'
}
