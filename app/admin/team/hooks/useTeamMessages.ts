'use client'

/**
 * Walz Team Hub V1 — message list state for a single conversation OR a
 * single open thread (pass `parentMessageId` to view/post into that
 * thread instead of the main feed — mirrors the messages API's own
 * `parentMessageId` query/body param exactly). Owns cursor pagination,
 * optimistic send with rollback-on-failure, edit/delete, reaction toggling,
 * attachment upload, and the read-cursor bump.
 *
 * Realtime/poll reconciliation is deliberately "refetch the latest window
 * and upsert by id" (see lib/pagination.ts's mergeLatestBatch) rather than
 * trying to shape a raw Postgres change payload into the API's message
 * type — this also transparently picks up edits/deletes/reactions on
 * messages already in view, not just brand-new inserts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { teamFetch, extractErrorMessage, isSessionExpiredError } from '../lib/teamFetch'
import { mergeOlderPage, mergeLatestBatch, upsertMessage, removeMessage } from '../lib/pagination'
import type { TeamMessage } from '../types'

const PAGE_SIZE = 50

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface UseTeamMessagesOptions {
  conversationId: string | null
  /** Set to view/post into a single thread's replies instead of the main feed. */
  parentMessageId?: string | null
  currentStaffId?: string | null
  currentStaffName?: string | null
}

export interface UseTeamMessagesResult {
  messages: TeamMessage[]
  loading: boolean
  loadError: boolean
  hasMore: boolean
  loadingOlder: boolean
  olderError: boolean
  loadOlder: () => void
  retryLoad: () => void
  refreshNewest: () => void
  sending: boolean
  sendMessage: (body: string, mentionedStaffIds?: string[]) => Promise<ActionResult>
  editMessage: (messageId: string, body: string) => Promise<ActionResult>
  deleteMessage: (messageId: string) => Promise<ActionResult>
  toggleReaction: (messageId: string, emoji: string) => Promise<ActionResult>
  uploadAttachment: (file: File, caption?: string) => Promise<ActionResult>
  markRead: (messageId: string) => void
}

function buildUrl(conversationId: string, opts: { before?: string; parentMessageId?: string | null; limit?: number }): string {
  const params = new URLSearchParams()
  if (opts.before) params.set('before', opts.before)
  if (opts.parentMessageId) params.set('parentMessageId', opts.parentMessageId)
  params.set('limit', String(opts.limit ?? PAGE_SIZE))
  return `/api/admin/team/conversations/${conversationId}/messages?${params.toString()}`
}

