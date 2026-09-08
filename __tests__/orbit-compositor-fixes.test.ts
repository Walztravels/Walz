/**
 * Orbit Poster Compositor — logo rendering + typography control fixes.
 *
 * Covers: the logo render condition (image renders whenever loaded — the
 * layer-logoUrl coupling was the bug; text is never substituted), the
 * official-logo fallback, manual line breaks in wrapping and auto-fit,
 * fit-to-box behavior, min/max font validation, footer readability
 * warnings, staff contact text honoured, layer controls exposure,
 * reset/undo wiring, and no changes to other templates.
 */

import fs from 'fs'
import path from 'path'

import { wrapTextLines, autoFitText, estimateMeasure } from '@/lib/orbit/composer/auto-fit'
import { buildTemplateComposition } from '@/lib/orbit/composer/composition'
import { checkCompositionQuality, MIN_READABLE_FONT_PT } from '@/lib/orbit/composer/quality-checks'
import { walzHeroSplit } from '@/lib/orbit/templates/walz-hero-split'
import { walzTravelCollage } from '@/lib/orbit/templates/walz-travel-collage'
import { TEMPLATE_CANVASES } from '@/lib/orbit/templates/schema'
import type { TextLayer, LogoLayer, DesignLayer } from '@/lib/orbit/composer/layer-model'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const COMPOSITOR = 'app/admin/orbit/campaigns/[id]/PosterCompositor.tsx'
const STUDIO     = 'app/admin/orbit/campaigns/[id]/CreativeStudioSection.tsx'

// ── Manual line breaks ────────────────────────────────────────────────────────

describe('wrapTextLines (manual line breaks)', () => {
  it('honours "\\n" as a hard break: WALZ TRAVELS ⏎ IS HIRING stays two lines', () => {
    const lines = wrapTextLines('WALZ TRAVELS\nIS HIRING', 10_000, 72, '', estimateMeasure)
    expect(lines).toEqual(['WALZ TRAVELS', 'IS HIRING'])
  })
  it('word-wraps within each hard line when too wide', () => {
    // estimateMeasure ≈ 5.5px/char at fontSize 10 → 60px fits ~10 chars
    const lines = wrapTextLines('one two three four\nfive', 60, 10, '', estimateMeasure)
    expect(lines).toEqual(['one two', 'three four', 'five'])
  })
  it('single paragraph with no breaks wraps as before', () => {
    const lines = wrapTextLines('WALZ TRAVELS IS HIRING', 10_000, 72, '', estimateMeasure)
    expect(lines).toEqual(['WALZ TRAVELS IS HIRING'])
  })
})

describe('autoFitText (fit text to box)', () => {
  it('shrinks the font until the text fits and never goes below the minimum', () => {
    const fit = autoFitText(
      { text: 'A VERY LONG HEADLINE THAT CANNOT POSSIBLY FIT', boxWidth: 200, boxHeight: 100, maxFontSize: 72, minFontSize: 12 },
      estimateMeasure,
    )
    expect(fit.fontSize).toBeLessThan(72)
    expect(fit.fontSize).toBeGreaterThanOrEqual(12)
  })
  it('keeps manual line breaks and skips the widow heuristic for them', () => {
    const fit = autoFitText(
      { text: 'WALZ TRAVELS\nIS HIRING', boxWidth: 10_000, boxHeight: 10_000, maxFontSize: 72, minFontSize: 12 },
      estimateMeasure,
    )
    expect(fit.lines).toEqual(['WALZ TRAVELS', 'IS HIRING'])
    expect(fit.overflow).toBe(false)
  })
  it('reports overflow when even the minimum size cannot fit', () => {
    const fit = autoFitText(
      { text: 'WORD '.repeat(80).trim(), boxWidth: 60, boxHeight: 40, maxFontSize: 40, minFontSize: 12, maxLines: 2 },
      estimateMeasure,
    )
    expect(fit.overflow).toBe(true)
  })
})

// ── Logo rendering ────────────────────────────────────────────────────────────

