'use client'

/**
 * Walz Team Hub V1 — left-nav conversation rail: joined conversations +
 * discoverable (not-yet-joined) PUBLIC channels, per GET
 * /api/admin/team/conversations's `{joined, discoverablePublic}` shape.
 * Loading skeleton / failure-with-retry / empty-with-a-prompt states are
 * mandatory per the QA matrix — never a silently blank list.
 */
import { Hash, Lock, Plus, Search, Users, UsersRound } from 'lucide-react'
import type { TeamConversationSummary } from '../types'

export interface ConversationListProps {
  joined: TeamConversationSummary[]
  discoverablePublic: TeamConversationSummary[]
  selectedId: string | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (id: string) => void
  onJoinChannel: (id: string) => void
  onOpenDirectory: () => void
  onOpenCreate: () => void
}

function conversationIcon(c: TeamConversationSummary) {
  if (c.type === 'CHANNEL') return c.visibility === 'PRIVATE' ? Lock : Hash
  if (c.type === 'GROUP') return UsersRound
  return Users
}

function conversationLabel(c: TeamConversationSummary): string {
  if (c.type === 'DM') return c.name ?? 'Direct message'
  return c.name ?? (c.type === 'CHANNEL' ? 'Untitled channel' : 'Untitled group')
}

const SKELETON_ROWS = [0, 1, 2, 3, 4]

export function ConversationList({
  joined, discoverablePublic, selectedId, loading, error, onRetry, onSelect, onJoinChannel, onOpenDirectory, onOpenCreate,
}: ConversationListProps) {
  return (
    <div className="w-full flex flex-col bg-walz-navy border-r border-white/5 h-full">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-xs font-bold text-walz-gold uppercase tracking-widest">Team Hub</p>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenDirectory}
            aria-label="Staff directory"
            title="Staff directory"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenCreate}
            aria-label="New conversation"
            title="New conversation"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="py-12 text-center text-xs px-4">
            <p className="text-red-300">{error}</p>
            <button onClick={onRetry} className="mt-2 underline font-semibold text-white/60 hover:text-white">Retry</button>
          </div>
        ) : loading ? (
          <div aria-hidden="true">
            {SKELETON_ROWS.map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 motion-safe:animate-pulse">
                <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {joined.length === 0 && discoverablePublic.length === 0 ? (
              <div className="py-12 text-center text-white/50 text-xs px-6 space-y-3">
                <p>No conversations yet.</p>
                <button onClick={onOpenDirectory} className="rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3 py-2 transition-colors">
                  Message a colleague
                </button>
              </div>
            ) : (
              <>
                {joined.length > 0 && (
                  <ul>
                    {joined.map(c => {
                      const Icon = conversationIcon(c)
                      const active = c.id === selectedId
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => onSelect(c.id)}
                            aria-current={active}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 transition-colors ${
                              active ? 'bg-white/10' : 'hover:bg-white/5'
                            }`}
                          >
                            <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-walz-gold flex-shrink-0">
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-white truncate">{conversationLabel(c)}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {discoverablePublic.length > 0 && (
                  <div className="mt-2">
                    <p className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-semibold">Browse channels</p>
                    <ul>
                      {discoverablePublic.map(c => (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
                          <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 flex-shrink-0">
                            <Hash className="w-3.5 h-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm text-white/80 truncate">{conversationLabel(c)}</span>
                          <button
                            onClick={() => onJoinChannel(c.id)}
                            className="flex-shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          >
                            Join
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
