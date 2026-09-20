/**
 * Walz Team Hub V1 — conversation creation and membership-filtered
 * listing. All writes happen through this module so DM-uniqueness and
 * membership creation stay in one place, matching the "single source of
 * truth" discipline established for the rest of this codebase's helper
 * modules (e.g. lib/quotes/update-totals.ts, lib/inbox/client-link.ts).
 */

import prisma from '@/lib/db'
import { computeDmKey } from './authz'

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null
  return err?.code === 'P2002' || /unique|duplicate key|23505/i.test(err?.message ?? '')
}

export interface CreateOrGetDmResult {
  conversationId: string
  created: boolean
}

/**
 * Finds the existing DM between two staff members, or creates it. The
 * database-level partial unique index on (dm_key) WHERE type='DM' is the
 * actual race-safety guarantee — this function's try/insert/catch-and-
 * refetch is the standard "let the DB reject the race, then read the
 * winner" pattern already used elsewhere in this codebase
 * (lib/leads/identity.ts, lib/inbox/client-link.ts), not a substitute for
 * the constraint.
 */
export async function createOrGetDm(staffIdA: string, staffIdB: string, createdBy: string): Promise<CreateOrGetDmResult> {
  if (staffIdA === staffIdB) {
    throw new Error('Cannot create a DM with yourself.')
  }
  const dmKey = computeDmKey(staffIdA, staffIdB)

  const existing = await prisma.teamConversation.findUnique({ where: { dmKey } })
  if (existing) return { conversationId: existing.id, created: false }

  try {
    const conversation = await prisma.$transaction(async (tx) => {
      const conv = await tx.teamConversation.create({
        data: { type: 'DM', dmKey, createdBy, joinable: false },
      })
      await tx.teamConversationMember.createMany({
        data: [
          { conversationId: conv.id, staffId: staffIdA, role: 'member' },
          { conversationId: conv.id, staffId: staffIdB, role: 'member' },
        ],
      })
      return conv
    })
    return { conversationId: conversation.id, created: true }
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Lost the race — another request created it first. Read the winner.
      const winner = await prisma.teamConversation.findUnique({ where: { dmKey } })
      if (winner) return { conversationId: winner.id, created: false }
    }
    throw e
  }
}

export interface CreateGroupInput {
  name: string
  memberStaffIds: string[]
  createdBy: string
}

/** Group DM — arbitrary membership, no dm_key, not necessarily permanent. */
export async function createGroup({ name, memberStaffIds, createdBy }: CreateGroupInput): Promise<string> {
  const uniqueMembers = Array.from(new Set([...memberStaffIds, createdBy]))
  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.teamConversation.create({
      data: { type: 'GROUP', name: name.trim().slice(0, 120), createdBy, joinable: false },
    })
    await tx.teamConversationMember.createMany({
      data: uniqueMembers.map(staffId => ({
        conversationId: conv.id, staffId, role: staffId === createdBy ? 'admin' : 'member',
      })),
    })
    return conv
  })
  return conversation.id
}

export interface CreateChannelInput {
  name: string
  description?: string
  visibility: 'PUBLIC' | 'PRIVATE'
  joinable: boolean
  createdBy: string
  /** Only meaningful for PRIVATE channels — PUBLIC channels are self-joinable per owner decision 5. */
  initialMemberStaffIds?: string[]
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || `channel-${Date.now()}`
}

export async function createChannel(input: CreateChannelInput): Promise<string> {
  const slug = slugify(input.name)
  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.teamConversation.create({
      data: {
        type: 'CHANNEL',
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 500) ?? null,
        slug,
        visibility: input.visibility,
        joinable: input.visibility === 'PUBLIC' ? input.joinable : false,
        createdBy: input.createdBy,
      },
    })
    const members = Array.from(new Set([...(input.initialMemberStaffIds ?? []), input.createdBy]))
    await tx.teamConversationMember.createMany({
      data: members.map(staffId => ({
        conversationId: conv.id, staffId, role: staffId === input.createdBy ? 'admin' : 'member',
      })),
    })
    return conv
  })
  return conversation.id
}

/**
 * Self-service join for a PUBLIC + joinable channel (owner decision 5 —
 * "any active staff member may discover and join... unless membership-
 * controlled"). Never usable for PRIVATE or membership-controlled
 * channels — those require an explicit add by an authorized manager
 * (see lib/team/authz.ts's checkCanManageMembership).
 */
export async function joinPublicChannel(conversationId: string, staffId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const conversation = await prisma.teamConversation.findUnique({ where: { id: conversationId } })
  if (!conversation) return { ok: false, error: 'Channel not found.' }
  if (conversation.type !== 'CHANNEL' || conversation.visibility !== 'PUBLIC' || !conversation.joinable) {
    return { ok: false, error: 'This channel requires an invitation to join.' }
  }
  await prisma.teamConversationMember.upsert({
    where: { conversationId_staffId: { conversationId, staffId } },
    update: { leftAt: null },
    create: { conversationId, staffId, role: 'member' },
  })
  return { ok: true }
}

/**
 * Every conversation a staff member is currently authorized to see in
 * their own left-nav list: conversations they're an active member of,
 * PLUS discoverable (PUBLIC) channels they haven't joined yet — never a
 * PRIVATE channel they're not a member of (membership filter is IN the
 * query, not a post-hoc client-side filter — see the security audit's
 * explicit "private channel discovery" requirement).
 */
export async function listConversationsForStaff(staffId: string) {
  const [joined, discoverablePublic] = await Promise.all([
    prisma.teamConversation.findMany({
      where: { archived: false, members: { some: { staffId, leftAt: null } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.teamConversation.findMany({
      where: {
        archived: false, type: 'CHANNEL', visibility: 'PUBLIC',
        members: { none: { staffId, leftAt: null } },
      },
      orderBy: { name: 'asc' },
    }),
  ])
  return { joined, discoverablePublic }
}
