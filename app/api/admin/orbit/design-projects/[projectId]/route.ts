import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — one design project (for "open in Studio")
export async function GET(_req: NextRequest, { params }: { params: { projectId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const project = await prisma.orbitDesignProject.findUnique({ where: { id: params.projectId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ project })
  } catch (err) {
    console.error('[design-project GET]', err)
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
  }
}
