'use client'

// ComposerDraftContext — INBOX UX-2, extended for V1.4 Jade Staff
// Communication Intelligence.
//
// The ChatWindow → ReplyBox JSX line is byte-pinned by inbox-history.test.ts,
// so the composer can't learn about Jade through new props threaded down the
// tree. Instead this ref-based context lets:
//   - ReplyBox register an inserter (Jade drafts land in the textarea) and
//     call openCopilot() from its ✨ Ask Jade button;
//   - the inbox page register the copilot opener and (later) the Jade panel
//     push drafts into the composer via insertDraft().
//
// V1.4 additions follow the exact same registration pattern:
//   - replaceDraft/registerReplacer: REPLACES the composer's current text
//     outright — distinct from insertDraft, which APPENDS new AI-authored
//     text. Fix Writing/Professionalize/tone/Translate transform what staff
//     already typed, so they replace it; Draft Reply/Ask Jade insert new
//     text, so they append via the existing insertDraft.
//   - getComposerText/registerTextProvider: lets a transform operation read
//     back the CURRENT composer text + mode before sending it to Jade —
//     nothing before V1.4 needed to read the composer, only write to it.
//   - openJadeMenu/registerJadeMenuOpener: opens the new structured Jade
//     writing-assist menu — a SEPARATE surface from openCopilot (the
//     existing free-form Ask Jade panel). Both remain; they serve different
//     purposes and neither replaces the other.
//
// Team Hub "Ask Team" addition follows the exact same pattern:
//   - openAskTeam/registerAskTeamOpener: opens the AskTeamPanel (message a
//     colleague / ask a channel / start a discussion about the currently-
//     selected Inbox conversation). A THIRD, independent surface — never
//     open at the same time as the copilot or the Jade writing-assist menu
//     (the inbox page's own mutual-exclusion wiring enforces that, exactly
//     like it already does for the other two).
//
// All functions are no-ops until something registers — safe to call anywhere.

import { createContext, useContext, useMemo, useRef, ReactNode } from 'react'

export interface ComposerTextSnapshot {
  text: string
  mode: 'reply' | 'note'
}

export interface ComposerDraftApi {
  /** Push draft text into the composer, appended to whatever's already there (no-op until ReplyBox registers). */
  insertDraft: (text: string) => void
  /** ReplyBox registers how a draft is inserted into its textarea. */
  registerInserter: (fn: (text: string) => void) => void
  /** Open the Staff Jade copilot panel (no-op until the page registers). */
  openCopilot: () => void
  /** The inbox page registers how the copilot panel opens. */
  registerCopilotOpener: (fn: () => void) => void
  /** Replace the composer's current text outright — for material transforms of what staff already typed. */
  replaceDraft: (text: string) => void
  /** ReplyBox registers how its text is replaced. */
  registerReplacer: (fn: (text: string) => void) => void
  /** Read the composer's current text + reply/note mode (defaults to {text:'', mode:'reply'} until ReplyBox registers). */
  getComposerText: () => ComposerTextSnapshot
  /** ReplyBox registers how its current text/mode is read back. */
  registerTextProvider: (fn: () => ComposerTextSnapshot) => void
  /** Open the V1.4 structured Jade writing-assist menu (separate from openCopilot). */
  openJadeMenu: () => void
  /** The inbox page registers how the Jade assist menu opens. */
  registerJadeMenuOpener: (fn: () => void) => void
  /** Open the Team Hub "Ask Team" panel for the currently-selected Inbox conversation (no-op until the page registers). */
  openAskTeam: () => void
  /** The inbox page registers how the Ask Team panel opens. */
  registerAskTeamOpener: (fn: () => void) => void
}

const noop = () => {}
const defaultTextProvider = (): ComposerTextSnapshot => ({ text: '', mode: 'reply' })

const ComposerDraftContext = createContext<ComposerDraftApi>({
  insertDraft: noop,
  registerInserter: noop,
  openCopilot: noop,
  registerCopilotOpener: noop,
  replaceDraft: noop,
  registerReplacer: noop,
  getComposerText: defaultTextProvider,
  registerTextProvider: noop,
  openJadeMenu: noop,
  registerJadeMenuOpener: noop,
  openAskTeam: noop,
  registerAskTeamOpener: noop,
})

export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const inserterRef = useRef<(text: string) => void>(noop)
  const openerRef   = useRef<() => void>(noop)
  const replacerRef = useRef<(text: string) => void>(noop)
  const textProviderRef = useRef<() => ComposerTextSnapshot>(defaultTextProvider)
  const jadeMenuOpenerRef = useRef<() => void>(noop)
  const askTeamOpenerRef = useRef<() => void>(noop)

  const api = useMemo<ComposerDraftApi>(() => ({
    insertDraft:            (text: string) => inserterRef.current(text),
    registerInserter:       (fn: (text: string) => void) => { inserterRef.current = fn },
    openCopilot:            () => openerRef.current(),
    registerCopilotOpener:  (fn: () => void) => { openerRef.current = fn },
    replaceDraft:           (text: string) => replacerRef.current(text),
    registerReplacer:       (fn: (text: string) => void) => { replacerRef.current = fn },
    getComposerText:        () => textProviderRef.current(),
    registerTextProvider:   (fn: () => ComposerTextSnapshot) => { textProviderRef.current = fn },
    openJadeMenu:           () => jadeMenuOpenerRef.current(),
    registerJadeMenuOpener: (fn: () => void) => { jadeMenuOpenerRef.current = fn },
    openAskTeam:            () => askTeamOpenerRef.current(),
    registerAskTeamOpener:  (fn: () => void) => { askTeamOpenerRef.current = fn },
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
