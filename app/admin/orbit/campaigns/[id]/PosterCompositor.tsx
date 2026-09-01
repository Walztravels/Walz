'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type PosterLayer,
  type PosterData,
  COMMERCIAL_LAYERS,
  defaultPosterData,
} from '@/lib/orbit/poster-data'
import type {
  DesignComposition, DesignLayer,
  TextLayer, TextSegmentsLayer, LogoLayer,
  ContactBarLayer, RouteCardLayer, PriceBlockLayer, CTAButtonLayer,
} from '@/lib/orbit/composer/layer-model'
import { autoFitText } from '@/lib/orbit/composer/auto-fit'
import { checkCompositionQuality } from '@/lib/orbit/composer/quality-checks'

export type { PosterLayer, PosterData }
export { COMMERCIAL_LAYERS, defaultPosterData, checkCompositionQuality }
export type { QualityWarning } from '@/lib/orbit/composer/quality-checks'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  backgroundUrl: string | null
  posterData:    PosterData
  onChange:      (data: PosterData) => void
  canvasWidth:   number
  canvasHeight:  number
  onExport?:     (blob: Blob, format: 'image/jpeg' | 'image/png') => void
  // Designer Mode: when composition is set, render using the rich layer model
  composition?:  DesignComposition
}

const LAYER_ORDER: Array<keyof PosterData> = [
  'logo', 'headline', 'subheadline', 'route', 'currency', 'price', 'cta', 'terms', 'contact',
]

const LAYER_LABELS: Record<keyof PosterData, string> = {
  logo: 'Logo / Brand', headline: 'Headline', subheadline: 'Subheadline',
  route: 'Route', price: 'Price', currency: 'Currency',
  cta: 'CTA Button', terms: 'Terms', contact: 'Contact',
}

const COMMERCIAL_NOTE: Record<keyof PosterData, string> = {
  price: '* Staff input only — AI never generates prices', currency: '* Staff input only',
  route: '* Staff input only', logo: '', headline: '', subheadline: '', cta: '', terms: '', contact: '',
}

// ── Canvas render helpers ─────────────────────────────────────────────────────

function measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number, fontSpec: string): number {
  ctx.font = fontSpec.replace('%sPX', `${fontSize}px`)
  return ctx.measureText(text).width
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxPx: number, font: string): string[] {
  ctx.font = font
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const attempt = cur ? `${cur} ${w}` : w
    if (ctx.measureText(attempt).width > maxPx && cur) { lines.push(cur); cur = w }
    else cur = attempt
  }
  if (cur) lines.push(cur)
  return lines
}

function renderTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer | LogoLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.text) return
  const x  = cw * layer.x
  const y  = ch * layer.y
  const scale = cw / 1080
  let fs = layer.fontSize * scale
  const mwPx = 'maxWidth' in layer && layer.maxWidth ? cw * layer.maxWidth : undefined

  // auto-fit if needed
  if ('autoFit' in layer && layer.autoFit && mwPx) {
    const result = autoFitText(
      { text: layer.text, boxWidth: mwPx, boxHeight: ch * 0.3, maxFontSize: layer.fontSize * scale, minFontSize: 12, fontFamily: 'Arial', fontWeight: layer.fontWeight },
      (t, size) => { ctx.font = `${layer.fontWeight} ${size}px Arial, sans-serif`; return ctx.measureText(t).width }
    )
    fs = result.fontSize
  }

  const font = `${layer.fontWeight} ${fs}px 'Helvetica Neue', Arial, sans-serif`
  ctx.save()
  ctx.fillStyle   = layer.color
  ctx.font        = font
  ctx.textAlign   = layer.align
  ctx.textBaseline = 'middle'
  if ('shadow' in layer && layer.shadow !== false) {
    ctx.shadowColor   = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur    = fs * 0.3
    ctx.shadowOffsetY = fs * 0.04
  }
  const lh = fs * 1.25

  if (mwPx) {
    const lines = wrapWords(ctx, layer.text, mwPx, font)
    const totalH = lines.length * lh
    lines.forEach((l, i) => ctx.fillText(l, x, y - totalH / 2 + i * lh + lh / 2))
  } else {
    ctx.fillText(layer.text, x, y)
  }
  ctx.restore()
}

