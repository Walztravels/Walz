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
      // ── Immutable long-term cache for hashed Next.js bundles ─────────────
      {
        source:  '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // ── 7-day cache for public static assets (logo, favicon, etc.) ────────
      {
        source:  '/:file(.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2|woff|ttf))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
      },
      // ── API CORS ──────────────────────────────────────────────────────────
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
    ]
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'pdf-parse'],
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig
