/**
 * Walz Team Hub V1 — calling: TeamCallRecord/TeamCallParticipant persistence
 * helpers. These are the ONLY functions that write to either table, so the
 * status-transition/duration/concurrency logic lives in exactly one place.
 *
 * Two independent shapes share the `team_calls` table, disambiguated by the
 * parent conversation's `type` (never mixed on one row — see the status
 * vocabularies below):
 *
 * DM (1:1) — `participantIds` JSON array [callerId, calleeId], statuses
 * INITIATING/RINGING/ANSWERED/DECLINED/BUSY/MISSED/ENDED/FAILED, no
 * `conferenceName`. Unchanged from the original V1 1:1 design.
 *
 * GROUP/CHANNEL — `conferenceName` (server-generated, NEVER returned to the
 * browser — the voice webhook resolves it from this column after
 * independently re-verifying live membership; see
 * app/api/team/twilio/voice/route.ts), statuses STARTED/ACTIVE/ENDED/FAILED,
 * `participantIds` unused (empty array). Real-time membership lives in
 * `TeamCallParticipant` (join/leave timestamps) — NOT the flat array, since
 * a group's participants change dynamically over the call's lifetime.
 * `TeamCallParticipant` is deliberately NEVER an authorization source by
 * itself: the join route re-checks live `TeamConversationMember` on every
 * join attempt, so holding a stale callRecordId after being removed from
 * the conversation can never produce a new participant row.
 *
 * Concurrency: at most one non-terminal (STARTED/ACTIVE) call per
 * GROUP/CHANNEL conversation is enforced at the DATABASE level via a
 * partial unique index (`uq_team_calls_one_active_per_conversation` in
 * prisma/migrations/team_hub_v1_core.sql) — `startOrJoinGroupCall` below
 * catches the resulting unique-violation race and returns the winning
 * record instead of erroring, mirroring `createOrGetDm`'s exact
 * race-safety pattern in lib/team/conversations.ts.
 *
 * There is no recording/audio/transcription reference field anywhere on
 * either table, and none should ever be added — the Team Hub V1 product
 * spec explicitly has NO call-recording feature.
 *
 * KNOWN, DELIBERATE LIMITATION — membership revoked mid-call: removing a
 * staff member from a GROUP/CHANNEL conversation while they are already
 * connected to an active call PREVENTS them from newly joining or
 * rejoining from that moment on (both the join route and the voice webhook
 * re-check live membership on every attempt), but it does NOT forcibly
 * disconnect an already-established live audio leg. Doing that would
 * require calling Twilio's REST API to kick a specific participant from
 * the live `<Conference>` (capturing and correlating each participant's
 * own Call SID via a conference status callback), which is a genuinely
 * separate integration surface, not implemented in this pass. This is an
 * honest, scoped boundary — not an oversight — and should be called out
 * as a known limitation, not silently assumed away.
 */

import prisma from '@/lib/db'
import { randomUUID } from 'crypto'

export type TeamCallStatus =
  | 'INITIATING'
  | 'RINGING'
  | 'ANSWERED'
  | 'DECLINED'
  | 'BUSY'
  | 'MISSED'
  | 'ENDED'
  | 'FAILED'

export type TeamGroupCallStatus = 'STARTED' | 'ACTIVE' | 'ENDED' | 'FAILED'

/** Terminal statuses — reaching one of these always stamps endedAt (and durationSeconds, if the call was ever answered). */
const TERMINAL_STATUSES: ReadonlySet<TeamCallStatus> = new Set([
  'DECLINED', 'BUSY', 'MISSED', 'ENDED', 'FAILED',
])

export interface CreateCallRecordInput {
  conversationId: string
  callerId: string
  /** V1 is 1:1-primary, so this is a single-element array in practice today — kept plural for the group-calling fast-follow described above. */
  calleeIds: string[]
  providerCallId?: string | null
}

/** Creates a new call record in INITIATING status. participantIds = [callerId, ...calleeIds]. */
export async function createCallRecord(input: CreateCallRecordInput) {
  return prisma.teamCallRecord.create({
    data: {
      conversationId: input.conversationId,
      callerId: input.callerId,
      participantIds: [input.callerId, ...input.calleeIds],
      providerCallId: input.providerCallId ?? null,
      status: 'INITIATING',
    },
  })
}

export interface UpdateCallRecordStatusOptions {
  /** Attach/replace the provider (Twilio) Call SID once it's known — e.g. once the browser SDK's device.connect() resolves. */
  providerCallId?: string
}

/**
 * Transitions a call record to a new status, stamping answeredAt/endedAt and
 * computing durationSeconds where applicable. Returns null if the record
 * doesn't exist (never throws — callers decide how to respond, e.g. 404).
 */
export async function updateCallRecordStatus(
  callRecordId: string,
  status: TeamCallStatus,
  options: UpdateCallRecordStatusOptions = {},
) {
  const existing = await prisma.teamCallRecord.findUnique({ where: { id: callRecordId } })
  if (!existing) return null

  const now = new Date()
  const data: {
    status: string
    providerCallId?: string
    answeredAt?: Date
    endedAt?: Date
    durationSeconds?: number
  } = { status }

  if (options.providerCallId) data.providerCallId = options.providerCallId

  const answeredAt = status === 'ANSWERED' && !existing.answeredAt ? now : existing.answeredAt
  if (status === 'ANSWERED' && !existing.answeredAt) data.answeredAt = now

  if (TERMINAL_STATUSES.has(status)) {
    data.endedAt = now
    if (answeredAt) {
      data.durationSeconds = Math.max(0, Math.round((now.getTime() - answeredAt.getTime()) / 1000))
    }
  }

  return prisma.teamCallRecord.update({ where: { id: callRecordId }, data })
}