function renderTextSegments(
  ctx: CanvasRenderingContext2D,
  layer: TextSegmentsLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.segments?.length) return
  const x  = cw * layer.x
  let   yy = ch * layer.y
  const scale = cw / 1080
  const fs = layer.fontSize * scale
  const lh = fs * (layer.lineHeight ?? 1.25)

  ctx.textAlign   = layer.align
  ctx.textBaseline = 'middle'

  // Flatten segments to lines
  const fullText = layer.segments.map(s => s.text).join('')
  const mwPx = layer.maxWidth ? cw * layer.maxWidth : cw * 0.9
  const baseFont = `${layer.fontWeight} ${fs}px 'Helvetica Neue', Arial, sans-serif`
  const lines = wrapWords(ctx, fullText, mwPx, baseFont)
  const totalH = lines.length * lh

  // Render each line in accent vs default
  let charOffset = 0
  for (let i = 0; i < lines.length; i++) {
    const lineY = yy - totalH / 2 + i * lh + lh / 2

    // Determine which segments fall in this line
    let lineStart = charOffset
    let lineEnd   = charOffset + lines[i].length

    // Render char by char tracking segment styles would be complex;
    // use a simplified approach: if this line is fully within an accent segment, color it accent
    let lineStyle = 'default'
    let pos = 0
    for (const seg of layer.segments) {
      const segStart = pos
      const segEnd   = pos + seg.text.length
      pos = segEnd
      if (segStart >= lineStart && segEnd <= lineEnd) { lineStyle = seg.style; break }
      if (segStart <= lineStart && segEnd >= lineEnd)  { lineStyle = seg.style; break }
    }

    ctx.save()
    ctx.font = baseFont
    ctx.fillStyle = lineStyle === 'accent' ? layer.accentColor
      : lineStyle === 'muted' ? (layer.mutedColor ?? '#aaaaaa')
      : layer.color
    if (layer.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = fs * 0.3; ctx.shadowOffsetY = fs * 0.04
    }
    ctx.fillText(lines[i], x, lineY)
    ctx.restore()

    charOffset += lines[i].length + 1  // +1 for the space that was stripped
  }
}

function renderCTAButton(
  ctx: CanvasRenderingContext2D,
  layer: CTAButtonLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.text) return
  const scale  = cw / 1080
  const fs     = (layer.fontSize ?? 26) * scale
  const px     = cw * (layer.paddingX ?? 0.08)
  const py     = ch * (layer.paddingY ?? 0.02)
  const font   = `700 ${fs}px 'Helvetica Neue', Arial, sans-serif`
  ctx.font = font
  const tw     = ctx.measureText(layer.text).width
  const bw     = tw + px * 2
  const bh     = fs + py * 2
  const cx     = cw * layer.x
  const cy     = ch * layer.y
  const r      = layer.borderRadius ?? 24
  const bx     = cx - bw / 2
  const by     = cy - bh / 2

  ctx.save()
  ctx.fillStyle = layer.backgroundColor
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, r)
  ctx.fill()

  ctx.fillStyle   = layer.textColor
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(layer.text, cx, cy)
  ctx.restore()
}

function renderRouteCards(
  ctx: CanvasRenderingContext2D,
  layer: RouteCardLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.routes?.length) return
  const scale    = cw / 1080
  const fs       = (layer.fontSize ?? 20) * scale
  const padding  = 16 * scale
  const cardH    = fs + padding * 2
  const gap      = 10 * scale
  const font     = `600 ${fs}px 'Helvetica Neue', Arial, sans-serif`
  ctx.font = font

  const widths   = layer.routes.map(r => ctx.measureText(r).width + padding * 2)
  const totalW   = widths.reduce((s, w) => s + w, 0) + gap * (layer.routes.length - 1)
  let startX     = cw * layer.x - totalW / 2

  for (let i = 0; i < layer.routes.length; i++) {
    const cardW = widths[i]
    const cardX = startX
    const cardY = ch * layer.y - cardH / 2
    const r     = cardH * 0.4

    ctx.save()
    ctx.fillStyle = layer.cardColor ?? '#1a3060'
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, r); ctx.fill()
    ctx.fillStyle   = layer.textColor ?? '#d4af37'
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(layer.routes[i], cardX + cardW / 2, ch * layer.y)
    ctx.restore()

    startX += cardW + gap
  }
}

