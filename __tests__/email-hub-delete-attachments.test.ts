/**
 * Email Hub — message/thread deletion + attachment storage resilience.
 */
import fs from 'fs'

const read = (p: string) => fs.readFileSync(p, 'utf8')

describe('thread/message deletion', () => {
  const route = read('app/api/admin/email/threads/[id]/route.ts')
  it('DELETE is visibility-checked like GET and supports message or whole-thread', () => {
    expect(route).toContain('export async function DELETE')
    const del = route.slice(route.indexOf('export async function DELETE'), route.indexOf('// ── PATCH'))
    expect(del).toContain('getVisibleSentByIds')
    expect(del).toContain('body.messageId')
    expect(del).toContain('emailThread.delete')
    // deleting the last message removes the empty thread
    expect(del).toContain('remaining === 0')
  })
  it('messages cascade with the thread at the schema level', () => {
    expect(read('prisma/schema.prisma')).toContain('thread      EmailThread @relation(fields: [threadId], references: [id], onDelete: Cascade)')
  })
  it('the UI confirms before deleting and offers both levels', () => {
    const page = read('app/admin/email/page.tsx')
    expect(page).toContain('Delete this entire thread')
    expect(page).toContain('Delete this message?')
    expect(page).toContain('deleteThread(selectedThread.id)')
    expect(page).toContain('deleteMessage(selectedThreadId, msg.id)')
  })
})

describe('inbound attachment storage', () => {
  const src = read('app/api/admin/careers/inbound/route.ts')
  it('creates the email-attachments bucket on demand and retries once', () => {
    expect(src).toContain("createBucket('email-attachments', { public: true })")
    expect(src).toContain('/not.?found|bucket/i.test(error.message)')
  })
  it('explains when the provider omitted the file content instead of a dead chip', () => {
    expect(src).toContain('file content not included by provider')
  })
  it('unstored attachments render with their reason in the Hub', () => {
    const page = read('app/admin/email/page.tsx')
    expect(page).toContain("att.error ?? 'not stored'")
  })
})
