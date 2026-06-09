/** @type {import('next').NextConfig} */

const nextConfig = {
  async redirects() {
    return [
      // Redirect walztravels.us → www.walztravels.com (permanent 308)
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
      // Non-www → www (walztravels.com → www.walztravels.com)
      {
        source:      '/:path*',
        has:         [{ type: 'host', value: 'walztravels.com' }],
        destination: 'https://www.walztravels.com/:path*',
        permanent:   true,
      },
    ]
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
    ]
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
}

export default nextConfig
