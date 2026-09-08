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
  it('fetches the 1-hour download_url when content is not inlined (current Resend behaviour)', () => {
    expect(src).toContain('att.download_url ?? att.downloadUrl ?? att.url')
    expect(src).toContain('fetch(downloadUrl')
    expect(src).toContain('AbortSignal.timeout')
  })
  it('lists attachments via the Resend receiving API when the webhook carries metadata only', () => {
    // Production log evidence: webhook attachment objects hold only
    // content_disposition/content_id/content_type/filename/id — the bytes
    // live behind GET /emails/receiving/{email_id}/attachments.
    expect(src).toContain('https://api.resend.com/emails/receiving/')
    expect(src).toContain('/attachments')
    expect(src).toContain('Bearer ${process.env.RESEND_API_KEY}')
    expect(src).toContain('attachmentUrlById.set(a.id, a.download_url)')
    expect(src).toContain('attachmentUrlById.get(att.id)')
    // The list call is keyed off the webhook email id, both shapes
    expect(src).toContain('email.email_id ?? email.id')
  })
  it('surfaces the specific list failure instead of a generic message', () => {
    expect(src).toContain('provider list HTTP')
    expect(src).toContain('provider returned no download links')
    expect(src).toContain('RESEND_API_KEY not configured')
    expect(src).toContain('attachmentListNote ??')
  })
  it('explains unretrievable attachments and logs payload field names (never content)', () => {
    expect(src).toContain('file content not included by provider')
    expect(src).toContain('download from provider failed')
    expect(src).toContain('Object.keys(att)')
  })
  it('unstored attachments render with their reason in the Hub', () => {
    const page = read('app/admin/email/page.tsx')
    expect(page).toContain("att.error ?? 'not stored'")
  })
})
