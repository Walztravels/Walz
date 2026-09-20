/**
 * Walz Team Hub V1 UI — @mention trigger parsing (lib/mentionParse.ts) for
 * the composer's autocomplete dropdown. This module only decides WHEN to
 * show the dropdown and what partial query to search for — the actual
 * candidate list is always fetched server-side, membership-scoped
 * (see MentionAutocomplete.tsx's own header comment).
 */
import { findMentionTrigger, applyMentionSelection } from '@/app/admin/team/lib/mentionParse'

describe('findMentionTrigger', () => {
  it('detects an "@" typed at the very start of the text', () => {
    expect(findMentionTrigger('@joh', 4)).toEqual({ start: 0, query: 'joh' })
  })

  it('detects an "@" typed mid-sentence, preceded by whitespace', () => {
    const text = 'hey @nne can you check this'
    expect(findMentionTrigger(text, 8)).toEqual({ start: 4, query: 'nne' })
  })

  it('detects a bare "@" with no query typed yet', () => {
    expect(findMentionTrigger('hello @', 7)).toEqual({ start: 6, query: '' })
  })

  it('returns null when there is no "@" before the cursor', () => {
    expect(findMentionTrigger('hello there', 11)).toBeNull()
  })

  it('returns null once the trigger is broken by whitespace after the "@"', () => {
    expect(findMentionTrigger('hey @nne is here', 8)).not.toBeNull() // cursor right after "nne"
    expect(findMentionTrigger('hey @nne is here', 9)).toBeNull() // cursor is now past the space after "nne"
  })

  it('does not trigger on an email-like "user@domain" (no preceding whitespace/start)', () => {
    expect(findMentionTrigger('contact me at a@b', 17)).toBeNull()
  })

  it('is not fooled by the cursor sitting earlier in the string than an "@" further along', () => {
    const text = 'hello @later'
    expect(findMentionTrigger(text, 5)).toBeNull()
  })
})

describe('applyMentionSelection', () => {
  it('replaces the "@partial" token with "@Full Name " and returns the new cursor position', () => {
    const text = 'hey @nn can you help'
    const trigger = { start: 4, query: 'nn' }
    const cursor = 7 // right after "nn"
    const result = applyMentionSelection(text, trigger, cursor, 'Nneka Okafor')
    expect(result.text).toBe('hey @Nneka Okafor  can you help')
    expect(result.cursor).toBe('hey @Nneka Okafor '.length)
  })

  it('handles a mention at the very end of the text', () => {
    const text = 'ping @j'
    const trigger = { start: 5, query: 'j' }
    const result = applyMentionSelection(text, trigger, text.length, 'Jide')
    expect(result.text).toBe('ping @Jide ')
    expect(result.cursor).toBe('ping @Jide '.length)
  })
})
