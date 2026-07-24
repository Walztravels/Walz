import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const CHALLENGE_COOKIE = 'wa_challenge'
const CHALLENGE_TTL    = 120 // seconds

interface StoredCredential {
  credentialID:        string
  credentialPublicKey: string
  counter:             number
  transports:          string[]
  deviceName:          string
  createdAt:           string
}

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_ADMIN_SECRET ?? 'dev-webauthn-secret')
}

function getRpId(req: Request): string {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN
  const host = req.headers.get('host') ?? 'localhost'
  return host.split(':')[0]
}

function getOrigin(req: Request): string {
  const origin = req.headers.get('origin')
  if (origin) return origin
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('host') ?? 'localhost'
  return `${proto}://${host}`
}

// ── GET: generate registration options ────────────────────────────────────────
export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, email: true, name: true, webAuthnCredentials: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const existingCreds = ((staff.webAuthnCredentials ?? []) as unknown as StoredCredential[])
  const rpId   = getRpId(req)

  const opts = await generateRegistrationOptions({
    rpName:        'Walz Travels Admin',
    rpID:          rpId,
    userID:        staff.id,
    userName:      staff.email,
    userDisplayName: staff.name,
    timeout:       60_000,
    attestationType: 'none',
    excludeCredentials: existingCreds.map(c => ({
      id:         isoBase64URL.toBuffer(c.credentialID),
      type:       'public-key' as const,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification:        'required',
      residentKey:             'preferred',
    },
  })

  // Store challenge in a signed short-lived JWT cookie
  const challengeJwt = await new SignJWT({ challenge: opts.challenge })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${CHALLENGE_TTL}s`)
    .sign(getSecret())

  cookies().set(CHALLENGE_COOKIE, challengeJwt, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   CHALLENGE_TTL,
    path:     '/',
  })

  return NextResponse.json(opts)
}

// ── POST: verify registration ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const challengeJwt = cookies().get(CHALLENGE_COOKIE)?.value
  if (!challengeJwt) return NextResponse.json({ error: 'Challenge expired — try again' }, { status: 400 })

  let challenge: string
  try {
    const { payload } = await jwtVerify(challengeJwt, getSecret())
    challenge = payload.challenge as string
  } catch {
    return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 })
  }

  const { credential: body, deviceName = 'My Device' } = await req.json() as {
    credential: Parameters<typeof verifyRegistrationResponse>[0]['response']
    deviceName?: string
  }

  const rpId   = getRpId(req)
  const origin = getOrigin(req)

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      response:          body,
      expectedChallenge: challenge,
      expectedOrigin:    origin,
      expectedRPID:      rpId,
      requireUserVerification: true,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, webAuthnCredentials: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const existing  = ((staff.webAuthnCredentials ?? []) as unknown as StoredCredential[])
  const newCred: StoredCredential = {
    credentialID:        isoBase64URL.fromBuffer(credentialID),
    credentialPublicKey: isoBase64URL.fromBuffer(credentialPublicKey),
    counter,
    transports:          (body as { response?: { transports?: string[] } }).response?.transports ?? [],
    deviceName:          deviceName.slice(0, 50),
    createdAt:           new Date().toISOString(),
  }
  await prisma.staff.update({
    where: { email: session.email },
    data:  { webAuthnCredentials: [...existing, newCred] as unknown as Prisma.InputJsonValue },
  })

  cookies().delete(CHALLENGE_COOKIE)
  return NextResponse.json({ ok: true, credentialID: newCred.credentialID })
}
