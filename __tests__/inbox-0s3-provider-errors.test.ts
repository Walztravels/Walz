/**
 * INBOX-0S.3 — Provider error handling & input validation.
 *
 * Pins: upstream Chatwoot failures are never 200-wrapped and never reach
 * the browser as raw error objects; resolve/assign/reply inputs are
 * validated server-side; attachments are checked for size/type before
 * they touch lambda memory; a private note can never silently become a
 * client-visible reply through serialization quirks; load failures are
 * visible in the UI instead of masquerading as empty states.
 */

import fs from 'fs'
import path from 'path'

import {
  mapChatwootFailure, validateResolveStatus, validateAssigneeId,
  parsePrivateFlag, validateReplyContent, validateAttachmentMeta,
  RESOLVE_STATUSES, REPLY_MAX_CHARS, ATTACHMENT_MAX_BYTES,
} from '@/lib/inbox/provider'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('upstream failure mapping', () => {
  it('404 stays 404; everything else becomes a controlled 502', () => {
    expect(mapChatwootFailure(404, 'Send')).toEqual({ status: 404, error: 'Conversation not found.' })
    for (const s of [400, 401, 403, 422, 500, 503]) {
      const m = mapChatwootFailure(s, 'Send')
      expect(m.status).toBe(502)
      expect(m.error).toBe('Send failed — messaging service error. Please try again.')
    }
  })
})

describe('resolve/reopen status allow-list', () => {
  it('accepts exactly open and resolved; defaults to resolved when absent', () => {
    expect(RESOLVE_STATUSES).toEqual(['open', 'resolved'])
    expect(validateResolveStatus('open')).toEqual({ ok: true, status: 'open' })
    expect(validateResolveStatus('resolved')).toEqual({ ok: true, status: 'resolved' })
    expect(validateResolveStatus(undefined)).toEqual({ ok: true, status: 'resolved' })
  })
  it("rejects lifecycle states the admin endpoint must not set — 'pending' is Jade's takeover state", () => {
    for (const bad of ['pending', 'snoozed', 'OPEN', 'toggle', '', 1, null, {}, 'resolved; DROP TABLE']) {
      expect(validateResolveStatus(bad).ok).toBe(false)
    }
  })
})

describe('assignee validation', () => {
  it('accepts positive integers only', () => {
    expect(validateAssigneeId(8)).toEqual({ ok: true, id: 8 })
    for (const bad of [0, -1, 1.5, '5', NaN, Infinity, null, undefined, {}]) {
      expect(validateAssigneeId(bad).ok).toBe(false)
    }
  })
})

describe('private-note serialization safety', () => {
  it('JSON: booleans pass through, absent defaults to public, strings are REJECTED', () => {
    expect(parsePrivateFlag({ kind: 'json', value: true })).toEqual({ ok: true, isPrivate: true })
    expect(parsePrivateFlag({ kind: 'json', value: false })).toEqual({ ok: true, isPrivate: false })
    expect(parsePrivateFlag({ kind: 'json', value: undefined })).toEqual({ ok: true, isPrivate: false })
    // 'true' the string must not be coerced — reject rather than guess.
    expect(parsePrivateFlag({ kind: 'json', value: 'true' }).ok).toBe(false)
    expect(parsePrivateFlag({ kind: 'json', value: 1 }).ok).toBe(false)
  })

  it("multipart: only the exact strings 'true'/'false'; a mangled or missing flag NEVER falls back to public", () => {
    expect(parsePrivateFlag({ kind: 'form', value: 'true' })).toEqual({ ok: true, isPrivate: true })
    expect(parsePrivateFlag({ kind: 'form', value: 'false' })).toEqual({ ok: true, isPrivate: false })
    // The regression this guards: a private note whose flag is dropped or
    // re-cased by serialization must be REJECTED, not sent client-visible.
    for (const mangled of [null, undefined, '', 'True', 'TRUE', '1', 'on', 'yes', true]) {
      const r = parsePrivateFlag({ kind: 'form', value: mangled })
      expect(r.ok).toBe(false)
    }
  })

  it('a real FormData round trip preserves the flag through the parser', () => {
    const form = new FormData()
    form.append('content', 'internal note about the client')
    form.append('private', String(true))
    const r = parsePrivateFlag({ kind: 'form', value: form.get('private') })
    expect(r).toEqual({ ok: true, isPrivate: true })
  })

  it('the reply route forwards ONLY the strictly-parsed flag on both paths, as message_type outgoing', () => {
    const s = read('app/api/admin/conversations/[id]/reply/route.ts')
    expect(s).toContain("parsePrivateFlag({ kind: 'form', value: form.get('private') })")
    expect(s).toContain("parsePrivateFlag({ kind: 'json', value: body.private })")
    expect(s).toContain("cwForm.append('private', String(isPrivate))")
    expect(s).toContain("message_type: 'outgoing', private: isPrivate")
    expect(s).toContain("cwForm.append('message_type', 'outgoing')")
    expect(s).not.toContain('message_type: 1')            // numeric/string mismatch normalized
    expect(s).not.toMatch(/private:\s*(body|form)\./)     // never forward an unparsed flag
  })
})

