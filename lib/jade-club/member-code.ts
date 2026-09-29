// lib/jade-club/member-code.ts — Public-safe Jade Travel Club member ID.
//
// Format: "JW-######" (6 random digits). This is NEVER the database id
// (cuid) and NEVER derived from it — it grants no authorization on its own
// and is safe to print on a card or show on screen. There is no lookup
// endpoint that resolves a memberCode back to account data (QR verification
// uses a separate signed token — see lib/jade-club/qr-token.ts), so knowing
// or guessing a memberCode reveals nothing by itself.

import { randomInt } from 'crypto'

const MEMBER_CODE_PREFIX = 'JW-'
const MEMBER_CODE_DIGITS = 6

export function generateMemberCode(): string {
  const n = randomInt(0, 10 ** MEMBER_CODE_DIGITS)
  return `${MEMBER_CODE_PREFIX}${n.toString().padStart(MEMBER_CODE_DIGITS, '0')}`
}

export function isValidMemberCode(code: string): boolean {
  return new RegExp(`^${MEMBER_CODE_PREFIX}\\d{${MEMBER_CODE_DIGITS}}$`).test(code)
}
