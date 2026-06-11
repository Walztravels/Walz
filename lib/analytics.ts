/**
 * Google Analytics 4 — event tracking helpers
 * Uses NEXT_PUBLIC_GA_MEASUREMENT_ID (set in Vercel env)
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[]
  }
}

export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number,
) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', action, {
      event_category: category,
      event_label:    label,
      value,
    })
  }
}

/** Track a WhatsApp button click — pass the source location as `source` */
export function trackWhatsApp(source: string) {
  trackEvent('whatsapp_click', 'engagement', source)
}

/** Track a lead form submission — pass the destination/service as `destination` */
export function trackLeadForm(destination: string) {
  trackEvent('lead_form_submit', 'conversion', destination)
}

/** Track a visa eligibility check */
export function trackVisaCheck(passportIso2: string, destinationIso2: string) {
  trackEvent('visa_check', 'engagement', `${passportIso2}_to_${destinationIso2}`)
}

/** Track a client-portal sign-up completion */
export function trackSignUp() {
  trackEvent('sign_up', 'conversion', 'client_portal')
}

/** Track a package/destination page view */
export function trackPackageView(destination: string) {
  trackEvent('view_package', 'engagement', destination)
}

/** Manually fire a page-view event (e.g. after client-side route changes) */
export function trackPageView(url: string) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, {
      page_path: url,
    })
  }
}
