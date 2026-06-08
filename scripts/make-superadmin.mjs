/**
 * One-shot script: upsert contact@walztravels.com as super_admin Staff member.
 * Run from project root: node scripts/make-superadmin.mjs
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import { createHash } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require    = createRequire(path.join(__dirname, '../node_modules/'))

const { PrismaClient } = require('@prisma/client')
const bcrypt            = require('bcryptjs')

const prisma = new PrismaClient()

const EMAIL    = 'contact@walztravels.com'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'WalzAdmin2024!'
const NAME     = 'Walz Admin'

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12)

  const staff = await prisma.staff.upsert({
    where: { email: EMAIL },
    create: {
      name:         NAME,
      email:        EMAIL,
      passwordHash: hash,
      accessLevel:  'Admin',
      role:         'super_admin',
      roleTitle:    'Super Administrator',
      isActive:     true,
      permissions:  {},
    },
    update: {
      role:        'super_admin',
      accessLevel: 'Admin',
      isActive:    true,
    },
    select: { id: true, name: true, email: true, accessLevel: true, role: true, isActive: true },
  })

  console.log('✅  Staff record upserted:')
  console.log(JSON.stringify(staff, null, 2))
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