export function useTeamMessages({
  conversationId, parentMessageId = null, currentStaffId, currentStaffName,
}: UseTeamMessagesOptions): UseTeamMessagesResult {
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState(false)
  const [sending, setSending] = useState(false)

  const lastReadSentRef = useRef<string | null>(null)
  const messagesRef = useRef<TeamMessage[]>([])
  messagesRef.current = messages

  // Reset local state whenever the conversation/thread context changes.
  useEffect(() => {
    setMessages([])
    setLoadError(false)
    setHasMore(false)
    setOlderError(false)
    lastReadSentRef.current = null
  }, [conversationId, parentMessageId])

  const loadInitial = useCallback(async () => {
    if (!conversationId) { setLoading(false); return }
    setLoading(true)
    setLoadError(false)
    try {
      const res = await teamFetch(buildUrl(conversationId, { parentMessageId }))
      if (!res.ok) { setLoadError(true); return }
      const data = (await res.json()) as { messages: TeamMessage[]; hasMore: boolean }
      setMessages(data.messages)
      setHasMore(data.hasMore)
    } catch (e) {
      if (isSessionExpiredError(e)) return
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [conversationId, parentMessageId])

  useEffect(() => { void loadInitial() }, [loadInitial])

  const loadOlder = useCallback(() => {
    if (!conversationId || loadingOlder || !hasMore) return
    const oldest = messagesRef.current[0]
    if (!oldest) return
    setLoadingOlder(true)
    setOlderError(false)
    void (async () => {
      try {
        const res = await teamFetch(buildUrl(conversationId, { before: oldest.id, parentMessageId }))
        if (!res.ok) { setOlderError(true); return }
        const data = (await res.json()) as { messages: TeamMessage[]; hasMore: boolean }
        setMessages(prev => mergeOlderPage(prev, data.messages))
        setHasMore(data.hasMore)
      } catch (e) {
        if (isSessionExpiredError(e)) return
        setOlderError(true)
      } finally {
        setLoadingOlder(false)
      }
    })()
  }, [conversationId, parentMessageId, loadingOlder, hasMore])

  const refreshNewest = useCallback(() => {
    if (!conversationId) return
    void (async () => {
      try {
        const res = await teamFetch(buildUrl(conversationId, { parentMessageId }))
        if (!res.ok) return
        const data = (await res.json()) as { messages: TeamMessage[]; hasMore: boolean }
        setMessages(prev => mergeLatestBatch(prev, data.messages))
      } catch {
        /* best-effort — the poll/realtime nudge retries on its own cadence */
      }
    })()
  }, [conversationId, parentMessageId])

  const sendMessage = useCallback(async (body: string, mentionedStaffIds?: string[]): Promise<ActionResult> => {
    if (!conversationId) return { ok: false, error: 'No conversation selected.' }
    const trimmed = body.trim()
    if (!trimmed) return { ok: false, error: 'Message cannot be empty.' }

    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: TeamMessage = {
      id: tempId,
      authorId: currentStaffId ?? 'me',
      authorName: currentStaffName ?? 'You',
      body: trimmed,
      deleted: false,
      editedAt: null,
      parentMessageId: parentMessageId ?? null,
      replyCount: 0,
      reactions: [],
      attachments: [],
      mentionedStaffIds: mentionedStaffIds ?? [],
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    setSending(true)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, parentMessageId: parentMessageId ?? undefined, mentionedStaffIds }),
      })
      if (!res.ok) {
        setMessages(prev => removeMessage(prev, tempId))
        return { ok: false, error: await extractErrorMessage(res, 'Could not send your message.') }
      }
      const data = (await res.json()) as {
        message: { id: string; authorId: string; body: string; parentMessageId: string | null; createdAt: string; mentionedStaffIds: string[] }
      }
      setMessages(prev => upsertMessage(removeMessage(prev, tempId), {
        ...optimistic,
        id: data.message.id,
        body: data.message.body,
        createdAt: data.message.createdAt,
        mentionedStaffIds: data.message.mentionedStaffIds,
      }))
      return { ok: true }
    } catch (e) {
      setMessages(prev => removeMessage(prev, tempId))
      if (isSessionExpiredError(e)) return { ok: false }
      return { ok: false, error: 'Could not send your message. Please check your connection.' }
    } finally {
      setSending(false)
    }
  }, [conversationId, parentMessageId, currentStaffId, currentStaffName])

  const editMessage = useCallback(async (messageId: string, body: string): Promise<ActionResult> => {
    if (!conversationId) return { ok: false, error: 'No conversation selected.' }
    const trimmed = body.trim()
    if (!trimmed) return { ok: false, error: 'Message cannot be empty.' }
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      if (!res.ok) return { ok: false, error: await extractErrorMessage(res, 'Could not edit that message.') }
      const data = (await res.json()) as { message: { id: string; body: string; editedAt: string } }
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, body: data.message.body, editedAt: data.message.editedAt } : m)))
      return { ok: true }
    } catch (e) {
      if (isSessionExpiredError(e)) return { ok: false }
      return { ok: false, error: 'Could not edit that message.' }
    }
  }, [conversationId])

  const deleteMessage = useCallback(async (messageId: string): Promise<ActionResult> => {
    if (!conversationId) return { ok: false, error: 'No conversation selected.' }
    const snapshot = messagesRef.current
    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, deleted: true, body: null } : m)))
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' })
      if (!res.ok) {
        setMessages(snapshot)
        return { ok: false, error: await extractErrorMessage(res, 'Could not delete that message.') }
      }
      return { ok: true }
    } catch (e) {
      setMessages(snapshot)
      if (isSessionExpiredError(e)) return { ok: false }
      return { ok: false, error: 'Could not delete that message.' }
    }
  }, [conversationId])

  // QA finding (FAIL, fixed): this previously swallowed every failure —
  // the optimistic reaction just silently un-toggled with no feedback,
  // indistinguishable from "nothing happened." Now returns ActionResult
  // like every other mutating action here, so the caller can surface it.
  const toggleReaction = useCallback(async (messageId: string, emoji: string): Promise<ActionResult> => {
    if (!conversationId || !currentStaffId) return { ok: false }
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const already = m.reactions.some(r => r.staffId === currentStaffId && r.emoji === emoji)
      return {
        ...m,
        reactions: already
          ? m.reactions.filter(r => !(r.staffId === currentStaffId && r.emoji === emoji))
          : [...m.reactions, { staffId: currentStaffId, emoji }],
      }
    }))
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) {
        const error = await extractErrorMessage(res, 'Could not add that reaction.')
        refreshNewest() // roll back to server truth on failure
        return { ok: false, error }
      }
      return { ok: true }
    } catch (e) {
      if (isSessionExpiredError(e)) return { ok: false }
      refreshNewest() // roll back to server truth on failure
      return { ok: false, error: 'Could not add that reaction.' }
    }
  }, [conversationId, currentStaffId, refreshNewest])

  const uploadAttachment = useCallback(async (file: File, caption?: string): Promise<ActionResult> => {
    if (!conversationId) return { ok: false, error: 'No conversation selected.' }
    const formData = new FormData()
    formData.set('file', file)
    if (caption?.trim()) formData.set('body', caption.trim())
    if (parentMessageId) formData.set('parentMessageId', parentMessageId)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/attachments`, { method: 'POST', body: formData })
      if (!res.ok) return { ok: false, error: await extractErrorMessage(res, 'Upload failed.') }
      refreshNewest()
      return { ok: true }
    } catch (e) {
      if (isSessionExpiredError(e)) return { ok: false }
      return { ok: false, error: 'Upload failed. Please try again.' }
    }
  }, [conversationId, parentMessageId, refreshNewest])

  const markRead = useCallback((messageId: string) => {
    if (!conversationId || lastReadSentRef.current === messageId) return
    lastReadSentRef.current = messageId
    void teamFetch(`/api/admin/team/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    }).catch(() => { /* best-effort */ })
  }, [conversationId])

  const retryLoad = useCallback(() => { void loadInitial() }, [loadInitial])

  return {
    messages, loading, loadError, hasMore, loadingOlder, olderError,
    loadOlder, retryLoad, refreshNewest, sending,
    sendMessage, editMessage, deleteMessage, toggleReaction, uploadAttachment, markRead,
  }
}
