import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const visaCountries = [
  {
    country: 'United Arab Emirates',
    code: 'uae',
    visaTypes: [
      { type: 'Tourist Visa (30 days)', fee: 85, processingTime: '3-5 business days' },
      { type: 'Tourist Visa (90 days)', fee: 165, processingTime: '5-7 business days' },
      { type: 'Business Visa', fee: 145, processingTime: '5-7 business days' },
    ],
    requirements: [
      'Valid passport (6+ months validity)',
      'Return flight ticket',
      'Hotel booking confirmation',
      'Bank statement (last 3 months)',
      'Passport-size photographs (white background)',
      'Travel insurance',
    ],
    notes: 'British passport holders can get a free visa on arrival for 30 days.',
  },
  {
    country: 'United States of America',
    code: 'usa',
    visaTypes: [
      { type: 'B1/B2 Tourist/Business Visa', fee: 185, processingTime: '15-30 business days' },
      { type: 'ESTA (Visa Waiver)', fee: 21, processingTime: '72 hours' },
    ],
    requirements: [
      'Valid passport (6+ months validity)',
      'DS-160 application form',
      'US visa photograph',
      'Bank statements (last 6 months)',
      'Proof of ties to home country',
      'Interview at US Embassy',
      'Travel itinerary',
    ],
    notes: 'UK citizens may qualify for ESTA. Check eligibility before applying for a full visa.',
  },
  {
    country: 'Canada',
    code: 'canada',
    visaTypes: [
      { type: 'Visitor Visa (TRV)', fee: 100, processingTime: '10-20 business days' },
      { type: 'eTA (Electronic Travel Authorization)', fee: 7, processingTime: '72 hours' },
    ],
    requirements: [
      'Valid passport',
      'Completed IMM 5257 application',
      'Photographs (35mm x 45mm)',
      'Proof of financial support',
      'Ties to home country',
      'Travel itinerary',
      'Letter of invitation (if applicable)',
    ],
    notes: 'Most British passport holders only need an eTA for air travel to Canada.',
  },
  {
    country: 'Schengen Area',
    code: 'schengen',
    visaTypes: [
      { type: 'Short-Stay Visa (Type C)', fee: 90, processingTime: '10-15 business days' },
      { type: 'National Visa (Type D)', fee: 90, processingTime: '15-30 business days' },
    ],
    requirements: [
      'Valid passport (3+ months beyond travel dates)',
      'Completed Schengen visa application form',
      'Passport-size photographs',
      'Travel insurance (min €30,000 coverage)',
      'Flight reservations',
      'Hotel bookings or accommodation proof',
      'Bank statements (last 3 months)',
      'Employment letter/payslips',
    ],
    notes: 'Covers 27 European countries. Apply to the embassy of your main destination country.',
  },
  {
    country: 'Australia',
    code: 'australia',
    visaTypes: [
      { type: 'Visitor Visa (subclass 600)', fee: 145, processingTime: '20-30 business days' },
      { type: 'Electronic Travel Authority (subclass 601)', fee: 20, processingTime: '24-72 hours' },
    ],
    requirements: [
      'Valid passport',
      'Completed online application',
      'Bank statements',
      'Employment evidence',
      'Travel itinerary',
      'Health insurance',
      'Character documents (if required)',
    ],
    notes: 'British passport holders can apply online for the ETA/eVisitor visa.',
  },
  {
    country: 'China',
    code: 'china',
    visaTypes: [
      { type: 'Tourist Visa (L)', fee: 151, processingTime: '4-5 business days' },
      { type: 'Business Visa (M)', fee: 151, processingTime: '4-5 business days' },
      { type: 'Transit Visa (G)', fee: 151, processingTime: '4-5 business days' },
    ],
    requirements: [
      'Valid passport (6+ months validity)',
      'Completed DS-160 China visa application',
      'Passport-size photograph',
      'Round-trip flight tickets',
      'Hotel booking confirmation',
      'Bank statement',
      'Invitation letter (for business)',
    ],
    notes: 'China has introduced visa-free entry for UK passport holders for stays up to 15 days.',
  },
]

