'use client'

import { useEffect, useRef } from 'react'

interface TrustBoxProps {
  variant?: 'micro' | 'horizontal' | 'collector'
  theme?: 'light' | 'dark'
  className?: string
}

// templateId — these are standard Trustpilot widget IDs, not secret
const WIDGETS = {
  micro: {
    templateId: '5419b637fa0340045cd0c936',
    height: '24px',
    width: '220px',
  },
  horizontal: {
    templateId: '5406e65db0d04a09e042d5fc',
    height: '28px',
    width: '100%',
  },
  collector: {
    templateId: '56278e9abfbbba0bdcd568bc',
    height: '52px',
    width: '100%',
  },
}

const BUSINESS_UNIT_ID = '6a4088e5e5c85d3654623f83'
const TRUSTPILOT_URL   = 'https://www.trustpilot.com/review/walztravels.com'
const TOKEN            = '6a5719d3-63a0-4d14-a0c0-9c809353b78f'

export default function TrustBox({
  variant = 'collector',
  theme = 'light',
  className = '',
}: TrustBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const widget = WIDGETS[variant]

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Trustpilot) {
      ;(window as any).Trustpilot.loadFromElement(ref.current, true)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-GB"
      data-template-id={widget.templateId}
      data-businessunit-id={BUSINESS_UNIT_ID}
      data-style-height={widget.height}
      data-style-width={widget.width}
      data-theme={theme}
      data-token={TOKEN}
    >
      <a href={TRUSTPILOT_URL} target="_blank" rel="noopener noreferrer">
        Trustpilot
      </a>
    </div>
  )
}
