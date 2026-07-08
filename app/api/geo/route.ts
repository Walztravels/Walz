import { NextRequest, NextResponse } from 'next/server'

// Country ISO2 → preferred currency
const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN', // Nigeria
  GH: 'GHS', // Ghana
  GB: 'GBP', // United Kingdom
  CA: 'CAD', // Canada
  US: 'USD', // United States
  AE: 'AED', // UAE
  AU: 'AUD', // Australia
  ZA: 'ZAR', // South Africa
  KE: 'KES', // Kenya
  DE: 'EUR', // Germany
  FR: 'EUR', // France
  NL: 'EUR', // Netherlands
  IT: 'EUR', // Italy
  ES: 'EUR', // Spain
  IE: 'EUR', // Ireland
  BE: 'EUR', // Belgium
  AT: 'EUR', // Austria
  PT: 'EUR', // Portugal
  IN: 'INR', // India
  SG: 'SGD', // Singapore
  NZ: 'NZD', // New Zealand
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel injects x-vercel-ip-country on every request — free, no API needed
  const country = req.headers.get('x-vercel-ip-country') ?? ''
  const currency = COUNTRY_CURRENCY[country] ?? 'GBP'

  return NextResponse.json({ country, currency }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