const tourData = [
  {
    name: 'Dublin Private Day Tour',
    slug: 'dublin-private-day-tour',
    description: 'Explore the vibrant Irish capital with a private guide. Visit Trinity College, the Guinness Storehouse, St. Patrick\'s Cathedral, and the lively Temple Bar district. Includes traditional Irish lunch.',
    fullDescription: 'Immerse yourself in Dublin\'s rich history, culture, and craic on this fully private day tour. Your expert guide will navigate you through centuries of Irish history, from the Book of Kells at Trinity College to the story of Guinness at the Storehouse. Wander cobblestone streets, hear tales of the Easter Rising, and discover hidden gems that most tourists miss. End the day with a traditional Irish session in a local pub.',
    duration: 'Full Day (8 hours)',
    groupSize: '1-8 people',
    startPrice: 295,
    currency: 'GBP',
    pickupLocation: 'Dublin City Centre Hotel',
    highlights: [
      'Trinity College and Book of Kells',
      'Guinness Storehouse visit',
      'St. Patrick\'s Cathedral',
      'Temple Bar district',
      'Georgian Dublin squares',
      'Traditional Irish lunch included',
      'Local pub experience',
    ],
    itinerary: [
      { time: '09:00', activity: 'Hotel pickup and orientation' },
      { time: '09:30', activity: 'Trinity College & Book of Kells' },
      { time: '11:00', activity: 'Georgian Dublin & Merrion Square' },
      { time: '12:30', activity: 'Traditional Irish lunch' },
      { time: '14:00', activity: 'Guinness Storehouse (2 hours)' },
      { time: '16:00', activity: 'St. Patrick\'s Cathedral' },
      { time: '17:00', activity: 'Temple Bar & River Liffey walk' },
      { time: '18:00', activity: 'Drop-off at hotel' },
    ],
    included: ['Private guide', 'Transportation', 'Guinness Storehouse entrance', 'Lunch'],
    notIncluded: ['Airfare', 'Hotel accommodation', 'Personal expenses'],
    images: [
      'https://images.unsplash.com/photo-1564959130747-897fb406b9af?w=800&q=80',
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    ],
  },
  {
    name: 'Dublin Multi-Day Experience',
    slug: 'dublin-multi-day-experience',
    description: 'A comprehensive 3-day exploration of Dublin and its surroundings. Includes day trips to the Cliffs of Moher, Killarney National Park, and the Wicklow Mountains.',
    fullDescription: 'Go beyond the city and discover the breathtaking landscapes that make Ireland truly special. Over three days, your private guide will take you from the medieval streets of Dublin to the awe-inspiring Cliffs of Moher, through the lush Ring of Kerry, and into the serene Wicklow Mountains — known as the Garden of Ireland.',
    duration: '3 Days',
    groupSize: '1-6 people',
    startPrice: 895,
    currency: 'GBP',
    pickupLocation: 'Dublin Airport or Hotel',
    highlights: [
      'Cliffs of Moher full-day trip',
      'Wicklow Mountains National Park',
      'Glendalough monastic site',
      'Kilkenny medieval city',
      'Traditional Irish countryside',
      'Fully private vehicle',
      'Expert historian guide',
    ],
    itinerary: [
      { time: 'Day 1', activity: 'Dublin city tour — Trinity, Guinness, Temple Bar' },
      { time: 'Day 2', activity: 'Cliffs of Moher & Galway coastal drive' },
      { time: 'Day 3', activity: 'Wicklow Mountains & Glendalough monastic site' },
    ],
    included: ['Private guide (3 days)', 'Private vehicle', 'Selected entrance fees', 'Daily lunch'],
    notIncluded: ['Airfare', '3-night hotel (available to book)', 'Personal expenses'],
    images: [
      'https://images.unsplash.com/photo-1504198322253-cfa87a0ff25f?w=800&q=80',
      'https://images.unsplash.com/photo-1544413660-299165566b1d?w=800&q=80',
    ],
  },
  {
    name: 'London Private Day Tour',
    slug: 'london-private-day-tour',
    description: 'Discover London\'s royal heritage, iconic landmarks, and hidden neighbourhoods with a private blue-badge guide. Buckingham Palace, Tower of London, Westminster, and more.',
    fullDescription: 'London rewards those who look beyond the obvious, and our private blue-badge guides know exactly where to look. From the grandeur of Buckingham Palace to the gritty history of the East End, this bespoke day tour reveals London in all its layered complexity. Perfect for first-timers wanting the highlights or returning visitors ready to discover more.',
    duration: 'Full Day (9 hours)',
    groupSize: '1-8 people',
    startPrice: 350,
    currency: 'GBP',
    pickupLocation: 'Central London Hotel',
    highlights: [
      'Buckingham Palace & Changing of the Guard',
      'Tower of London & Crown Jewels',
      'Westminster Abbey',
      'Houses of Parliament & Big Ben',
      'Borough Market food experience',
      'Southbank & Tate Modern walk',
      'Hidden mews and Royal parks',
    ],
    itinerary: [
      { time: '09:00', activity: 'Hotel pickup, Westminster overview' },
      { time: '09:30', activity: 'Buckingham Palace & St James\'s Park' },
      { time: '11:00', activity: 'Westminster Abbey & Parliament Square' },
      { time: '12:30', activity: 'Borough Market — gourmet lunch break' },
      { time: '14:00', activity: 'Tower of London & Tower Bridge' },
      { time: '16:00', activity: 'Southbank walk, Tate Modern exterior' },
      { time: '17:30', activity: 'Covent Garden & West End' },
      { time: '18:30', activity: 'Drop-off at hotel' },
    ],
    included: ['Blue-badge private guide', 'Private vehicle', 'Tower of London entrance', 'Borough Market food tour'],
    notIncluded: ['Airfare', 'Hotel', 'Personal shopping', 'Afternoon tea (optional add-on)'],
    images: [
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
      'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80',
    ],
  },
]

async function main() {
  console.log('🌱 Starting seed...')

  // Seed is illustrative — visa and tour data is used in the frontend
  // The actual application uses static data in components
  // This seed demonstrates the data structure

  console.log(`✅ Visa countries configured: ${visaCountries.length}`)
  console.log(`✅ Tours configured: ${tourData.length}`)
  console.log('✅ Seed complete — data is loaded statically in the frontend')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

export { visaCountries, tourData }
