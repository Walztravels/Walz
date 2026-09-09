/**
 * Client-safe WhatsApp link builder.
 *
 * Lives in its own module so client components (Navbar, Footer, CTAs) can
 * import it WITHOUT pulling in lib/site-settings — that module imports
 * Prisma and next/cache, and importing it from a 'use client' file drags
 * server code (and Next's ~100 KB crypto polyfill) into every page bundle.
 */
export function whatsappLink(number: string, message = '') {
  const clean = number.replace(/\D/g, '')
  const msg = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${clean}${msg}`
}
