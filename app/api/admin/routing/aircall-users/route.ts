import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getAircallUsers } from '@/lib/aircall-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getAircallUsers()
  if (!data) return NextResponse.json({ users: [] })

  return NextResponse.json({
    users: data.users.map((u) => ({
      id:           u.id,
      name:         u.name,
      email:        u.email,
      availability: u.availability_status,
    })),
  })
}
