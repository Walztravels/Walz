import prisma from '@/lib/db'

export async function generateQuoteReference(): Promise<string> {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')

  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(now)
  dayEnd.setUTCHours(23, 59, 59, 999)

  const count = await prisma.quote.count({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `WT-Q-${dateStr}-${seq}`
}