describe('reply content and attachments', () => {
  it('content required unless a file is attached; length capped', () => {
    expect(validateReplyContent('', false).ok).toBe(false)
    expect(validateReplyContent('', true).ok).toBe(true)
    expect(validateReplyContent('hello', false).ok).toBe(true)
    expect(validateReplyContent('x'.repeat(REPLY_MAX_CHARS + 1), false).ok).toBe(false)
  })

  it('oversized uploads are rejected as 413 before the body is read into memory', () => {
    const big = { name: 'big.pdf', size: ATTACHMENT_MAX_BYTES + 1, type: 'application/pdf' }
    expect(validateAttachmentMeta(big)).toEqual({ ok: false, status: 413, error: 'Attachment is too large (max 10 MB).' })
    const route = read('app/api/admin/conversations/[id]/reply/route.ts')
    expect(route.indexOf('validateAttachmentMeta')).toBeLessThan(route.indexOf('arrayBuffer'))
  })

  it('type allow-list mirrors the composer: images/pdf/office/csv/txt in, executables out', () => {
    expect(validateAttachmentMeta({ name: 'p.png', size: 100, type: 'image/png' }).ok).toBe(true)
    expect(validateAttachmentMeta({ name: 'd.pdf', size: 100, type: 'application/pdf' }).ok).toBe(true)
    expect(validateAttachmentMeta({ name: 'data.csv', size: 100, type: '' }).ok).toBe(true)   // ext fallback
    expect(validateAttachmentMeta({ name: 'run.exe', size: 100, type: 'application/x-msdownload' })).toEqual(
      { ok: false, status: 415, error: 'This file type is not supported.' })
    expect(validateAttachmentMeta({ name: 'script.sh', size: 100, type: '' }).ok).toBe(false)
  })
})

describe('no 200-wrapped upstream failures, no raw provider objects to the browser', () => {
  const ROUTES = [
    'app/api/admin/conversations/route.ts',
    'app/api/admin/conversations/[id]/route.ts',
    'app/api/admin/conversations/[id]/messages/route.ts',
    'app/api/admin/conversations/[id]/reply/route.ts',
    'app/api/admin/conversations/[id]/read/route.ts',
    'app/api/admin/conversations/[id]/resolve/route.ts',
    'app/api/admin/conversations/[id]/assign/route.ts',
    'app/api/admin/agents/route.ts',
  ]
  it('every proxy route checks res.ok before returning data', () => {
    for (const f of ROUTES) {
      const s = read(f)
      expect(s).toMatch(/!res(\.ok|\))/)
    }
  })
  it('no route ships the raw Chatwoot payload inside an error response', () => {
    for (const f of ROUTES) {
      const s = read(f)
      expect(s).not.toContain('chatwoot: data')
      expect(s).not.toMatch(/error:\s*body\?\.message/)
    }
  })
  it('whatsapp-chat no longer echoes raw Chatwoot response text to the browser', () => {
    const s = read('app/api/admin/whatsapp-chat/route.ts')
    expect(s).not.toContain('Chatwoot: ${errText')
    expect(s).not.toContain('not found in response: ${JSON.stringify(raw)}')
  })
  it('resolve and assign validate inputs before calling Chatwoot', () => {
    expect(read('app/api/admin/conversations/[id]/resolve/route.ts')).toContain('validateResolveStatus(body.status)')
    expect(read('app/api/admin/conversations/[id]/assign/route.ts')).toContain('validateAssigneeId(body.assignee_id)')
  })
  it('the read endpoint no longer reports success it did not have', () => {
    const s = read('app/api/admin/conversations/[id]/read/route.ts')
    expect(s).toContain('if (!res || !res.ok)')
    expect(s).toContain("{ status: 502 }")
  })
})

describe('failures are visible in the UI, never disguised as empty states', () => {
  const page = () => read('app/admin/inbox/page.tsx')
  const chat = () => read('app/admin/inbox/components/ChatWindow.tsx')

  it('a failed message load shows an error + retry, not "No messages yet"', () => {
    expect(page()).toContain('setMsgLoadError(true)')
    expect(chat()).toContain('loadError')
    expect(chat()).toContain('Could not load messages.')
    expect(chat()).toContain('onRetryLoad')
  })
  it('a failed conversation-list load shows a banner with retry, not an empty inbox', () => {
    expect(page()).toContain('setConvsError(true)')
    expect(page()).toContain('Could not load conversations.')
    expect(page()).toContain('fetchConvs(true)')
  })
  it('assign/resolve/reopen failures reach the staff member as a toast', () => {
    const s = page()
    expect(s).toContain('Could not assign the conversation. Please try again.')
    expect(s).toContain('Could not resolve the conversation. Please try again.')
    expect(s).toContain('Could not reopen the conversation. Please try again.')
  })
  it('resolve/reopen no longer flip the status optimistically before the server confirms', () => {
    const s = page()
    const resolveBody = s.slice(s.indexOf('async function handleResolve'), s.indexOf('async function handleReopen'))
    expect(resolveBody.indexOf('res.ok')).toBeGreaterThan(-1)
    expect(resolveBody.indexOf('res.ok')).toBeLessThan(resolveBody.indexOf("status: 'resolved' } : p"))
  })
})

describe('lifecycle behavior preservation (Jade)', () => {
  it("reopen still sends exactly 'open' — Jade resume semantics unchanged", () => {
    const s = read('app/admin/inbox/page.tsx')
    expect(s).toContain("body: JSON.stringify({ status: 'open' })")
    expect(s).toContain("body: JSON.stringify({ status: 'resolved' })")
  })
  it('the resolve route still forwards to toggle_status with the validated status only', () => {
    const s = read('app/api/admin/conversations/[id]/resolve/route.ts')
    expect(s).toContain('/toggle_status')
    expect(s).toContain('JSON.stringify({ status })')
  })
})
