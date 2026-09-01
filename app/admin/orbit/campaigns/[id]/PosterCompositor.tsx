'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type PosterLayer,
  type PosterData,
  COMMERCIAL_LAYERS,
  defaultPosterData,
} from '@/lib/orbit/poster-data'

export type { PosterLayer, PosterData }
export { COMMERCIAL_LAYERS, defaultPosterData }

interface Props {
  backgroundUrl: string | null
  posterData:    PosterData
  onChange:      (data: PosterData) => void
  canvasWidth:   number
  canvasHeight:  number
  onExport?:     (blob: Blob) => void
}

const LAYER_ORDER: Array<keyof PosterData> = [
  'logo', 'headline', 'subheadline', 'route', 'currency', 'price', 'cta', 'terms', 'contact',
]

const LAYER_LABELS: Record<keyof PosterData, string> = {
  logo:        'Logo / Brand',
  headline:    'Headline',
  subheadline: 'Subheadline',
  route:       'Route',
  price:       'Price',
  currency:    'Currency',
  cta:         'CTA Button',
  terms:       'Terms',
  contact:     'Contact',
}

const COMMERCIAL_NOTE: Record<keyof PosterData, string> = {
  price:    '* Staff input only — AI never generates prices',
  currency: '* Staff input only',
  route:    '* Staff input only',
  logo: '', headline: '', subheadline: '', cta: '', terms: '', contact: '',
}

export function PosterCompositor({
  backgroundUrl,
  posterData,
  onChange,
  canvasWidth,
  canvasHeight,
  onExport,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const bgImgRef    = useRef<HTMLImageElement | null>(null)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [activeLayer, setActiveLayer] = useState<keyof PosterData>('headline')

  // Load background image
  useEffect(() => {
    if (!backgroundUrl) { setBgLoaded(false); bgImgRef.current = null; return }
    setBgLoaded(false)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { bgImgRef.current = img; setBgLoaded(true) }
    img.onerror = () => { bgImgRef.current = null; setBgLoaded(false) }
    img.src = backgroundUrl
  }, [backgroundUrl])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Background
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

    // Dark gradient overlay for text legibility
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)')
    grad.addColorStop(0.3, 'rgba(0,0,0,0.15)')
    grad.addColorStop(0.6, 'rgba(0,0,0,0.25)')
    grad.addColorStop(1, 'rgba(0,0,0,0.65)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // CTA button background
    const ctaLayer = posterData.cta
    if (ctaLayer.visible && ctaLayer.text) {
      const btH  = canvasHeight * 0.06
      const btW  = canvasWidth  * 0.55
      const btX  = canvasWidth  * ctaLayer.x - btW / 2
      const btY  = canvasHeight * ctaLayer.y - btH * 0.75
      const r    = btH * 0.35
      ctx.fillStyle = '#d4af37'
      ctx.beginPath()
      ctx.roundRect(btX, btY, btW, btH, r)
      ctx.fill()
    }

    // Draw text layers
    const scale = canvasWidth / 1080

    for (const key of LAYER_ORDER) {
      const layer = posterData[key]
      if (!layer.visible || !layer.text) continue

      const x   = canvasWidth  * layer.x
      const y   = canvasHeight * layer.y
      const fs  = layer.fontSize * scale
      const mw  = layer.maxWidth ? canvasWidth * layer.maxWidth : undefined

      ctx.save()
      ctx.fillStyle  = layer.color
      ctx.font       = `${layer.fontWeight} ${fs}px 'Helvetica Neue', Arial, sans-serif`
      ctx.textAlign  = layer.align
      ctx.textBaseline = 'middle'

      // Text shadow for legibility
      ctx.shadowColor   = 'rgba(0,0,0,0.7)'
      ctx.shadowBlur    = fs * 0.3
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = fs * 0.04

      if (mw) {
        // Word-wrap
        const words     = layer.text.split(' ')
        const lineHeight = fs * 1.2
        let line = ''
        const lines: string[] = []
        for (const word of words) {
          const test = line ? `${line} ${word}` : word
          if (ctx.measureText(test).width > mw && line) { lines.push(line); line = word }
          else line = test
        }
        if (line) lines.push(line)
        const totalH = lines.length * lineHeight
        lines.forEach((l, i) => ctx.fillText(l, x, y - totalH / 2 + i * lineHeight + lineHeight / 2))
      } else {
        ctx.fillText(layer.text, x, y)
      }

      ctx.restore()
    }
  }, [posterData, bgLoaded, canvasWidth, canvasHeight])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  function exportPoster() {
    const canvas = canvasRef.current
    if (!canvas || !onExport) return
    canvas.toBlob(blob => { if (blob) onExport(blob) }, 'image/jpeg', 0.92)
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
          <button
            onClick={exportPoster}
            className="mt-2 w-full bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            Export JPG
          </button>
        )}
        <p className="mt-1 text-xs text-gray-600 text-center">
          {canvasWidth} × {canvasHeight}px preview
        </p>
      </div>

      {/* Layer editor */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Layer selector tabs */}
        <div className="flex flex-wrap gap-1">
          {LAYER_ORDER.map(k => (
            <button
              key={k}
              onClick={() => setActiveLayer(k)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                activeLayer === k
                  ? 'bg-indigo-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              } ${COMMERCIAL_LAYERS.includes(k) ? 'ring-1 ring-yellow-700' : ''}`}
            >
              {LAYER_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Active layer editor */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{LAYER_LABELS[activeLayer]}</span>
            {COMMERCIAL_NOTE[activeLayer] && (
              <span className="text-xs text-yellow-600">{COMMERCIAL_NOTE[activeLayer]}</span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={active.visible}
                onChange={e => updateLayer(activeLayer, { visible: e.target.checked })}
                className="rounded"
              />
              Visible
            </label>
          </div>

          {/* Text */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {COMMERCIAL_LAYERS.includes(activeLayer) ? 'Text (staff input only)' : 'Text'}
            </label>
            {activeLayer === 'terms' || activeLayer === 'contact' ? (
              <textarea
                rows={2}
                value={active.text}
                onChange={e => updateLayer(activeLayer, { text: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none"
                placeholder={`Enter ${LAYER_LABELS[activeLayer].toLowerCase()}…`}
              />
            ) : (
              <input
                type="text"
                value={active.text}
                onChange={e => updateLayer(activeLayer, { text: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                placeholder={`Enter ${LAYER_LABELS[activeLayer].toLowerCase()}…`}
              />
            )}
          </div>

          {/* Position + style row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Font size (pt)</label>
              <input
                type="number"
                value={active.fontSize}
                onChange={e => updateLayer(activeLayer, { fontSize: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                min={8} max={200}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Color</label>
              <input
                type="color"
                value={active.color}
                onChange={e => updateLayer(activeLayer, { color: e.target.value })}
                className="w-full h-9 bg-gray-800 border border-gray-700 rounded px-1 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">X (0–1)</label>
              <input
                type="number"
                step="0.01" min={0} max={1}
                value={active.x}
                onChange={e => updateLayer(activeLayer, { x: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Y (0–1)</label>
              <input
                type="number"
                step="0.01" min={0} max={1}
                value={active.y}
                onChange={e => updateLayer(activeLayer, { y: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Align</label>
              <select
                value={active.align}
                onChange={e => updateLayer(activeLayer, { align: e.target.value as 'left' | 'center' | 'right' })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Weight</label>
            <select
              value={active.fontWeight}
              onChange={e => updateLayer(activeLayer, { fontWeight: e.target.value as PosterLayer['fontWeight'] })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
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
    </div>
  )
}
