/**
 * Jade Customer Experience Polish — JadeMessageContent security + rendering
 * tests. Covers the module's own security contract: React elements only,
 * no dangerouslySetInnerHTML, unsafe link schemes neutralized, raw
 * HTML/script content never executes.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import JadeMessageContent, { tokenizeInline, parseBlocks } from '@/components/portal/JadeMessageContent'

function html(text: string): string {
  return renderToStaticMarkup(<JadeMessageContent text={text} />)
}

describe('JadeMessageContent — malicious input (security contract)', () => {
  it('never executes a <script> tag embedded in message text — renders as inert, escaped text', () => {
    const out = html('Here is something: <script>alert(1)</script> end')
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('</script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('alert(1)')
  })

  it('never executes an <img onerror> payload — renders as inert, escaped text', () => {
    const out = html('<img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/<img[^>]*onerror/i)
    expect(out).toContain('&lt;img')
  })

  it('neutralizes a javascript: link — renders the link text as plain text, not a clickable anchor', () => {
    const out = html('[click me](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
    expect(out).not.toMatch(/<a[^>]*href/i)
    expect(out).toContain('click me')
  })

  it('neutralizes a data: URI link', () => {
    const out = html('[open](data:text/html,<script>alert(1)</script>)')
    expect(out).not.toContain('data:text/html')
    expect(out).not.toMatch(/<a[^>]*href/i)
  })

  it('neutralizes a vbscript: link', () => {
    const out = html('[run](vbscript:msgbox("hi"))')
    expect(out).not.toContain('vbscript:')
    expect(out).not.toMatch(/<a[^>]*href/i)
  })

  it('neutralizes an obfuscated scheme hidden behind embedded whitespace', () => {
    const out = html('[go](java\tscript:alert(1))')
    expect(out).not.toMatch(/<a[^>]*href/i)
  })

  it('never produces dangerouslySetInnerHTML output for any input — raw HTML stays visibly escaped', () => {
    const out = html('plain <b>not-really-bold</b> text')
    expect(out).toContain('&lt;b&gt;')
    expect(out).not.toContain('<b>not-really-bold</b>')
  })

  it('an empty/falsy message renders nothing and does not throw', () => {
    expect(() => html('')).not.toThrow()
  })
})

describe('JadeMessageContent — safe links', () => {
  it('renders a safe https:// link as a real, clickable anchor with target=_blank', () => {
    const out = html('See [our site](https://www.walztravels.com) for more.')
    expect(out).toMatch(/<a[^>]*href="https:\/\/www\.walztravels\.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>our site<\/a>/)
  })

  it('renders a relative internal link as a real anchor', () => {
    const out = html('Please [sign in again](/login).')
    expect(out).toMatch(/<a[^>]*href="\/login"[^>]*>sign in again<\/a>/)
  })

  it('renders a mailto: link as a real anchor', () => {
    const out = html('Email [us](mailto:help@walztravels.com).')
    expect(out).toMatch(/<a[^>]*href="mailto:help@walztravels\.com"[^>]*>us<\/a>/)
  })
})

describe('JadeMessageContent — markdown feature coverage (the fix for the visible-raw-syntax bug)', () => {
  it('renders a heading without leaking the leading #', () => {
    const out = html('### Your trip summary')
    expect(out).not.toContain('###')
    expect(out).toContain('Your trip summary')
  })

  it('renders multiple heading levels without leaking #', () => {
    for (const prefix of ['#', '##', '###', '####', '#####', '######']) {
      const out = html(`${prefix} Heading text`)
      expect(out).not.toContain(prefix + ' ')
      expect(out).toContain('Heading text')
    }
  })

  it('renders an unordered list without leaking the leading - or *', () => {
    const out = html('- First item\n- Second item\n- Third item')
    expect(out).toMatch(/<ul[^>]*>/)
    expect(out).toContain('<li>First item</li>')
    expect(out).toContain('<li>Second item</li>')
    expect(out).not.toMatch(/^-\s/m)
  })

  it('renders an ordered list without leaking the leading number+dot', () => {
    const out = html('1. First step\n2. Second step\n3. Third step')
    expect(out).toMatch(/<ol[^>]*>/)
    expect(out).toContain('<li>First step</li>')
  })

  it('renders inline code without leaking backticks', () => {
    const out = html('Run `npm install` to set up.')
    expect(out).not.toContain('`')
    expect(out).toMatch(/<code[^>]*>npm install<\/code>/)
  })

  it('renders bold without leaking **', () => {
    const out = html('This is **important**.')
    expect(out).not.toContain('**')
    expect(out).toMatch(/<strong[^>]*>important<\/strong>/)
  })

  it('renders italic (* and _ forms) without leaking markers', () => {
    const outStar = html('This is *emphasized*.')
    expect(outStar).toMatch(/<em>emphasized<\/em>/)
    const outUnderscore = html('This is _emphasized_.')
    expect(outUnderscore).toMatch(/<em>emphasized<\/em>/)
  })

  it('reproduces the exact previously-broken case: headings, bold, and a list together', () => {
    const out = html('### Trip Summary\n\nYour **Dubai** trip includes:\n- Flights\n- Hotel\n- Transfers')
    expect(out).not.toContain('###')
    expect(out).not.toContain('**')
    expect(out).not.toMatch(/^-\s/m)
    expect(out).toContain('Trip Summary')
    expect(out).toMatch(/<strong[^>]*>Dubai<\/strong>/)
    expect(out).toContain('<li>Flights</li>')
  })

  it('preserves line breaks within a paragraph', () => {
    const out = html('Line one\nLine two')
    expect(out).toMatch(/Line one<br\/?>[\s\S]*Line two|Line one<br\/>Line two/)
  })
})

describe('tokenizeInline — pure function unit tests', () => {
  it('never mutates its input string', () => {
    const input = '**bold** text'
    tokenizeInline(input)
    expect(input).toBe('**bold** text')
  })

  it('tokenizes a plain string with no markdown as a single text token', () => {
    expect(tokenizeInline('just plain text')).toEqual([{ type: 'text', content: 'just plain text' }])
  })
})

describe('parseBlocks — pure function unit tests', () => {
  it('never mutates its input string', () => {
    const input = '# Heading\n\nParagraph.'
    parseBlocks(input)
    expect(input).toBe('# Heading\n\nParagraph.')
  })

  it('separates a heading, a paragraph, and a list into distinct blocks', () => {
    const blocks = parseBlocks('# Title\n\nSome text.\n\n- a\n- b')
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'ul'])
  })
})