function renderPriceBlock(
  ctx: CanvasRenderingContext2D,
  layer: PriceBlockLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.amount) return
  const scale    = cw / 1080
  const amtFont  = `800 ${(layer.fontSize ?? 80) * scale}px 'Helvetica Neue', Arial, sans-serif`
  const curFont  = `600 ${((layer.fontSize ?? 80) * 0.28) * scale}px 'Helvetica Neue', Arial, sans-serif`
  const cx       = cw * layer.x
  const cy       = ch * layer.y

  ctx.save()
  // Amount
  ctx.font        = amtFont
  ctx.fillStyle   = layer.color ?? '#ffffff'
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
  ctx.fillText(layer.amount, cx, cy)
  // Currency label above
  ctx.font = curFont
  ctx.fillStyle = layer.currencyColor ?? '#d4af37'
  ctx.shadowBlur = 0
  ctx.fillText(layer.currency, cx, cy - (layer.fontSize ?? 80) * scale * 0.75)
  ctx.restore()
}

function renderContactBar(
  ctx: CanvasRenderingContext2D,
  layer: ContactBarLayer,
  cw: number, ch: number,
) {
  if (!layer.visible || !layer.items?.length) return
  const scale  = cw / 1080
  const fs     = (layer.fontSize ?? 14) * scale
  const barH   = fs * 2.4
  const barY   = ch * layer.y - barH / 2

  ctx.save()
  // Background bar
  ctx.fillStyle = layer.backgroundColor ?? 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, barY, cw, barH)

  const font  = `600 ${fs}px 'Helvetica Neue', Arial, sans-serif`
  ctx.font    = font
  ctx.textBaseline = 'middle'

  const items   = layer.items ?? []
  const parts   = items.map(item => `${item.icon} ${item.text}`)
  const partW   = cw / parts.length
  const midY    = barY + barH / 2

  parts.forEach((text, i) => {
    ctx.textAlign = 'center'
    ctx.fillStyle = items[i].highlight ? '#d4af37' : (layer.color ?? '#d4af37')
    ctx.fillText(text, partW * i + partW / 2, midY)
  })
  ctx.restore()
}

// ── Design composition renderer ───────────────────────────────────────────────

