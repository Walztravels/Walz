/** @type {import('next').NextConfig} */

const nextConfig = {
  // ── General ───────────────────────────────────────────────────────────────
  poweredByHeader: false,

  // ── Image optimisation ────────────────────────────────────────────────────
  images: {
    // Serve AVIF first (50-60 % smaller), WebP as fallback
    formats: ['image/avif', 'image/webp'],
    // Cache optimised images for 24 h on the CDN edge
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com',              pathname: '/**' },
      { protocol: 'https', hostname: 'plus.unsplash.com',                pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com',        pathname: '/**' },
      { protocol: 'https', hostname: 'www.walztravels.com',               pathname: '/**' },
      { protocol: 'https', hostname: 'walztravels.com',                   pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.walztravels.com',               pathname: '/**' },
      { protocol: 'https', hostname: 'us.chat-img.sintra.ai',            pathname: '/**' },
      // Supabase Storage — for media-managed images via the admin panel
      { protocol: 'https', hostname: 'bxacijnrgqgmyqyfgumg.supabase.co', pathname: '/storage/**' },
      // Hotelbeds activity & hotel images
      { protocol: 'https', hostname: 'photos.hotelbeds.com',             pathname: '/**' },
      { protocol: 'https', hostname: '**.hotelbeds.com',                 pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.hotelbeds.com',                pathname: '/**' },
      { protocol: 'https', hostname: '**.giata.com',                     pathname: '/**' },
    ],
  },

  // ── Redirects ─────────────────────────────────────────────────────────────
  async redirects() {
    return [
      {
        source:      '/:path*',
        has:         [{ type: 'host', value: 'walztravels.us' }],
        destination: 'https://www.walztravels.com/:path*',
        permanent:   true,
      },
      {
        source:      '/:path*',
        has:         [{ type: 'host', value: 'www.walztravels.us' }],
        destination: 'https://www.walztravels.com/:path*',
        permanent:   true,
      },
      {
        source:      '/:path*',
        has:         [{ type: 'host', value: 'walztravels.com' }],
        destination: 'https://www.walztravels.com/:path*',
        permanent:   true,
      },
    ]
  },

  // ── HTTP headers ──────────────────────────────────────────────────────────
  async headers() {
    return [
      // ── Security headers (all routes) ─────────────────────────────────────
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Strict-Transport-Security',  value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=*, microphone=*, clipboard-read=*, clipboard-write=*, hid=*, geolocation=(self), payment=(self)' },
          { key: 'X-XSS-Protection',           value: '1; mode=block' },
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "frame-src 'self' https://workspace.aircall.io https://phone.aircall.io https://*.aircall.io https://js.stripe.com https://hooks.stripe.com",
              "child-src 'self' https://workspace.aircall.io https://phone.aircall.io https://*.aircall.io",
              "connect-src 'self' https://*.walztravels.com https://api.stripe.com https://api.flutterwave.com https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.aircall.io wss://*.aircall.io",
              "media-src 'self' https:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      // ── Immutable long-term cache for hashed Next.js bundles ──────────────
      {
        source:  '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // ── 7-day cache for public static assets (logo, favicon, etc.) ─────────
      {
        source:  '/:file(.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2|woff|ttf))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
      },
      // ── Admin: permissive iframe policy for Aircall widget ───────────────
      // X-Frame-Options ALLOWALL lets the admin page embed cross-origin iframes.
      // CSP here is broader than the public site — admin is authenticated only.
      // Next.js uses last-matching-rule value for same-key headers, so this
      // overrides the SAMEORIGIN + restrictive CSP set by the global rule above.
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Permissions-Policy', value: 'microphone=*, camera=*, clipboard-read=*, clipboard-write=*, hid=*, geolocation=(self), payment=(self)' },
          {
            key:   'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "frame-src 'self' https://workspace.aircall.io https://phone.aircall.io https://*.aircall.io https://js.stripe.com https://hooks.stripe.com",
              "child-src 'self' https://workspace.aircall.io https://phone.aircall.io https://*.aircall.io",
              "connect-src 'self' https: wss: https://*.aircall.io wss://*.aircall.io",
              "media-src 'self' https:",
              "object-src 'none'",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
      // ── Digital Asset Links for TWA (Play Store) ─────────────────────────
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type',                value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control',               value: 'public, max-age=3600' },
        ],
      },
      // ── CORS: public API only — admin and cron routes excluded ────────────
      {
        source: '/api/((?!admin|cron).)*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: 'https://www.walztravels.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'pdf-parse'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
