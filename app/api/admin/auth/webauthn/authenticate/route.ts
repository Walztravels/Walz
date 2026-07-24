import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types'
import { signAdminToken, COOKIE_NAME } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const CHALLENGE_COOKIE = 'wa_challenge'
const CHALLENGE_TTL    = 120

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

// ── GET: generate authentication options for an email ─────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')?.toLowerCase().trim()

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const staff = await prisma.staff.findUnique({
    where:  { email },
    select: { id: true, isActive: true, webAuthnCredentials: true },
  })

  // Return empty options when no credentials — don't leak whether the user exists
  const creds: StoredCredential[] = (staff?.isActive && staff?.webAuthnCredentials)
    ? (staff.webAuthnCredentials as unknown as StoredCredential[])
    : []

  if (!creds.length) {
    return NextResponse.json({ error: 'No biometric credentials registered for this account' }, { status: 404 })
  }

  const rpId = getRpId(req)

  const opts = await generateAuthenticationOptions({
    rpID:    rpId,
    timeout: 60_000,
    allowCredentials: creds.map(c => ({
      id:         isoBase64URL.toBuffer(c.credentialID),
      type:       'public-key' as const,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: 'required',
  })

  const challengeJwt = await new SignJWT({ challenge: opts.challenge, email })
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

// ── POST: verify authentication and issue session token ───────────────────────
export async function POST(req: Request) {
  const challengeJwt = cookies().get(CHALLENGE_COOKIE)?.value
  if (!challengeJwt) return NextResponse.json({ error: 'Challenge expired — try again' }, { status: 400 })

  let challenge: string
  let email: string
  try {
    const { payload } = await jwtVerify(challengeJwt, getSecret())
    challenge = payload.challenge as string
    email     = payload.email    as string
  } catch {
    return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 })
  }

  const { credential: body } = await req.json() as {
    credential: Parameters<typeof verifyAuthenticationResponse>[0]['response']
  }

  const staff = await prisma.staff.findUnique({
    where:  { email },
    select: { id: true, email: true, role: true, isActive: true, webAuthnCredentials: true },
  })

  if (!staff?.isActive) {
    return NextResponse.json({ error: 'Account inactive or not found' }, { status: 403 })
  }

  const creds = ((staff.webAuthnCredentials ?? []) as unknown as StoredCredential[])

  // Find which credential was used by matching credentialID
  const credentialId = body.id  // base64url string from browser
  const stored = creds.find(c => c.credentialID === credentialId)
  if (!stored) {
    return NextResponse.json({ error: 'Credential not recognised' }, { status: 400 })
  }

  const rpId   = getRpId(req)
  const origin = getOrigin(req)

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response:          body,
      expectedChallenge: challenge,
      expectedOrigin:    origin,
      expectedRPID:      rpId,
      authenticator: {
        credentialID:        isoBase64URL.toBuffer(stored.credentialID),
        credentialPublicKey: isoBase64URL.toBuffer(stored.credentialPublicKey),
        counter:             stored.counter,
        transports:          stored.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Biometric verification failed' }, { status: 401 })
  }

  // Update counter (replay-attack protection)
  const newCounter = verification.authenticationInfo.newCounter
  const updatedCreds = creds.map(c =>
    c.credentialID === credentialId ? { ...c, counter: newCounter } : c
  )
  await prisma.staff.update({
    where: { email },
    data:  { webAuthnCredentials: updatedCreds as unknown as Prisma.InputJsonValue, lastLoginAt: new Date() },
  })

  // Issue admin JWT
  const token = await signAdminToken(email, staff.role, staff.id)
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   12 * 60 * 60,
    path:     '/',
  })

  cookies().delete(CHALLENGE_COOKIE)
  return NextResponse.json({ ok: true })
}