// ─────────────────────────────────────────────────────────────────────────
// GROUP/CHANNEL calling
// ─────────────────────────────────────────────────────────────────────────

/** Same shape as lib/team/conversations.ts's own helper — a Postgres unique-violation, however Prisma/the driver surfaces it. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | undefined
  return err?.code === 'P2002' || /unique|duplicate key|23505/i.test(err?.message ?? '')
}

/**
 * Server-generated, unguessable Twilio <Conference> friendly name — NEVER
 * derived from the conversationId or callRecordId (both of which a
 * legitimate participant already knows), and never returned to the
 * browser. This value existing/being knowable is not itself a security
 * boundary (the voice webhook re-checks live membership regardless) — it's
 * generated unguessable purely as defense-in-depth against an unrelated
 * Twilio-account caller ever colliding with or guessing a room name.
 */
function generateConferenceName(): string {
  return `teamhub-${randomUUID()}`
}

export interface ActiveGroupCall {
  id: string
  callerId: string
  callerName: string
  startedAt: Date
  participantCount: number
}

/** The current non-terminal (STARTED/ACTIVE) call for a conversation, or null. Membership-gated by the caller (checked in the route, not here). */
export async function getActiveGroupCall(conversationId: string): Promise<ActiveGroupCall | null> {
  const call = await prisma.teamCallRecord.findFirst({
    where: { conversationId, status: { in: ['STARTED', 'ACTIVE'] } },
    include: {
      caller: { select: { name: true } },
      participants: { where: { leftAt: null }, select: { id: true } },
    },
  })
  if (!call) return null
  return {
    id: call.id,
    callerId: call.callerId,
    callerName: call.caller.name,
    startedAt: call.startedAt,
    participantCount: call.participants.length,
  }
}

/**
 * Starts a new group call, OR — if one is already active for this
 * conversation — returns the existing one instead of creating a duplicate.
 * The actual guarantee is the DB-level partial unique index
 * (uq_team_calls_one_active_per_conversation); this function's job is to
 * make losing that race feel like "you joined the call that already
 * started," never an error, exactly mirroring createOrGetDm's shape.
 */
export async function startOrJoinGroupCall(
  conversationId: string,
  starterId: string,
): Promise<{ callRecordId: string; created: boolean }> {
  const existing = await getActiveGroupCall(conversationId)
  if (existing) return { callRecordId: existing.id, created: false }

  try {
    const call = await prisma.$transaction(async (tx) => {
      const created = await tx.teamCallRecord.create({
        data: {
          conversationId,
          callerId: starterId,
          conferenceName: generateConferenceName(),
          status: 'STARTED',
        },
      })
      await tx.teamCallParticipant.create({
        data: { callRecordId: created.id, staffId: starterId },
      })
      // The starter is now an active participant — collapse STARTED to
      // ACTIVE immediately rather than leaving a transient in-between state.
      await tx.teamCallRecord.update({ where: { id: created.id }, data: { status: 'ACTIVE' } })
      return created
    })
    return { callRecordId: call.id, created: true }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // Lost the race — someone else's call won; join theirs instead.
    const winner = await getActiveGroupCall(conversationId)
    if (winner) return { callRecordId: winner.id, created: false }
    throw e // genuinely unexpected — the unique violation implies a row exists
  }
}

/**
 * Records a participant joining an ALREADY-VALIDATED call (the caller must
 * independently re-check live conversation membership + that the call is
 * still non-terminal BEFORE calling this — this function does not
 * re-derive authorization, it only persists the join). Upserts so a
 * rejoin (leftAt was set, staff joins again) clears leftAt rather than
 * erroring on the (callRecordId, staffId) unique constraint.
 */
export async function joinGroupCall(callRecordId: string, staffId: string): Promise<void> {
  await prisma.teamCallParticipant.upsert({
    where: { callRecordId_staffId: { callRecordId, staffId } },
    update: { leftAt: null, joinedAt: new Date() },
    create: { callRecordId, staffId },
  })
  await prisma.teamCallRecord.updateMany({
    where: { id: callRecordId, status: 'STARTED' },
    data: { status: 'ACTIVE' },
  })
}

/**
 * Records a participant leaving. If this was the last remaining active
 * participant, the call transitions to ENDED (endedAt stamped) — "the call
 * ends cleanly" per the product spec, with no separate host-only
 * "end for everyone" action needed. Idempotent: leaving twice, or leaving
 * a call you were never in, is a no-op, not an error.
 */
export async function leaveGroupCall(callRecordId: string, staffId: string): Promise<void> {
  await prisma.teamCallParticipant.updateMany({
    where: { callRecordId, staffId, leftAt: null },
    data: { leftAt: new Date() },
  })
  const remaining = await prisma.teamCallParticipant.count({
    where: { callRecordId, leftAt: null },
  })
  if (remaining === 0) {
    await prisma.teamCallRecord.updateMany({
      where: { id: callRecordId, status: { in: ['STARTED', 'ACTIVE'] } },
      data: { status: 'ENDED', endedAt: new Date() },
    })
  }
}