function renderComposition(
  ctx: CanvasRenderingContext2D,
  composition: DesignComposition,
  bgImg: HTMLImageElement | null,
  cw: number, ch: number,
) {
  ctx.clearRect(0, 0, cw, ch)

  for (const layer of composition.layers) {
    if (!layer.visible) continue

    const opacity = layer.opacity ?? 1
    if (opacity < 1) ctx.globalAlpha = opacity

    switch (layer.type) {
      case 'image':
        if (bgImg) {
          ctx.save()
          const { objectFit } = layer
          if (objectFit === 'cover') {
            // Scale to cover canvas
            const scale = Math.max(cw / bgImg.width, ch / bgImg.height)
            const sw    = bgImg.width * scale
            const sh    = bgImg.height * scale
            ctx.drawImage(bgImg, (cw - sw) / 2, (ch - sh) / 2, sw, sh)
          } else {
            ctx.drawImage(bgImg, 0, 0, cw, ch)
          }
          ctx.restore()
        } else {
          ctx.fillStyle = '#0d1b2a'
          ctx.fillRect(0, 0, cw, ch)
        }
        // Legibility gradient overlay
        {
          const grad = ctx.createLinearGradient(0, 0, 0, ch)
          grad.addColorStop(0,   'rgba(0,0,0,0.50)')
          grad.addColorStop(0.3, 'rgba(0,0,0,0.10)')
          grad.addColorStop(0.6, 'rgba(0,0,0,0.20)')
          grad.addColorStop(1,   'rgba(0,0,0,0.60)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, cw, ch)
        }
        break

      case 'logo':
        renderTextOnCanvas(ctx, layer as LogoLayer, cw, ch)
        break

      case 'text':
        renderTextOnCanvas(ctx, layer as TextLayer, cw, ch)
        break

      case 'text_segments':
        renderTextSegments(ctx, layer as TextSegmentsLayer, cw, ch)
        break

      case 'cta_button':
        renderCTAButton(ctx, layer as CTAButtonLayer, cw, ch)
        break

      case 'route_card':
        renderRouteCards(ctx, layer as RouteCardLayer, cw, ch)
        break

      case 'price_block':
        renderPriceBlock(ctx, layer as PriceBlockLayer, cw, ch)
        break

      case 'contact_bar':
        renderContactBar(ctx, layer as ContactBarLayer, cw, ch)
        break

      case 'shape': {
        const sl = layer as import('@/lib/orbit/composer/layer-model').ShapeLayer
        ctx.save()
        ctx.fillStyle = sl.background
        const sx = cw * sl.x
        const sy = ch * sl.y
        const sw = sl.width  ? cw * sl.width  : cw
        const sh = sl.height ? ch * sl.height : ch * 0.08
        const sr = sl.borderRadius ? sh * sl.borderRadius : 0
        ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sr); ctx.fill()
        ctx.restore()
        break
      }
    }

    if (opacity < 1) ctx.globalAlpha = 1
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function PosterCompositor({
  backgroundUrl,
  posterData,
  onChange,
  canvasWidth,
  canvasHeight,
  onExport,
  composition,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const bgImgRef   = useRef<HTMLImageElement | null>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [activeLayer, setActiveLayer] = useState<keyof PosterData>('headline')
  const [exportFormat, setExportFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg')

  const effectiveBackground = composition
    ? (composition.layers.find(l => l.type === 'image') as { src?: string } | undefined)?.src ?? null
    : backgroundUrl

  useEffect(() => {
    if (!effectiveBackground) { setBgLoaded(false); bgImgRef.current = null; return }
    setBgLoaded(false)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { bgImgRef.current = img; setBgLoaded(true) }
    img.onerror = () => { bgImgRef.current = null; setBgLoaded(false) }
    img.src = effectiveBackground
  }, [effectiveBackground])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (composition) {
      renderComposition(ctx, composition, bgImgRef.current, canvasWidth, canvasHeight)
      return
    }

    // ── Legacy PosterData rendering path ─────────────────────────────────────
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    if (bgImgRef.current && bgLoaded) {
      ctx.drawImage(bgImgRef.current, 0, 0, canvasWidth, canvasHeight)
    } else {
      ctx.fillStyle = '#0d1b2a'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      ctx.fillStyle = '#1a2a3a'
      ctx.font = `${canvasWidth * 0.03}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('Generate background artwork to preview poster', canvasWidth / 2, canvasHeight / 2)
    }
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.3, 'rgba(0,0,0,0.15)')
    grad.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0.65)')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    const ctaLayer = posterData.cta
    if (ctaLayer.visible && ctaLayer.text) {
      const btH = canvasHeight * 0.06; const btW = canvasWidth * 0.55
      const btX = canvasWidth * ctaLayer.x - btW / 2; const btY = canvasHeight * ctaLayer.y - btH * 0.75
      const r = btH * 0.35
      ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.roundRect(btX, btY, btW, btH, r); ctx.fill()
    }
    const scale = canvasWidth / 1080
    for (const key of LAYER_ORDER) {
      const layer = posterData[key]
      if (!layer.visible || !layer.text) continue
      const x = canvasWidth * layer.x; const y = canvasHeight * layer.y
      const fs = layer.fontSize * scale; const mw = layer.maxWidth ? canvasWidth * layer.maxWidth : undefined
      ctx.save()
      ctx.fillStyle = layer.color; ctx.font = `${layer.fontWeight} ${fs}px 'Helvetica Neue', Arial, sans-serif`
      ctx.textAlign = layer.align; ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = fs * 0.3; ctx.shadowOffsetY = fs * 0.04
      if (mw) {
        const words = layer.text.split(' '); const lh = fs * 1.2; let line = ''; const lines: string[] = []
        for (const word of words) {
          const test = line ? `${line} ${word}` : word
          if (ctx.measureText(test).width > mw && line) { lines.push(line); line = word } else line = test
        }
        if (line) lines.push(line)
        const totalH = lines.length * lh
        lines.forEach((l, i) => ctx.fillText(l, x, y - totalH / 2 + i * lh + lh / 2))
      } else { ctx.fillText(layer.text, x, y) }
      ctx.restore()
    }
  }, [posterData, bgLoaded, canvasWidth, canvasHeight, composition])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  function exportPoster() {
    const canvas = canvasRef.current
    if (!canvas || !onExport) return
    canvas.toBlob(blob => { if (blob) onExport(blob, exportFormat) }, exportFormat, 0.92)
  }

  function updateLayer(key: keyof PosterData, patch: Partial<PosterLayer>) {
    onChange({ ...posterData, [key]: { ...posterData[key], ...patch } })
  }

  const displayScale = Math.min(480 / canvasWidth, 800 / canvasHeight)
  const displayW     = Math.round(canvasWidth  * displayScale)
  const displayH     = Math.round(canvasHeight * displayScale)

  const active = posterData[activeLayer]

  return (
    <div className="flex gap-4 flex-wrap lg:flex-nowrap">
      {/* Canvas preview */}
      <div className="flex-shrink-0">
        <div className="relative" style={{ width: displayW, height: displayH }}>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{ width: displayW, height: displayH, borderRadius: 8, display: 'block' }}
            className="border border-gray-700"
          />
        </div>
        {onExport && (
          <div className="mt-2 flex gap-1">
            <select
              value={exportFormat}
              onChange={e => setExportFormat(e.target.value as 'image/jpeg' | 'image/png')}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5"
            >
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
            </select>
            <button
              onClick={exportPoster}
              className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
            >
              Export
            </button>
          </div>
        )}
        <p className="mt-1 text-xs text-gray-600 text-center">{canvasWidth} × {canvasHeight}px</p>
      </div>

      {/* Layer editor — only shown in legacy PosterData mode */}
      {!composition && (
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap gap-1">
            {LAYER_ORDER.map(k => (
              <button
                key={k}
                onClick={() => setActiveLayer(k)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  activeLayer === k ? 'bg-indigo-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                } ${COMMERCIAL_LAYERS.includes(k) ? 'ring-1 ring-yellow-700' : ''}`}
              >
                {LAYER_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{LAYER_LABELS[activeLayer]}</span>
              {COMMERCIAL_NOTE[activeLayer] && (
                <span className="text-xs text-yellow-600">{COMMERCIAL_NOTE[activeLayer]}</span>
              )}
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={active.visible}
                  onChange={e => updateLayer(activeLayer, { visible: e.target.checked })} className="rounded" />
                Visible
              </label>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {COMMERCIAL_LAYERS.includes(activeLayer) ? 'Text (staff input only)' : 'Text'}
              </label>
              {activeLayer === 'terms' || activeLayer === 'contact' ? (
                <textarea rows={2} value={active.text}
                  onChange={e => updateLayer(activeLayer, { text: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none"
                  placeholder={`Enter ${LAYER_LABELS[activeLayer].toLowerCase()}…`} />
              ) : (
                <input type="text" value={active.text}
                  onChange={e => updateLayer(activeLayer, { text: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                  placeholder={`Enter ${LAYER_LABELS[activeLayer].toLowerCase()}…`} />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Font size (pt)</label>
                <input type="number" value={active.fontSize}
                  onChange={e => updateLayer(activeLayer, { fontSize: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                  min={8} max={200} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Color</label>
                <input type="color" value={active.color}
                  onChange={e => updateLayer(activeLayer, { color: e.target.value })}
                  className="w-full h-9 bg-gray-800 border border-gray-700 rounded px-1 cursor-pointer" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">X (0–1)</label>
                <input type="number" step="0.01" min={0} max={1} value={active.x}
                  onChange={e => updateLayer(activeLayer, { x: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Y (0–1)</label>
                <input type="number" step="0.01" min={0} max={1} value={active.y}
                  onChange={e => updateLayer(activeLayer, { y: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Align</label>
                <select value={active.align}
                  onChange={e => updateLayer(activeLayer, { align: e.target.value as 'left' | 'center' | 'right' })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Weight</label>
              <select value={active.fontWeight}
                onChange={e => updateLayer(activeLayer, { fontWeight: e.target.value as PosterLayer['fontWeight'] })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white">
                <option value="400">Regular</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
                <option value="800">Black</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Prices, fares, and routes must come from staff input. AI never generates commercial values.
          </p>
        </div>
      )}

      {/* Designer Mode layer summary */}
      {composition && (
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Template: {composition.templateKey}
          </p>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {composition.layers.filter(l => l.visible).map(l => (
              <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400 capitalize">{l.id.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-300 truncate">
                  {'text' in l ? String(l.text).slice(0, 40) : l.type}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            Edit commercial fields in the Designer tab to update this composition.
          </p>
        </div>
      )}
    </div>
  )
}
