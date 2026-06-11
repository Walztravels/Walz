import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Tours ──────────────────────────────────────────────────────────────────
  await prisma.tour.upsert({
    where: { slug: 'niagara-falls-vip' },
    update: {},
    create: {
      name: 'Niagara Falls VIP Private Tour',
      slug: 'niagara-falls-vip',
      location: 'Niagara Falls, Ontario, Canada',
      duration: '8 hours',
      price: 450,
      currency: 'CAD',
      description: 'Private guide, luxury vehicle, and exclusive viewpoints — see the falls without the crowds. From Toronto, full day.',
      active: true,
      order: 1
    }
  })

  await prisma.tour.upsert({
    where: { slug: 'london-private-day-tour' },
    update: {},
    create: {
      name: 'London Private Day Tour',
      slug: 'london-private-day-tour',
      location: 'London, United Kingdom',
      duration: '8 hours',
      price: 295,
      currency: 'GBP',
      description: 'Buckingham Palace, the Tower of London, and a Thames cruise — a full day of London highlights with a private guide.',
      active: true,
      order: 2
    }
  })

  await prisma.tour.upsert({
    where: { slug: 'dublin-private-day-tour' },
    update: {},
    create: {
      name: 'Dublin Private Day Tour',
      slug: 'dublin-private-day-tour',
      location: 'Dublin, Ireland',
      duration: '8 hours',
      price: 275,
      currency: 'EUR',
      description: 'Trinity College, the Guinness Storehouse, and Dublin\'s best pubs — explored at your pace with a local expert guide.',
      active: true,
      order: 3
    }
  })

  await prisma.tour.upsert({
    where: { slug: 'dubai-city-desert-safari' },
    update: {},
    create: {
      name: 'Dubai City and Desert Safari',
      slug: 'dubai-city-desert-safari',
      location: 'Dubai, UAE',
      duration: '10 hours',
      price: 200,
      currency: 'USD',
      description: 'Glide past the Marina skyline on a private yacht with chilled drinks and unforgettable sunset views over the Gulf.',
      active: true,
      order: 4
    }
  })

  await prisma.tour.upsert({
    where: { slug: 'paris-full-day-tour' },
    update: {},
    create: {
      name: 'Paris Full Day Private Tour',
      slug: 'paris-full-day-tour',
      location: 'Paris, France',
      duration: '8 hours',
      price: 250,
      currency: 'EUR',
      description: 'Eiffel Tower, Louvre Museum, Notre Dame and a Seine river cruise — the iconic Paris experience with a private guide.',
      active: true,
      order: 5
    }
  })

  console.log('Tours seeded')

  // ── Packages ───────────────────────────────────────────────────────────────
  const packages = [
    { slug: 'london', destinationName: 'London, United Kingdom', destinationIso2: 'GB', tagline: 'The Classic UK Experience', heroImageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=2000&q=85', averageDays: 7, startingPriceUsd: 750, bestTimeToVisit: 'April to October', visaRequired: true, visaIso2: 'GB', displayOrder: 1 },
    { slug: 'dubai', destinationName: 'Dubai, UAE', destinationIso2: 'AE', tagline: 'Luxury in the City of Gold', heroImageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=2000&q=85', averageDays: 5, startingPriceUsd: 900, bestTimeToVisit: 'November to March', visaRequired: true, visaIso2: 'AE', displayOrder: 2 },
    { slug: 'toronto', destinationName: 'Toronto and Niagara Falls, Canada', destinationIso2: 'CA', tagline: 'Canada at Its Finest', heroImageUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=2000&q=85', averageDays: 7, startingPriceUsd: 1200, bestTimeToVisit: 'May to October', visaRequired: true, visaIso2: 'CA', displayOrder: 3 },
    { slug: 'paris', destinationName: 'Paris, France', destinationIso2: 'FR', tagline: 'The City of Light', heroImageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=2000&q=85', averageDays: 5, startingPriceUsd: 850, bestTimeToVisit: 'April to June', visaRequired: true, visaIso2: 'FR', displayOrder: 4 },
    { slug: 'new-york', destinationName: 'New York City, USA', destinationIso2: 'US', tagline: 'The City That Never Sleeps', heroImageUrl: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=2000&q=85', averageDays: 7, startingPriceUsd: 1400, bestTimeToVisit: 'September to November', visaRequired: true, visaIso2: 'US', displayOrder: 5 },
    { slug: 'accra', destinationName: 'Accra, Ghana', destinationIso2: 'GH', tagline: 'West Africa Homecoming', heroImageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=2000&q=85', averageDays: 7, startingPriceUsd: 600, bestTimeToVisit: 'November to March', visaRequired: false, displayOrder: 6 },
    { slug: 'amsterdam', destinationName: 'Amsterdam, Netherlands', destinationIso2: 'NL', tagline: 'The Venice of the North', heroImageUrl: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=2000&q=85', averageDays: 4, startingPriceUsd: 800, bestTimeToVisit: 'April to September', visaRequired: true, visaIso2: 'FR', displayOrder: 7 }
  ]

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { slug: pkg.slug },
      update: {},
      create: { ...pkg, showOnWebsite: true }
    })
  }

  console.log('Packages seeded')

  // ── Country Portals ────────────────────────────────────────────────────────
  const portals = [
    { destinationIso2: 'GB', countryName: 'United Kingdom', flagEmoji: '🇬🇧', region: 'Europe', walzFeeUsd: 188, walzFeeNgn: 300000, govtFeeAmount: 115, govtFeeCurrency: 'GBP', processingDaysMin: 15, processingDaysMax: 21, maxStayDays: 180, singleOrMultiple: 'multiple', requiredDocuments: ['Valid passport 6 months','2 passport photographs','6 month bank statement','Employment letter','Approved leave letter','Travel itinerary','Hotel booking','Return flight'], jadeTips: 'Apply at least 8 weeks before travel. Bank statement minimum NGN 3M.', commonRefusals: ['Insufficient bank balance','Lump sum deposit','Missing leave dates'], advisoryLevel: 1, portalUrl: 'https://www.gov.uk/apply-uk-visa' },
    { destinationIso2: 'CA', countryName: 'Canada', flagEmoji: '🇨🇦', region: 'Americas', walzFeeUsd: 281, walzFeeNgn: 450000, govtFeeAmount: 185, govtFeeCurrency: 'CAD', processingDaysMin: 45, processingDaysMax: 84, maxStayDays: 180, singleOrMultiple: 'multiple', requiredDocuments: ['Valid passport 6 months','Bank statement NGN 6.5M','Employment letter','Property documents','Biometrics VFS'], jadeTips: 'Strong ties to Nigeria essential. Previous US or UK visa helps.', commonRefusals: ['Insufficient funds','No property shown','Incomplete biometrics'], advisoryLevel: 1, portalUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship' },
    { destinationIso2: 'AE', countryName: 'United Arab Emirates', flagEmoji: '🇦🇪', region: 'Middle East', walzFeeUsd: 470, walzFeeNgn: 750000, govtFeeAmount: 0, govtFeeCurrency: 'USD', processingDaysMin: 3, processingDaysMax: 5, maxStayDays: 30, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Passport photograph','Bank statement','Employment letter','Return flight','Hotel booking'], jadeTips: 'Fastest visa 3 to 5 days. Government fee included.', commonRefusals: ['Passport under 6 months','Missing hotel booking'], advisoryLevel: 1, portalUrl: 'https://smartservices.icp.gov.ae' },
    { destinationIso2: 'FR', countryName: 'Schengen Europe', flagEmoji: '🇪🇺', region: 'Europe', walzFeeUsd: 231, walzFeeNgn: 370000, govtFeeAmount: 80, govtFeeCurrency: 'EUR', processingDaysMin: 15, processingDaysMax: 21, maxStayDays: 90, singleOrMultiple: 'multiple', requiredDocuments: ['Passport 3 months beyond return','Travel insurance EUR 30000','Bank statement','Employment letter','Hotel bookings','Return flight','Cover letter'], jadeTips: 'Travel insurance mandatory for Schengen. Apply through embassy of country with most nights.', commonRefusals: ['Insufficient insurance','No hotel bookings','Missing cover letter'], advisoryLevel: 1, portalUrl: 'https://france-visas.gouv.fr' },
    { destinationIso2: 'US', countryName: 'United States', flagEmoji: '🇺🇸', region: 'Americas', walzFeeUsd: 344, walzFeeNgn: 550000, govtFeeAmount: 185, govtFeeCurrency: 'USD', processingDaysMin: 60, processingDaysMax: 120, maxStayDays: 180, singleOrMultiple: 'multiple', requiredDocuments: ['Valid passport 6 months','DS-160 form','Bank statement','Employment letter','Ties to Nigeria evidence','Interview preparation'], jadeTips: 'Interview is most critical. Demonstrate strong ties to Nigeria clearly.', commonRefusals: ['Cannot show ties','Inconsistent interview','Insufficient funds'], advisoryLevel: 1, portalUrl: 'https://ceac.state.gov' },
    { destinationIso2: 'VN', countryName: 'Vietnam', flagEmoji: '🇻🇳', region: 'Asia', walzFeeUsd: 50, walzFeeNgn: 80000, govtFeeAmount: 25, govtFeeCurrency: 'USD', processingDaysMin: 3, processingDaysMax: 3, maxStayDays: 90, singleOrMultiple: 'multiple', requiredDocuments: ['Valid passport 6 months','Photograph','Itinerary'], jadeTips: 'Simple eVisa takes 3 days.', commonRefusals: ['Passport too close to expiry'], advisoryLevel: 1, portalUrl: 'https://evisa.gov.vn' },
    { destinationIso2: 'TR', countryName: 'Turkey', flagEmoji: '🇹🇷', region: 'Europe', walzFeeUsd: 75, walzFeeNgn: 120000, govtFeeAmount: 50, govtFeeCurrency: 'USD', processingDaysMin: 1, processingDaysMax: 1, maxStayDays: 90, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Photograph'], jadeTips: 'Instant eVisa approved within minutes.', commonRefusals: ['Passport not valid 6 months'], advisoryLevel: 2, portalUrl: 'https://evisa.gov.tr' },
    { destinationIso2: 'KE', countryName: 'Kenya', flagEmoji: '🇰🇪', region: 'Africa', walzFeeUsd: 50, walzFeeNgn: 80000, govtFeeAmount: 34, govtFeeCurrency: 'USD', processingDaysMin: 1, processingDaysMax: 3, maxStayDays: 90, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Yellow fever certificate','Photograph','Return flight'], jadeTips: 'Yellow fever certificate mandatory from Nigeria.', commonRefusals: ['No yellow fever certificate'], advisoryLevel: 2, portalUrl: 'https://etakenya.go.ke' },
    { destinationIso2: 'EG', countryName: 'Egypt', flagEmoji: '🇪🇬', region: 'Africa', walzFeeUsd: 50, walzFeeNgn: 80000, govtFeeAmount: 25, govtFeeCurrency: 'USD', processingDaysMin: 3, processingDaysMax: 5, maxStayDays: 30, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Photograph','Hotel booking','Return flight'], jadeTips: 'eVisa takes 3 to 5 days.', commonRefusals: ['Incomplete hotel booking'], advisoryLevel: 2, portalUrl: 'https://visa2egypt.gov.eg' },
    { destinationIso2: 'AU', countryName: 'Australia', flagEmoji: '🇦🇺', region: 'Oceania', walzFeeUsd: 300, walzFeeNgn: 480000, govtFeeAmount: 145, govtFeeCurrency: 'USD', processingDaysMin: 30, processingDaysMax: 60, maxStayDays: 90, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Bank statement','Employment letter','Travel itinerary'], jadeTips: 'Processing 30 to 60 days. Apply well in advance.', commonRefusals: ['Insufficient funds','Incomplete itinerary'], advisoryLevel: 1, portalUrl: 'https://immi.homeaffairs.gov.au' },
    { destinationIso2: 'JP', countryName: 'Japan', flagEmoji: '🇯🇵', region: 'Asia', walzFeeUsd: 200, walzFeeNgn: 320000, govtFeeAmount: 3000, govtFeeCurrency: 'JPY', processingDaysMin: 5, processingDaysMax: 10, maxStayDays: 90, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Bank statement','Employment letter','Detailed itinerary','Hotel bookings'], jadeTips: 'Japan requires very detailed day by day itinerary.', commonRefusals: ['Vague itinerary','Insufficient balance'], advisoryLevel: 1, portalUrl: 'https://www.mofa.go.jp' },
    { destinationIso2: 'ZA', countryName: 'South Africa', flagEmoji: '🇿🇦', region: 'Africa', walzFeeUsd: 150, walzFeeNgn: 240000, govtFeeAmount: 30, govtFeeCurrency: 'USD', processingDaysMin: 7, processingDaysMax: 14, maxStayDays: 30, singleOrMultiple: 'single', requiredDocuments: ['Valid passport 6 months','Yellow fever certificate','Bank statement','Employment letter','Return flight'], jadeTips: 'Yellow fever certificate required from Nigeria.', commonRefusals: ['No yellow fever certificate'], advisoryLevel: 2, portalUrl: 'https://www.vfsglobal.com/southafrica' }
  ]

  for (const portal of portals) {
    await prisma.countryPortal.upsert({
      where: { destinationIso2: portal.destinationIso2 },
      update: {},
      create: portal
    })
  }

  console.log('Country portals seeded')

  // ── Visa Rules ─────────────────────────────────────────────────────────────
  const visaRules = [
    { passportIso2: 'NG', destinationIso2: 'GB', ruleType: 'visa_required', maxDays: 180, notes: 'Standard Visitor Visa' },
    { passportIso2: 'NG', destinationIso2: 'CA', ruleType: 'visa_required', maxDays: 180, notes: 'Temporary Resident Visa' },
    { passportIso2: 'NG', destinationIso2: 'AE', ruleType: 'visa_required', maxDays: 30, notes: 'Tourist Visa required' },
    { passportIso2: 'NG', destinationIso2: 'FR', ruleType: 'visa_required', maxDays: 90, notes: 'Schengen C Visa' },
    { passportIso2: 'NG', destinationIso2: 'US', ruleType: 'visa_required', maxDays: 180, notes: 'B1/B2 Visitor Visa' },
    { passportIso2: 'NG', destinationIso2: 'VN', ruleType: 'evisa', maxDays: 90, notes: 'eVisa online' },
    { passportIso2: 'NG', destinationIso2: 'TR', ruleType: 'evisa', maxDays: 90, notes: 'Instant eVisa' },
    { passportIso2: 'NG', destinationIso2: 'KE', ruleType: 'eta', maxDays: 90, notes: 'eTA required' },
    { passportIso2: 'NG', destinationIso2: 'EG', ruleType: 'evisa', maxDays: 30, notes: 'eVisa online' },
    { passportIso2: 'NG', destinationIso2: 'AU', ruleType: 'visa_required', maxDays: 90, notes: 'Visitor Visa' },
    { passportIso2: 'NG', destinationIso2: 'JP', ruleType: 'visa_required', maxDays: 90, notes: 'Tourist Visa' },
    { passportIso2: 'NG', destinationIso2: 'ZA', ruleType: 'visa_required', maxDays: 30, notes: 'Visitor Visa' },
    { passportIso2: 'NG', destinationIso2: 'GH', ruleType: 'visa_on_arrival', maxDays: 90, notes: 'ECOWAS' },
    { passportIso2: 'NG', destinationIso2: 'MV', ruleType: 'visa_free', maxDays: 30, notes: 'Visa free' },
    { passportIso2: 'NG', destinationIso2: 'TZ', ruleType: 'evisa', maxDays: 90, notes: 'eVisa available' },
    { passportIso2: 'GH', destinationIso2: 'GB', ruleType: 'visa_required', maxDays: 180, notes: 'Visitor Visa' },
    { passportIso2: 'GH', destinationIso2: 'CA', ruleType: 'visa_required', maxDays: 180, notes: 'Temporary Resident Visa' },
    { passportIso2: 'GH', destinationIso2: 'AE', ruleType: 'visa_required', maxDays: 30, notes: 'Tourist Visa' },
    { passportIso2: 'GH', destinationIso2: 'FR', ruleType: 'visa_required', maxDays: 90, notes: 'Schengen C Visa' },
    { passportIso2: 'GH', destinationIso2: 'US', ruleType: 'visa_required', maxDays: 180, notes: 'B1/B2 Visa' },
    { passportIso2: 'GH', destinationIso2: 'VN', ruleType: 'evisa', maxDays: 90, notes: 'eVisa' },
    { passportIso2: 'GH', destinationIso2: 'TR', ruleType: 'evisa', maxDays: 90, notes: 'eVisa' },
    { passportIso2: 'GH', destinationIso2: 'KE', ruleType: 'visa_free', maxDays: 90, notes: 'Visa free' },
    { passportIso2: 'GH', destinationIso2: 'NG', ruleType: 'visa_free', maxDays: 90, notes: 'ECOWAS' },
    { passportIso2: 'GB', destinationIso2: 'NG', ruleType: 'visa_required', maxDays: 30, notes: 'Nigerian visa required' },
    { passportIso2: 'GB', destinationIso2: 'US', ruleType: 'eta', maxDays: 90, notes: 'ESTA required' },
    { passportIso2: 'GB', destinationIso2: 'CA', ruleType: 'eta', maxDays: 180, notes: 'eTA required' },
    { passportIso2: 'GB', destinationIso2: 'AE', ruleType: 'visa_on_arrival', maxDays: 30, notes: 'Free on arrival' },
    { passportIso2: 'GB', destinationIso2: 'FR', ruleType: 'visa_free', maxDays: 90, notes: 'Free movement' },
    { passportIso2: 'CA', destinationIso2: 'NG', ruleType: 'visa_required', maxDays: 30, notes: 'Nigerian visa required' },
    { passportIso2: 'CA', destinationIso2: 'US', ruleType: 'visa_free', maxDays: 180, notes: 'No visa required' },
    { passportIso2: 'CA', destinationIso2: 'GB', ruleType: 'eta', maxDays: 180, notes: 'ETA required' },
    { passportIso2: 'CA', destinationIso2: 'AE', ruleType: 'visa_on_arrival', maxDays: 30, notes: 'Visa on arrival' },
    { passportIso2: 'CA', destinationIso2: 'FR', ruleType: 'visa_free', maxDays: 90, notes: 'Visa free Schengen' }
  ]

  for (const rule of visaRules) {
    await prisma.visaRule.upsert({
      where: {
        passportIso2_destinationIso2: {
          passportIso2: rule.passportIso2,
          destinationIso2: rule.destinationIso2
        }
      },
      update: {},
      create: rule
    })
  }

  console.log('Visa rules seeded')

  // ── Site Settings ──────────────────────────────────────────────────────────
  const settings = [
    { key: 'whatsapp_uk',       value: '+447398753797', label: 'WhatsApp UK' },
    { key: 'whatsapp_us',       value: '+15557107823',  label: 'WhatsApp US' },
    { key: 'call_jade',         value: '+19843880110',  label: 'Call Jade' },
    { key: 'email',             value: 'contact@walztravels.com', label: 'Email' },
    { key: 'visa_email',        value: 'visa@walztravels.com',    label: 'Visa Email' },
    { key: 'visa_fee_uk',       value: '188', label: 'UK Visa Fee USD' },
    { key: 'visa_fee_canada',   value: '281', label: 'Canada Visa Fee USD' },
    { key: 'visa_fee_uae',      value: '470', label: 'UAE Visa Fee USD' },
    { key: 'visa_fee_schengen', value: '231', label: 'Schengen Fee USD' },
    { key: 'visa_fee_usa',      value: '344', label: 'USA Visa Fee USD' }
  ]

  for (const setting of settings) {
    await prisma.siteSetting.upsert({
      where:  { key: setting.key },
      update: {},
      create: setting
    })
  }

  console.log('Site settings seeded')

  console.log('All seeding complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
