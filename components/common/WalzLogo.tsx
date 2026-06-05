/**
 * WalzLogo — SVG recreation of the Walz Travels globe logo.
 *
 * The globe is a circle with 7 horizontal wave-stripe bands in bright blue
 * (#29ABE2) on a dark-blue base (#0B3D7A), giving it the classic globe-with-
 * latitude-lines appearance. Wave amplitude increases toward the equator so the
 * bands look naturally "wrapped" around a sphere.
 *
 * Usage
 *   <WalzLogo size={40} />                  – just the globe icon
 *   <WalzLogo size={80} variant="full" />   – globe + "THE WALZ TRAVELS" below
 */

interface WalzLogoProps {
  /** Pixel width/height of the globe itself */
  size?: number
  /** 'icon' = globe only | 'full' = globe + "THE WALZ TRAVELS" text beneath */
  variant?: 'icon' | 'full'
  className?: string
  /** Optional aria label */
  title?: string
}

export function WalzLogo({
  size = 40,
  variant = 'icon',
  className = '',
  title = 'Walz Travels',
}: WalzLogoProps) {
  // The globe occupies 0 0 100 100; the 'full' variant adds 30px for text
  const vbHeight = variant === 'full' ? 130 : 100
  const totalHeight = variant === 'full' ? Math.round(size * 1.3) : size

  // We use a fixed clipPath id — both page instances share the same circle
  // definition, which is identical, so this is safe.
  const clipId = 'walz-globe-clip'

  return (
    <svg
      width={size}
      height={totalHeight}
      viewBox={`0 0 100 ${vbHeight}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}

      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      {/* ── Globe base ── */}
      <circle cx="50" cy="50" r="48" fill="#0B3D7A" />

      {/* ── 7 wave stripes (bright blue, clipped to circle) ──────────────────
          Each stripe is drawn as a filled quadratic-bezier "ribbon".
          Control-point Y is above the stripe's Y → convex-upward arc.
          Amplitude increases toward the equator (stripe 4) and falls
          back toward the poles (stripes 1 & 7).
      ────────────────────────────────────────────────────────────────────── */}

      {/* Stripe 1 – top pole, almost flat */}
      <path
        d="M 2,5 Q 50,5 98,5 L 98,13 Q 50,12 2,13 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 2 – slight curve */}
      <path
        d="M 2,18 Q 50,15 98,18 L 98,26 Q 50,23 2,26 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 3 – medium curve */}
      <path
        d="M 2,31 Q 50,26 98,31 L 98,39 Q 50,34 2,39 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 4 – equator, strongest curve */}
      <path
        d="M 2,44 Q 50,37 98,44 L 98,52 Q 50,46 2,52 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 5 – medium curve (mirror of 3) */}
      <path
        d="M 2,57 Q 50,52 98,57 L 98,65 Q 50,61 2,65 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 6 – slight curve (mirror of 2) */}
      <path
        d="M 2,70 Q 50,67 98,70 L 98,78 Q 50,76 2,78 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* Stripe 7 – bottom pole, almost flat */}
      <path
        d="M 2,83 Q 50,82 98,83 L 98,91 Q 50,91 2,91 Z"
        fill="#29ABE2"
        clipPath={`url(#${clipId})`}
      />

      {/* ── Outer border ── */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="2" />

      {/* ── Full-variant: "THE WALZ TRAVELS" text ── */}
      {variant === 'full' && (
        <text
          x="50"
          y="120"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="9.5"
          letterSpacing="2.5"
          fill="currentColor"
          fontWeight="600"
        >
          THE WALZ TRAVELS
        </text>
      )}
    </svg>
  )
}