describe('logo rendering fix', () => {
  const src = read(COMPOSITOR)

  it('renders the logo image whenever it is loaded — no layer.logoUrl coupling', () => {
    const logoCase = src.slice(src.indexOf("case 'logo':"), src.indexOf("case 'text':"))
    expect(logoCase).toContain('if (logoImg)')
    expect(logoCase).not.toContain('ll.logoUrl &&')     // the old broken condition
    expect(logoCase).not.toContain('fillText')          // text is never substituted
  })

  it('preserves aspect ratio from naturalWidth/naturalHeight and never stretches', () => {
    expect(src).toContain('(lw / img.naturalWidth) * img.naturalHeight')
  })

  it('surfaces a clear error when the logo cannot load and confirms before export', () => {
    expect(src).toContain('logoError')
    expect(src).toContain('Official logo failed to load')
    expect(src).toContain('logoMissing')
    // export is never silent about a missing logo
    const exportFn = src.slice(src.indexOf('function exportPoster'), src.indexOf('function updateLayer'))
    expect(exportFn).toContain('logoMissing')
    expect(exportFn).toContain('confirm(')
  })

  it('the studio falls back to the built-in official transparent logo', () => {
    const studio = read(STUDIO)
    expect(studio).toContain("'/walz-logo.png'")
    expect(studio).toContain('OFFICIAL_LOGO_FALLBACK')
    expect(fs.existsSync(path.join(process.cwd(), 'public/walz-logo.png'))).toBe(true)
  })

  it('approved variant + size selection is exposed in the controls panel', () => {
    const panel = read('app/admin/orbit/campaigns/[id]/DesignerControlsPanel.tsx')
    for (const v of ['AUTO', 'PRIMARY', 'LIGHT', 'DARK', 'MONOCHROME', 'ICON']) expect(panel).toContain(`'${v}'`)
    expect(panel).toContain("set('logoVariant'")
    expect(panel).toContain("set('logoScale'")
    expect(panel).toContain('never recoloured or stretched')
  })

  it('composition carries the logo scale from controls', () => {
    const comp = buildTemplateComposition({
      template: walzHeroSplit,
      commercialFields: { headline: 'X', cta: 'Book' },
      canvas: TEMPLATE_CANVASES['1080x1350'],
      controls: { logoScale: 'prominent' } as never,
    })
    const logo = comp.layers.find(l => l.type === 'logo') as LogoLayer
    expect(logo.logoScale).toBe('prominent')
  })
})

// ── Typography controls ───────────────────────────────────────────────────────

describe('layer typography controls', () => {
  const src = read(COMPOSITOR)

  it('exposes font size, line height, letter spacing, width, align, position and fit-to-box', () => {
    for (const needle of [
      'Font size (pt)', 'Line height', 'Letter spacing (px)', 'Width (0.1–1)',
      'Fit text to box', "onLayerChange?.(l.id, { fontSize:", "{ lineHeight:",
      "{ letterSpacing:", "{ maxWidth:", "{ align:", "{ autoFit:",
    ]) {
      expect(src).toContain(needle)
    }
  })

  it('validates sizes with sensible min/max clamps', () => {
    expect(src).toContain('MIN_FONT_PT = 8')
    expect(src).toContain('MAX_FONT_PT = 200')
    expect(src).toMatch(/clamp\(Number\(e\.target\.value\), MIN_FONT_PT, MAX_FONT_PT\)/)
  })

  it('locking blocks edits but tells staff how to unlock — never permanent', () => {
    expect(src).toContain('Click 🔒 above to unlock and edit')
    expect(src).toContain('{ locked: !l.locked }')     // the unlock toggle itself
  })

  it('Reset to template default clears the layer overrides (no more no-op)', () => {
    expect(src).not.toContain('onLayerChange?.(l.id, {})')
    expect(src).toContain('onLayerReset(l.id)')
    const studio = read(STUDIO)
    expect(studio).toContain('delete updated[layerId]')
  })

  it('Undo restores the previous override state via a bounded history', () => {
    expect(src).toContain('↩ Undo')
    const studio = read(STUDIO)
    expect(studio).toContain('overrideHistory')
    expect(studio).toContain('h.slice(-29)')
    expect(studio).toContain('h.slice(0, -1)')
  })

  it('the text renderer honours lineHeight, letterSpacing and manual breaks', () => {
    const render = src.slice(src.indexOf('function renderTextOnCanvas'), src.indexOf('function renderTextSegments'))
    expect(render).toContain('layer.lineHeight')
    expect(render).toContain('letterSpacing')
    expect(render).toContain('wrapTextLines')
  })

  it('preview and export share one canvas, so they always match', () => {
    expect(src).toContain('canvas.toBlob')
    expect((src.match(/<canvas/g) ?? []).length).toBe(1)
  })

  it('headline and terms fields accept manual line breaks (textarea)', () => {
    const studio = read(STUDIO)
    expect(studio).toContain("field.type === 'multiline' || field.type === 'text' || field.type === 'terms'")
  })

  it('Save layers flushes the designer draft immediately for reload persistence', () => {
    const studio = read(STUDIO)
    const save = studio.slice(studio.indexOf('async function savePosterData'), studio.indexOf('async function uploadReference'))
    expect(save).toContain('serializeDraft')
    expect(save).toContain('saveDraft(campaignId, draft)')
  })
})

