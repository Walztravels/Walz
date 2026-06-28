import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { publishPost } from '@/lib/meta-publisher'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const now = new Date()

  const duePosts = await prisma.socialPost.findMany({
    where: {
      status:      'scheduled',
      scheduledAt: { lte: now },
    },
  })

  if (duePosts.length === 0) {
    return NextResponse.json({ published: 0, message: 'No posts due' })
  }

  const results = await Promise.allSettled(
    duePosts.map(async post => {
      const result = await publishPost(post)
      await prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status:      result.success ? 'published' : 'failed',
          publishedAt: result.success ? new Date() : undefined,
          metaPostId:  result.metaPostId,
          errorMsg:    result.error,
        },
      })
      return { id: post.id, ...result }
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ success: boolean }>).value.success).length
  const failed    = results.length - succeeded

  return NextResponse.json({ published: succeeded, failed, total: results.length })
}
