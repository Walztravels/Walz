'use client'

export interface JadeChatContext {
  service?: string  // 'Package' | 'Visa' | 'Flight' | 'Hotel' | 'General'
  detail?:  string  // e.g. 'Dubai Luxury Escape', 'UK Visa'
  page?:    string  // e.g. '/packages/dubai-luxury-escape'
  message?: string  // reserved for future use
}

declare global {
  interface Window {
    $chatwoot?: {
      toggle:              (state?: 'open' | 'close') => void
      setUser:             (id: string, info: Record<string, string>) => void
      setCustomAttributes: (attrs: Record<string, string>) => void
      setLabel:            (label: string) => void
      setLocale:           (locale: string) => void
      reset:               () => void
    }
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void
    }
    chatwootSettings?: Record<string, unknown>
  }
}

const LABEL_MAP: Record<string, string> = {
  Package: 'package-inquiry',
  Visa:    'visa-inquiry',
  Flight:  'flight-inquiry',
  Hotel:   'hotel-inquiry',
  General: 'general-inquiry',
}

export function openJadeChat(context: JadeChatContext = {}) {
  const { service = 'General', detail = '', page = '' } = context

  // Primary: always open the Jade widget via custom event
  window.dispatchEvent(new CustomEvent('jade:open', { detail: context }))

  // Enhancement: if Chatwoot is loaded, also set attributes there
  function tryOpenChatwoot(attempts = 0) {
    if (window.$chatwoot) {
      window.$chatwoot.setCustomAttributes({
        service_interest: detail ? `${service} — ${detail}` : service,
        source_page:      page || window.location.pathname,
        inquiry_type:     service.toLowerCase(),
      })
      window.$chatwoot.setLabel(LABEL_MAP[service] ?? 'general-inquiry')
      window.$chatwoot.toggle('open')
    } else if (attempts < 5) {
      setTimeout(() => tryOpenChatwoot(attempts + 1), 200)
    }
  }

  tryOpenChatwoot()
}
