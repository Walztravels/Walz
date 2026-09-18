'use client'

// ComposerDraftContext — INBOX UX-2.
//
// The ChatWindow → ReplyBox JSX line is byte-pinned by inbox-history.test.ts,
// so the composer can't learn about Jade through new props threaded down the
// tree. Instead this ref-based context lets:
//   - ReplyBox register an inserter (Jade drafts land in the textarea) and
//     call openCopilot() from its ✨ Ask Jade button;
//   - the inbox page register the copilot opener and (later) the Jade panel
//     push drafts into the composer via insertDraft().
//
// All functions are no-ops until something registers — safe to call anywhere.

import { createContext, useContext, useMemo, useRef, ReactNode } from 'react'

export interface ComposerDraftApi {
  /** Push draft text into the composer (no-op until ReplyBox registers). */
  insertDraft: (text: string) => void
  /** ReplyBox registers how a draft is inserted into its textarea. */
  registerInserter: (fn: (text: string) => void) => void
  /** Open the Staff Jade copilot panel (no-op until the page registers). */
  openCopilot: () => void
  /** The inbox page registers how the copilot panel opens. */
  registerCopilotOpener: (fn: () => void) => void
}

const noop = () => {}

const ComposerDraftContext = createContext<ComposerDraftApi>({
  insertDraft: noop,
  registerInserter: noop,
  openCopilot: noop,
  registerCopilotOpener: noop,
})

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const inserterRef = useRef<(text: string) => void>(noop)
  const openerRef   = useRef<() => void>(noop)

  const api = useMemo<ComposerDraftApi>(() => ({
    insertDraft:           (text: string) => inserterRef.current(text),
    registerInserter:      (fn: (text: string) => void) => { inserterRef.current = fn },
    openCopilot:           () => openerRef.current(),
    registerCopilotOpener: (fn: () => void) => { openerRef.current = fn },
  }), [])

  return (
    <ComposerDraftContext.Provider value={api}>
      {children}
    </ComposerDraftContext.Provider>
  )
}

export function useComposerDraft(): ComposerDraftApi {
  return useContext(ComposerDraftContext)
}
