import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

/**
 * POST /api/admin/media/setup
 * Creates the site_media table and seeds it with default image records.
 * Super-admin only. Idempotent — safe to run multiple times.
 */
export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperAdmin = (session.staffRole ?? '') === 'super_admin'
  if (!isSuperAdmin) {
    const staff = await prisma.staff.findUnique({ where: { email: session.email }, select: { role: true } })
    if (staff?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
    }
  }

  try {
    // ── 1. Create table ────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS site_media (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        media_key   text        UNIQUE NOT NULL,
        label       text        NOT NULL,
        page        text        NOT NULL,
        section     text        NOT NULL,
        media_type  text        NOT NULL,
        current_url text,
        original_url text,
        file_name   text,
        file_size   int,
        width       int,
        height      int,
        alt_text    text,
        updated_at  timestamptz DEFAULT now(),
        updated_by  text
      )
    `)

    // ── 2. Seed default records (ON CONFLICT DO NOTHING = idempotent) ──────────
    await prisma.$executeRawUnsafe(`
      INSERT INTO site_media
        (media_key, label, page, section, media_type, current_url, original_url, alt_text)
      VALUES
        -- LOGO AND BRAND
        ('logo_main',   'Main Logo',         'all',       'navbar',        'logo',  '/walz-logo.png',    '/walz-logo.png',    'Walz Travels Logo'),
        ('logo_white',  'White Logo',         'all',       'navbar',        'logo',  '/walz-logo-white.png', '/walz-logo-white.png', 'Walz Travels White Logo'),
        ('favicon',     'Favicon',            'all',       'browser',       'icon',  '/favicon.ico',      '/favicon.ico',      'Walz Travels Favicon'),

        -- HOMEPAGE
        ('home_hero_bg',    'Homepage Hero Background', 'homepage', 'hero',         'image', 'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=2000&q=85', 'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=2000&q=85', 'Aerial travel photography'),
        ('home_jade_avatar','Jade AI Avatar',           'homepage', 'jade section', 'image', '/jade-avatar.jpg', '/jade-avatar.jpg', 'Jade AI Travel Advisor'),

        -- ABOUT PAGE
        ('about_hero_bg', 'About Page Hero', 'about', 'hero', 'image', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1920&q=80', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1920&q=80', 'Global travel destinations'),

        -- TOURS
        ('tour_niagara_1', 'Niagara Falls Photo 1', 'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800', 'Niagara Falls aerial view'),
        ('tour_niagara_2', 'Niagara Falls Photo 2', 'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', 'Niagara Falls close up'),
        ('tour_london_1',  'London Tour Photo 1',   'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', 'London cityscape'),
        ('tour_dublin_1',  'Dublin Tour Photo 1',   'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1549918864-48ac978761a4?w=800', 'https://images.unsplash.com/photo-1549918864-48ac978761a4?w=800', 'Dublin city centre'),
        ('tour_dubai_1',   'Dubai Tour Photo 1',    'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800', 'Dubai skyline'),
        ('tour_paris_1',   'Paris Tour Photo 1',    'tours', 'tour card', 'image', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', 'Paris Eiffel Tower'),
        ('tours_hero_bg',  'Tours Page Hero',        'tours', 'hero',      'image', 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1800&q=80', 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1800&q=80', 'Travel destinations'),

        -- PACKAGES
        ('pkg_london_hero',    'London Package Hero',    'packages', 'london',    'image', 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=2000',    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=2000',    'London United Kingdom'),
        ('pkg_dubai_hero',     'Dubai Package Hero',     'packages', 'dubai',     'image', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=2000',    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=2000',    'Dubai UAE'),
        ('pkg_toronto_hero',   'Toronto Package Hero',   'packages', 'toronto',   'image', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=2000',    'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=2000',    'Toronto Canada Niagara'),
        ('pkg_paris_hero',     'Paris Package Hero',     'packages', 'paris',     'image', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=2000',    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=2000',    'Paris France'),
        ('pkg_newyork_hero',   'New York Package Hero',  'packages', 'new-york',  'image', 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=2000',    'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=2000',    'New York City USA'),
        ('pkg_accra_hero',     'Accra Package Hero',     'packages', 'accra',     'image', 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=2000',    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=2000',    'Accra Ghana'),
        ('pkg_amsterdam_hero', 'Amsterdam Package Hero', 'packages', 'amsterdam', 'image', 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=2000',    'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=2000',    'Amsterdam Netherlands'),

        -- VISA PAGE
        ('visa_hero_bg', 'Visa Page Hero', 'visa', 'hero', 'image', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=80', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1800&q=80', 'Travel passport and destinations'),

        -- INSURANCE PAGE
        ('insurance_hero_bg', 'Insurance Hero', 'insurance', 'hero', 'image', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=2000', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=2000', 'Airplane above clouds'),

        -- TRANSFERS PAGE
        ('transfers_hero_bg', 'Transfers Hero', 'transfers', 'hero', 'image', 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=2000', 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=2000', 'Luxury airport transfer vehicle'),

        -- ESIM PAGE
        ('esim_hero_bg', 'eSIM Page Hero', 'esim', 'hero', 'image', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=2000', 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=2000', 'Digital connectivity globe'),

        -- HELP PAGE
        ('help_hero_bg', 'Help Centre Hero', 'help', 'hero', 'image', 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=2000', 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=2000', 'Customer support'),

        -- BLOG
        ('blog_default_thumb', 'Blog Default Thumbnail', 'blog', 'article cards', 'image', 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800', 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800', 'Travel blog default image')

      ON CONFLICT (media_key) DO NOTHING
    `)

    return NextResponse.json({ success: true, message: 'site_media table created and seeded.' })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[media/setup] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