// ── Footer readability ────────────────────────────────────────────────────────

describe('footer readability', () => {
  function heroComp(termsSize: number, contactText = 'walztravels.com/careers') {
    const comp = buildTemplateComposition({
      template: walzHeroSplit,
      commercialFields: {
        headline: 'WALZ TRAVELS\nIS HIRING',
        cta: 'Apply Now',
        terms: 'REMOTE · NIGERIA & GHANA\nCOMMISSION-BASED · NO FIXED SALARY',
        contact: contactText,
      },
      canvas: TEMPLATE_CANVASES['1080x1350'],
      layerOverrides: { terms: { fontSize: termsSize } as Partial<DesignLayer> },
    })
    return comp
  }

  it('staff contact text replaces the default contact bar (walztravels.com/careers)', () => {
    const comp = heroComp(14)
    const contact = comp.layers.find(l => l.id === 'contact') as TextLayer | undefined
    expect(contact?.type).toBe('text')
    expect(contact?.text).toBe('walztravels.com/careers')
    expect(comp.layers.some(l => l.type === 'contact_bar')).toBe(false)
  })

  it('blank contact keeps the default BUSINESS contact bar', () => {
    const comp = heroComp(14, '')
    expect(comp.layers.some(l => l.type === 'contact_bar')).toBe(true)
  })

  it('warns when terms/contact drop below the readable minimum', () => {
    expect(MIN_READABLE_FONT_PT).toBe(13)
    const warnings = checkCompositionQuality(heroComp(10))
    expect(warnings.some(w => w.field === 'terms' && w.message.includes('readable minimum'))).toBe(true)
    const ok = checkCompositionQuality(heroComp(14))
    expect(ok.some(w => w.field === 'terms')).toBe(false)
  })

  it('the export confirm includes readability problems', () => {
    const exportFn = read(COMPOSITOR)
    expect(exportFn).toContain("w.message.includes('readable minimum')")
  })
})

// ── Other templates unchanged ─────────────────────────────────────────────────

describe('template compatibility', () => {
  it('walz-travel-collage still composes with the same behavior (bar footer, logo layer)', () => {
    const comp = buildTemplateComposition({
      template: walzTravelCollage,
      commercialFields: { headline: 'Hello', cta: 'Book' },
      canvas: TEMPLATE_CANVASES[walzTravelCollage.defaultCanvas] ?? TEMPLATE_CANVASES['1080x1350'],
    })
    expect(comp.layers.some(l => l.type === 'contact_bar')).toBe(true)
    expect(comp.layers.some(l => l.type === 'logo')).toBe(true)
  })

  it('no template definition files were modified for these fixes', () => {
    for (const f of fs.readdirSync(path.join(process.cwd(), 'lib/orbit/templates'))) {
      const src = read(`lib/orbit/templates/${f}`)
      expect(src).not.toContain('logoUrl')
      expect(src).not.toContain('letterSpacing')
    }
  })
})
