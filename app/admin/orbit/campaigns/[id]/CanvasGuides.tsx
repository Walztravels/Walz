'use client'

import type { TemplateSafeZones } from '@/lib/orbit/composer/safe-zones'

interface Props {
  displayWidth:  number
  displayHeight: number
  safeZones?:    TemplateSafeZones
}

/**
 * SVG overlay that draws canvas guides on top of the compositor preview.
 * Shows: safe margins, rule of thirds, centre lines, footer boundary.
 * Toggled by controls.showGuides.
 */
export function CanvasGuides({ displayWidth: W, displayHeight: H, safeZones }: Props) {
  const margin = (safeZones?.margin ?? 0.04)
  const mx     = W * margin
  const my     = H * margin

  // Rule of thirds
  const col1 = W / 3
  const col2 = (2 * W) / 3
  const row1 = H / 3
  const row2 = (2 * H) / 3

  // Footer boundary
  const footerY = safeZones ? H * safeZones.footerZone.y : H * 0.90

  // Text zone
  const tz  = safeZones?.textZone
  const tzX = tz ? W * tz.x       : null
  const tzY = tz ? H * tz.y       : null
  const tzW = tz ? W * tz.width   : null
  const tzH = tz ? H * tz.height  : null

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    >
      {/* Safe margins */}
      <rect
        x={mx} y={my} width={W - mx * 2} height={H - my * 2}
        fill="none" stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="4 4"
      />

      {/* Rule of thirds — vertical */}
      <line x1={col1} y1={0} x2={col1} y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <line x1={col2} y1={0} x2={col2} y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

      {/* Rule of thirds — horizontal */}
      <line x1={0} y1={row1} x2={W} y2={row1} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <line x1={0} y1={row2} x2={W} y2={row2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

      {/* Centre lines */}
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(99,102,241,0.2)" strokeWidth={1} />
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(99,102,241,0.2)" strokeWidth={1} />

      {/* Footer boundary */}
      <line x1={0} y1={footerY} x2={W} y2={footerY} stroke="rgba(212,175,55,0.45)" strokeWidth={1} strokeDasharray="6 3" />
      <text x={4} y={footerY - 4} fontSize={8} fill="rgba(212,175,55,0.7)">footer</text>

      {/* Text zone highlight */}
      {tzX !== null && tzY !== null && tzW !== null && tzH !== null && (
        <rect
          x={tzX} y={tzY} width={tzW} height={tzH}
          fill="rgba(99,102,241,0.06)"
          stroke="rgba(99,102,241,0.25)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  )
}
