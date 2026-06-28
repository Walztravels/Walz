import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { can } from '@/lib/permissions-registry'
import prisma from '@/lib/db'
import { publishPost } from '@/lib/meta-publisher'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!can(session, 'marketing_publish')) return NextResponse.json({ error: 'Publishing permission required.' }, { status: 403 })

  const { postId } = await req.json() as { postId: string }

  const post = await prisma.socialPost.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return NextResponse.json(
      { error: 'Post must be approved or scheduled before publishing' },
      { status: 400 }
    )
  }

  const result = await publishPost(post)

  await prisma.socialPost.update({
    where: { id: postId },
    data: {
      status:      result.success ? 'published' : 'failed',
      publishedAt: result.success ? new Date() : undefined,
      metaPostId:  result.metaPostId,
      errorMsg:    result.error,
    },
  })

  return NextResponse.json({ success: result.success, error: result.error })
}
