import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { sendClientWelcomeEmail } from '@/lib/email-visa'

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function tempPassword(len = 8) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

interface Input {
  email:           string
  name:            string
  phone?:          string | null
  applicationId?:  string        // link the application to the account
}

interface Result {
  created:    boolean   // false = account already existed
  accountId?: string
}

// Creates a ClientAccount if one doesn't exist for this email, sends welcome email,
// and (optionally) links the VisaApplication to the account.
// Swallows all errors — must never break the calling flow.
export async function ensureClientAccount({ email, name, phone, applicationId }: Input): Promise<Result> {
  try {
    const existing = await prisma.clientAccount.findUnique({ where: { email } })

    if (existing) {
      // Link application even if account already exists
      if (applicationId) {
        await prisma.visaApplication.update({
          where: { id: applicationId },
          data:  { clientAccountId: existing.id },
        }).catch(() => {})
      }
      return { created: false, accountId: existing.id }
    }

    const password  = tempPassword()
    const hash      = await bcrypt.hash(password, 10)
    const firstName = name.split(' ')[0] ?? name

    const account = await prisma.clientAccount.create({
      data: {
        email,
        name:         name || 'Client',
        phone:        phone ?? null,
        passwordHash: hash,
        isVerified:   false,
      },
    })

    // Link application
    if (applicationId) {
      await prisma.visaApplication.update({
        where: { id: applicationId },
        data:  { clientAccountId: account.id },
      }).catch(() => {})
    }

    // Send welcome email (best-effort)
    await sendClientWelcomeEmail({
      to:           email,
      name:         firstName,
      tempPassword: password,
      loginUrl:     'https://walztravels.com/my-account',
    }).catch(err => console.error('[ensureClientAccount] welcome email failed:', err))

    return { created: true, accountId: account.id }
  } catch (err) {
    console.error('[ensureClientAccount] error:', err)
    return { created: false }
  }
}
