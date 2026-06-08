import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEMPLATES = [
  {
    name: 'Classic London Explorer',
    destination: 'London, United Kingdom',
    description: 'Discover the best of London — royal palaces, world-class museums, iconic landmarks, and hidden neighbourhoods. A perfect blend of history and modernity.',
    coverImage: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1200&q=80',
    duration: 7,
    category: 'cultural',
    highlights: [
      'Buckingham Palace & Changing of the Guard',
      'Tower of London & Tower Bridge',
      'The British Museum',
      'Hyde Park & Kensington Gardens',
      'Notting Hill & Borough Market',
      'West End theatre show',
    ],
    tags: ['history', 'culture', 'city', 'museums', 'royalty'],
    order: 1,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & Central London',
        items: [
          { type: 'TRANSPORT', title: 'Heathrow Express to Paddington', startTime: '10:00', endTime: '10:20', location: 'Heathrow Airport' },
          { type: 'HOTEL', title: 'Check in — Central London Hotel', startTime: '14:00', location: 'Westminster' },
          { type: 'ACTIVITY', title: 'Evening walk along the Thames & Westminster Bridge', startTime: '18:00', location: 'Westminster Bridge' },
        ],
      },
      {
        dayNumber: 2,
        title: 'Royal London',
        items: [
          { type: 'ACTIVITY', title: 'Buckingham Palace & Changing of the Guard', startTime: '09:30', location: 'Buckingham Palace' },
          { type: 'ACTIVITY', title: 'St James\'s Park', startTime: '11:00', location: 'St James\'s Park' },
          { type: 'ACTIVITY', title: 'Westminster Abbey', startTime: '13:00', location: 'Westminster' },
          { type: 'ACTIVITY', title: 'Houses of Parliament & Big Ben', startTime: '15:00', location: 'Parliament Square' },
          { type: 'RESTAURANT', title: 'Dinner in Covent Garden', startTime: '19:00', location: 'Covent Garden' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Tower & City',
        items: [
          { type: 'ACTIVITY', title: 'Tower of London', startTime: '09:00', location: 'Tower Hill' },
          { type: 'ACTIVITY', title: 'Tower Bridge Experience', startTime: '12:00', location: 'Tower Bridge' },
          { type: 'RESTAURANT', title: 'Lunch at Borough Market', startTime: '13:30', location: 'Borough Market, Southwark' },
          { type: 'ACTIVITY', title: 'Tate Modern & Millennium Bridge', startTime: '15:00', location: 'South Bank' },
          { type: 'ACTIVITY', title: 'Sky Garden (free, pre-book)', startTime: '18:00', location: 'Fenchurch Street' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Museums & Hyde Park',
        items: [
          { type: 'ACTIVITY', title: 'Natural History Museum', startTime: '10:00', location: 'South Kensington' },
          { type: 'ACTIVITY', title: 'Victoria & Albert Museum', startTime: '12:30', location: 'South Kensington' },
          { type: 'ACTIVITY', title: 'Hyde Park & Kensington Gardens', startTime: '15:00', location: 'Hyde Park' },
          { type: 'ACTIVITY', title: 'Notting Hill exploration', startTime: '17:30', location: 'Notting Hill' },
        ],
      },
      {
        dayNumber: 5,
        title: 'The British Museum & Shoreditch',
        items: [
          { type: 'ACTIVITY', title: 'The British Museum', startTime: '09:30', location: 'Bloomsbury' },
          { type: 'RESTAURANT', title: 'Lunch in Covent Garden', startTime: '13:00', location: 'Covent Garden' },
          { type: 'ACTIVITY', title: 'Shoreditch street art & markets', startTime: '15:00', location: 'Shoreditch' },
          { type: 'RESTAURANT', title: 'Dinner — Brick Lane curry', startTime: '19:00', location: 'Brick Lane' },
        ],
      },
      {
        dayNumber: 6,
        title: 'Greenwich & Day Trip',
        items: [
          { type: 'TRANSPORT', title: 'Thames Clipper to Greenwich', startTime: '09:30', location: 'Embankment Pier' },
          { type: 'ACTIVITY', title: 'Cutty Sark & National Maritime Museum', startTime: '11:00', location: 'Greenwich' },
          { type: 'ACTIVITY', title: 'Royal Observatory & Prime Meridian Line', startTime: '13:00', location: 'Greenwich Park' },
          { type: 'ACTIVITY', title: 'West End theatre show', startTime: '19:30', location: 'West End' },
        ],
      },
      {
        dayNumber: 7,
        title: 'Final Day & Departure',
        items: [
          { type: 'ACTIVITY', title: 'Oxford Street or Camden Market (shopping)', startTime: '10:00', location: 'London' },
          { type: 'TRANSPORT', title: 'Transfer to airport', startTime: '15:00', location: 'Hotel' },
        ],
      },
    ],
  },
  {
    name: 'Dubai Luxury Escape',
    destination: 'Dubai, United Arab Emirates',
    description: 'Experience the world\'s most glamorous city. Skyscrapers that touch the clouds, golden deserts, pristine beaches, and shopping beyond imagination. Dubai done right.',
    coverImage: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&q=80',
    duration: 6,
    category: 'luxury',
    highlights: [
      'Burj Khalifa — At the Top observation deck',
      'Dubai Mall & Dubai Fountain show',
      'Desert Safari with BBQ dinner',
      'Palm Jumeirah & Atlantis',
      'Dubai Creek & Gold Souk',
      'Burj Al Arab afternoon tea',
    ],
    tags: ['luxury', 'desert', 'shopping', 'beaches', 'modern'],
    order: 2,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & Downtown Dubai',
        items: [
          { type: 'HOTEL', title: 'Check in — Downtown Dubai Hotel', startTime: '14:00', location: 'Downtown Dubai' },
          { type: 'ACTIVITY', title: 'Dubai Fountain Show', startTime: '18:00', location: 'Dubai Mall Lake' },
          { type: 'RESTAURANT', title: 'Dinner with Burj Khalifa view', startTime: '19:30', location: 'Downtown Dubai' },
        ],
      },
      {
        dayNumber: 2,
        title: 'Burj Khalifa & Dubai Mall',
        items: [
          { type: 'ACTIVITY', title: 'Burj Khalifa — At the Top (Level 124/125)', startTime: '09:00', location: 'Burj Khalifa' },
          { type: 'ACTIVITY', title: 'Dubai Mall & Dubai Aquarium', startTime: '11:00', location: 'Dubai Mall' },
          { type: 'RESTAURANT', title: 'Lunch at Dubai Mall', startTime: '13:00', location: 'Dubai Mall' },
          { type: 'ACTIVITY', title: 'Dubai Frame', startTime: '15:30', location: 'Zabeel Park' },
          { type: 'ACTIVITY', title: 'Evening Dubai Fountain Show', startTime: '20:00', location: 'Dubai Mall Lake' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Desert Safari',
        items: [
          { type: 'ACTIVITY', title: 'Morning — free / spa / beach', startTime: '09:00', location: 'Hotel' },
          { type: 'ACTIVITY', title: 'Desert Safari — dune bashing, camel ride, sandboarding', startTime: '15:00', location: 'Arabian Desert' },
          { type: 'RESTAURANT', title: 'Bedouin camp BBQ dinner under the stars', startTime: '19:30', location: 'Desert Camp' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Old Dubai & Gold Souk',
        items: [
          { type: 'ACTIVITY', title: 'Dubai Creek — abra (wooden boat) crossing', startTime: '09:30', location: 'Dubai Creek' },
          { type: 'ACTIVITY', title: 'Spice Souk & Gold Souk', startTime: '10:00', location: 'Deira' },
          { type: 'ACTIVITY', title: 'Al Fahidi Historical Neighbourhood', startTime: '12:00', location: 'Al Fahidi' },
          { type: 'ACTIVITY', title: 'Dubai Museum', startTime: '13:00', location: 'Al Fahidi Fort' },
          { type: 'RESTAURANT', title: 'Dinner — traditional Emirati cuisine', startTime: '19:00', location: 'Old Dubai' },
        ],
      },
      {
        dayNumber: 5,
        title: 'Palm Jumeirah & Beach',
        items: [
          { type: 'ACTIVITY', title: 'Palm Jumeirah monorail & Atlantis Aquaventure', startTime: '10:00', location: 'Palm Jumeirah' },
          { type: 'RESTAURANT', title: 'Lunch at Atlantis', startTime: '13:00', location: 'Atlantis, The Palm' },
          { type: 'ACTIVITY', title: 'JBR Beach (Jumeirah Beach Residence)', startTime: '16:00', location: 'JBR' },
          { type: 'ACTIVITY', title: 'Dubai Marina evening stroll & dinner', startTime: '19:00', location: 'Dubai Marina' },
        ],
      },
      {
        dayNumber: 6,
        title: 'Final Morning & Departure',
        items: [
          { type: 'ACTIVITY', title: 'Dubai Mall last-minute shopping', startTime: '09:00', location: 'Dubai Mall' },
          { type: 'TRANSPORT', title: 'Transfer to Dubai International Airport', startTime: '14:00', location: 'Hotel' },
        ],
      },
    ],
  },
  {
    name: 'Toronto & Niagara Falls',
    destination: 'Toronto & Niagara, Canada',
    description: 'From the buzz of Canada\'s most cosmopolitan city to the raw power of one of the world\'s greatest natural wonders. A trip of contrasts that delivers on every level.',
    coverImage: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=1200&q=80',
    duration: 7,
    category: 'adventure',
    highlights: [
      'Niagara Falls — Maid of the Mist boat tour',
      'CN Tower observation deck & EdgeWalk',
      'Kensington Market & Distillery District',
      'Royal Ontario Museum',
      'Toronto Islands day trip',
      'Niagara wine region tour',
    ],
    tags: ['nature', 'city', 'waterfalls', 'canada', 'adventure'],
    order: 3,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival — Toronto',
        items: [
          { type: 'TRANSPORT', title: 'UP Express: Pearson Airport to Union Station', startTime: '12:00', location: 'Pearson International Airport' },
          { type: 'HOTEL', title: 'Check in — Downtown Toronto Hotel', startTime: '15:00', location: 'Downtown Toronto' },
          { type: 'ACTIVITY', title: 'Waterfront walk — Harbourfront Centre', startTime: '17:00', location: 'Toronto Waterfront' },
          { type: 'RESTAURANT', title: 'Welcome dinner — Distillery District', startTime: '19:30', location: 'Distillery District' },
        ],
      },
      {
        dayNumber: 2,
        title: 'CN Tower & Waterfront',
        items: [
          { type: 'ACTIVITY', title: 'CN Tower — LookOut Level & Glass Floor', startTime: '09:30', location: 'CN Tower' },
          { type: 'ACTIVITY', title: 'Ripley\'s Aquarium of Canada', startTime: '11:30', location: 'Downtown' },
          { type: 'RESTAURANT', title: 'Lunch — St Lawrence Market', startTime: '13:30', location: 'St Lawrence Market' },
          { type: 'ACTIVITY', title: 'Toronto Island Ferry & beaches', startTime: '15:00', location: 'Jack Layton Ferry Terminal' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Culture & Neighbourhoods',
        items: [
          { type: 'ACTIVITY', title: 'Royal Ontario Museum', startTime: '10:00', location: 'Museum, Toronto' },
          { type: 'RESTAURANT', title: 'Lunch — Kensington Market', startTime: '13:00', location: 'Kensington Market' },
          { type: 'ACTIVITY', title: 'Kensington Market & Chinatown exploration', startTime: '14:00', location: 'Kensington Market' },
          { type: 'ACTIVITY', title: 'Art Gallery of Ontario', startTime: '16:00', location: 'Art Gallery of Ontario' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Niagara Falls — Day 1',
        items: [
          { type: 'TRANSPORT', title: 'Coach to Niagara Falls', startTime: '08:30', location: 'Toronto Union Station' },
          { type: 'ACTIVITY', title: 'Maid of the Mist boat tour', startTime: '11:00', location: 'Niagara Falls' },
          { type: 'ACTIVITY', title: 'Journey Behind the Falls', startTime: '13:00', location: 'Niagara Falls, Canada' },
          { type: 'HOTEL', title: 'Check in — Niagara Falls Hotel', startTime: '15:00', location: 'Niagara Falls' },
          { type: 'ACTIVITY', title: 'Illuminated Falls evening viewing', startTime: '20:00', location: 'Niagara Falls Overlook' },
        ],
      },
      {
        dayNumber: 5,
        title: 'Niagara Wine Country',
        items: [
          { type: 'ACTIVITY', title: 'Niagara-on-the-Lake town visit', startTime: '10:00', location: 'Niagara-on-the-Lake' },
          { type: 'ACTIVITY', title: 'Niagara wine region tour & tastings', startTime: '12:00', location: 'Niagara Peninsula' },
          { type: 'ACTIVITY', title: 'Whirlpool Aero Car', startTime: '15:30', location: 'Niagara Gorge' },
          { type: 'RESTAURANT', title: 'Farewell dinner — Falls view restaurant', startTime: '19:00', location: 'Niagara Falls' },
        ],
      },
      {
        dayNumber: 6,
        title: 'Return to Toronto & Shopping',
        items: [
          { type: 'TRANSPORT', title: 'Coach back to Toronto', startTime: '10:00', location: 'Niagara Falls' },
          { type: 'ACTIVITY', title: 'Eaton Centre & Yorkville shopping', startTime: '13:00', location: 'Downtown Toronto' },
          { type: 'RESTAURANT', title: 'Last dinner in Toronto', startTime: '19:00', location: 'Entertainment District' },
        ],
      },
      {
        dayNumber: 7,
        title: 'Departure',
        items: [
          { type: 'ACTIVITY', title: 'Breakfast & final morning walk', startTime: '08:30', location: 'Hotel' },
          { type: 'TRANSPORT', title: 'UP Express to Pearson Airport', startTime: '12:00', location: 'Union Station' },
        ],
      },
    ],
  },
  {
    name: 'Paris — The City of Light',
    destination: 'Paris, France',
    description: 'Romance, art, gastronomy, fashion. Paris is the city that never stops enchanting. From the Eiffel Tower at dusk to croissants at a corner café — every moment feels cinematic.',
    coverImage: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1200&q=80',
    duration: 6,
    category: 'leisure',
    highlights: [
      'Eiffel Tower at sunset & evening light show',
      'The Louvre — Mona Lisa & beyond',
      'Montmartre & Sacré-Cœur',
      'Palace of Versailles day trip',
      'Seine River cruise',
      'Champs-Élysées & Arc de Triomphe',
    ],
    tags: ['romance', 'art', 'food', 'culture', 'city'],
    order: 4,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & First Impressions',
        items: [
          { type: 'TRANSPORT', title: 'RER B from CDG to city centre', startTime: '11:00', location: 'Charles de Gaulle Airport' },
          { type: 'HOTEL', title: 'Check in — Paris hotel', startTime: '14:00', location: 'Paris' },
          { type: 'ACTIVITY', title: 'Evening Seine River cruise', startTime: '19:00', location: 'Bateaux Mouches, Pont de l\'Alma' },
          { type: 'ACTIVITY', title: 'Eiffel Tower light show (every hour)', startTime: '21:00', location: 'Champ de Mars' },
        ],
      },
      {
        dayNumber: 2,
        title: 'The Louvre & Tuileries',
        items: [
          { type: 'ACTIVITY', title: 'The Louvre Museum', startTime: '09:00', location: 'Louvre Museum' },
          { type: 'ACTIVITY', title: 'Tuileries Garden stroll', startTime: '13:00', location: 'Tuileries Garden' },
          { type: 'ACTIVITY', title: 'Champs-Élysées & Arc de Triomphe', startTime: '15:00', location: 'Champs-Élysées' },
          { type: 'RESTAURANT', title: 'Dinner — French brasserie', startTime: '19:30', location: 'Paris' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Versailles Day Trip',
        items: [
          { type: 'TRANSPORT', title: 'RER C to Versailles', startTime: '08:30', location: 'Gare du Nord' },
          { type: 'ACTIVITY', title: 'Palace of Versailles & Hall of Mirrors', startTime: '10:00', location: 'Versailles' },
          { type: 'ACTIVITY', title: 'Gardens of Versailles', startTime: '13:00', location: 'Versailles Gardens' },
          { type: 'TRANSPORT', title: 'Return to Paris', startTime: '16:00', location: 'Versailles' },
          { type: 'ACTIVITY', title: 'Evening at Marais district', startTime: '18:30', location: 'Le Marais' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Montmartre & Sacré-Cœur',
        items: [
          { type: 'ACTIVITY', title: 'Montmartre neighbourhood & artist quarter', startTime: '09:30', location: 'Montmartre' },
          { type: 'ACTIVITY', title: 'Sacré-Cœur Basilica & panoramic views', startTime: '10:30', location: 'Sacré-Cœur' },
          { type: 'ACTIVITY', title: 'Musée d\'Orsay (Impressionists)', startTime: '14:00', location: 'Musée d\'Orsay' },
          { type: 'ACTIVITY', title: 'Eiffel Tower at sunset', startTime: '18:30', location: 'Eiffel Tower' },
        ],
      },
      {
        dayNumber: 5,
        title: 'Latin Quarter & Notre-Dame',
        items: [
          { type: 'ACTIVITY', title: 'Notre-Dame Cathedral (exterior & restoration)', startTime: '09:30', location: 'Île de la Cité' },
          { type: 'ACTIVITY', title: 'Sainte-Chapelle', startTime: '10:30', location: 'Île de la Cité' },
          { type: 'RESTAURANT', title: 'Lunch — Latin Quarter', startTime: '12:30', location: 'Latin Quarter' },
          { type: 'ACTIVITY', title: 'Luxembourg Garden', startTime: '14:30', location: 'Luxembourg' },
          { type: 'RESTAURANT', title: 'Farewell dinner — fine French cuisine', startTime: '20:00', location: 'Paris' },
        ],
      },
      {
        dayNumber: 6,
        title: 'Shopping & Departure',
        items: [
          { type: 'ACTIVITY', title: 'Galeries Lafayette or Le Marais shopping', startTime: '09:00', location: 'Paris' },
          { type: 'TRANSPORT', title: 'Transfer to Charles de Gaulle Airport', startTime: '13:00', location: 'Hotel' },
        ],
      },
    ],
  },
  {
    name: 'New York City — The Big Apple',
    destination: 'New York City, USA',
    description: 'The city that never sleeps — and neither will you. Times Square, Central Park, the Met, Brooklyn Bridge, world-class food, Broadway. NYC is an experience unlike any other.',
    coverImage: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1200&q=80',
    duration: 7,
    category: 'city',
    highlights: [
      'Statue of Liberty & Ellis Island',
      'Times Square & Broadway show',
      'Central Park & The Met',
      'Brooklyn Bridge walk',
      'Top of the Rock or One World Observatory',
      'High Line Park & Chelsea Market',
    ],
    tags: ['city', 'culture', 'food', 'entertainment', 'iconic'],
    order: 5,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival — Manhattan',
        items: [
          { type: 'TRANSPORT', title: 'AirTrain + Subway or taxi to Manhattan', startTime: '12:00', location: 'JFK International Airport' },
          { type: 'HOTEL', title: 'Check in — Midtown Manhattan Hotel', startTime: '15:00', location: 'Midtown Manhattan' },
          { type: 'ACTIVITY', title: 'Times Square — first impressions', startTime: '18:00', location: 'Times Square' },
          { type: 'RESTAURANT', title: 'Welcome dinner — NYC diner or steakhouse', startTime: '19:30', location: 'Midtown' },
        ],
      },
      {
        dayNumber: 2,
        title: 'Statue of Liberty & Lower Manhattan',
        items: [
          { type: 'ACTIVITY', title: 'Statue of Liberty & Ellis Island ferry', startTime: '09:00', location: 'Battery Park' },
          { type: 'ACTIVITY', title: 'Wall Street & Charging Bull', startTime: '13:00', location: 'Financial District' },
          { type: 'ACTIVITY', title: '9/11 Memorial & Museum', startTime: '14:00', location: 'World Trade Center' },
          { type: 'ACTIVITY', title: 'One World Observatory', startTime: '16:30', location: 'One World Trade Center' },
          { type: 'RESTAURANT', title: 'Dinner — Tribeca or SoHo', startTime: '19:00', location: 'Lower Manhattan' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Central Park & Upper East Side',
        items: [
          { type: 'ACTIVITY', title: 'Central Park — Bethesda Fountain, Strawberry Fields', startTime: '09:00', location: 'Central Park' },
          { type: 'ACTIVITY', title: 'The Metropolitan Museum of Art', startTime: '11:30', location: 'Upper East Side' },
          { type: 'RESTAURANT', title: 'Lunch in the park or Museum café', startTime: '13:30', location: 'Central Park' },
          { type: 'ACTIVITY', title: 'Museum Mile stroll', startTime: '15:00', location: 'Fifth Avenue' },
          { type: 'ACTIVITY', title: 'Broadway show', startTime: '20:00', location: 'Theatre District' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Brooklyn & Brooklyn Bridge',
        items: [
          { type: 'ACTIVITY', title: 'Brooklyn Bridge walk', startTime: '09:00', location: 'Brooklyn Bridge' },
          { type: 'ACTIVITY', title: 'DUMBO & Brooklyn Heights Promenade', startTime: '10:30', location: 'DUMBO, Brooklyn' },
          { type: 'RESTAURANT', title: 'Lunch — Smorgasburg food market (weekends) or local deli', startTime: '13:00', location: 'Brooklyn' },
          { type: 'ACTIVITY', title: 'Williamsburg neighbourhood & street art', startTime: '15:00', location: 'Williamsburg' },
          { type: 'ACTIVITY', title: 'Top of the Rock at sunset', startTime: '18:30', location: '30 Rockefeller Plaza' },
        ],
      },
      {
        dayNumber: 5,
        title: 'High Line, Chelsea & Midtown',
        items: [
          { type: 'ACTIVITY', title: 'High Line Park', startTime: '09:30', location: 'High Line, Chelsea' },
          { type: 'ACTIVITY', title: 'Chelsea Market', startTime: '11:00', location: 'Chelsea Market' },
          { type: 'ACTIVITY', title: 'Whitney Museum of American Art', startTime: '13:00', location: 'Meatpacking District' },
          { type: 'ACTIVITY', title: 'Fifth Avenue & Rockefeller Center', startTime: '15:00', location: 'Midtown' },
          { type: 'RESTAURANT', title: 'Dinner — Hell\'s Kitchen or Times Square area', startTime: '19:00', location: 'Midtown West' },
        ],
      },
      {
        dayNumber: 6,
        title: 'The Met Cloisters & Harlem',
        items: [
          { type: 'ACTIVITY', title: 'The Cloisters (medieval art, Fort Tryon Park views)', startTime: '10:00', location: 'Washington Heights' },
          { type: 'ACTIVITY', title: 'Harlem — Apollo Theater & soul food', startTime: '13:30', location: 'Harlem' },
          { type: 'RESTAURANT', title: 'Soul food lunch', startTime: '13:30', location: 'Harlem' },
          { type: 'ACTIVITY', title: 'Guggenheim Museum', startTime: '16:00', location: 'Upper East Side' },
          { type: 'RESTAURANT', title: 'Farewell dinner — Lower East Side', startTime: '19:30', location: 'Lower East Side' },
        ],
      },
      {
        dayNumber: 7,
        title: 'Shopping & Departure',
        items: [
          { type: 'ACTIVITY', title: 'SoHo shopping or Union Square Greenmarket', startTime: '09:00', location: 'SoHo / Union Square' },
          { type: 'TRANSPORT', title: 'Transfer to JFK International Airport', startTime: '13:30', location: 'Hotel' },
        ],
      },
    ],
  },
  {
    name: 'Accra & Ghana Cultural Journey',
    destination: 'Accra, Ghana',
    description: 'Ghana — the gateway to West Africa. A journey through history, culture, and vibrant modern life. From the slave castles of Cape Coast to the rhythms of Accra\'s arts scene.',
    coverImage: 'https://images.unsplash.com/photo-1589825743636-0a9bf9a9b1c7?w=1200&q=80',
    duration: 8,
    category: 'cultural',
    highlights: [
      'Cape Coast Castle — UNESCO heritage site',
      'Kakum National Park canopy walkway',
      'Jamestown & Labadi Beach, Accra',
      'National Museum of Ghana',
      'Kumasi — Ashanti cultural centre',
      'Kejetia Market — largest in West Africa',
    ],
    tags: ['culture', 'history', 'africa', 'nature', 'heritage'],
    order: 6,
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival — Accra',
        items: [
          { type: 'TRANSPORT', title: 'Transfer from Kotoka International Airport', startTime: '13:00', location: 'Kotoka International Airport, Accra' },
          { type: 'HOTEL', title: 'Check in — Accra Hotel', startTime: '16:00', location: 'Accra' },
          { type: 'ACTIVITY', title: 'Osu Oxford Street evening stroll', startTime: '18:30', location: 'Osu, Accra' },
          { type: 'RESTAURANT', title: 'Welcome dinner — Ghanaian cuisine', startTime: '19:30', location: 'Accra' },
        ],
      },
      {
        dayNumber: 2,
        title: 'Accra City Tour',
        items: [
          { type: 'ACTIVITY', title: 'National Museum of Ghana', startTime: '09:30', location: 'Barnes Road, Accra' },
          { type: 'ACTIVITY', title: 'Kwame Nkrumah Memorial Park & Mausoleum', startTime: '11:30', location: 'Accra' },
          { type: 'RESTAURANT', title: 'Lunch — local chop bar', startTime: '13:30', location: 'Accra' },
          { type: 'ACTIVITY', title: 'Jamestown Lighthouse & Fishing Harbour', startTime: '15:00', location: 'Jamestown, Accra' },
          { type: 'ACTIVITY', title: 'Art Centre & craft market', startTime: '17:00', location: 'Accra' },
        ],
      },
      {
        dayNumber: 3,
        title: 'Cape Coast Journey',
        items: [
          { type: 'TRANSPORT', title: 'Drive to Cape Coast (3 hours)', startTime: '07:00', location: 'Accra Hotel' },
          { type: 'ACTIVITY', title: 'Cape Coast Castle — guided tour', startTime: '11:00', location: 'Cape Coast Castle, UNESCO' },
          { type: 'HOTEL', title: 'Check in — Cape Coast hotel', startTime: '15:00', location: 'Cape Coast' },
          { type: 'ACTIVITY', title: 'Cape Coast town & Hans Cottage Botel', startTime: '17:00', location: 'Cape Coast' },
        ],
      },
      {
        dayNumber: 4,
        title: 'Kakum National Park',
        items: [
          { type: 'ACTIVITY', title: 'Kakum National Park — canopy walkway', startTime: '08:00', location: 'Kakum National Park' },
          { type: 'ACTIVITY', title: 'Elmina Castle (second slave castle)', startTime: '12:00', location: 'Elmina' },
          { type: 'RESTAURANT', title: 'Lunch — Elmina seafront', startTime: '14:00', location: 'Elmina' },
          { type: 'ACTIVITY', title: 'Anomabo Beach Resort or evening at Cape Coast', startTime: '16:00', location: 'Cape Coast region' },
        ],
      },
      {
        dayNumber: 5,
        title: 'Kumasi — Ashanti Capital',
        items: [
          { type: 'TRANSPORT', title: 'Drive/coach to Kumasi (3.5 hours)', startTime: '07:30', location: 'Cape Coast' },
          { type: 'ACTIVITY', title: 'Manhyia Palace Museum (Ashanti royal palace)', startTime: '12:00', location: 'Kumasi' },
          { type: 'HOTEL', title: 'Check in — Kumasi Hotel', startTime: '14:00', location: 'Kumasi' },
          { type: 'ACTIVITY', title: 'Kejetia Market — largest in West Africa', startTime: '16:00', location: 'Kumasi Central Market' },
          { type: 'RESTAURANT', title: 'Dinner — Kumasi fufu and soup', startTime: '19:30', location: 'Kumasi' },
        ],
      },
      {
        dayNumber: 6,
        title: 'Kumasi Cultural Day',
        items: [
          { type: 'ACTIVITY', title: 'Kente weaving village — Bonwire', startTime: '09:00', location: 'Bonwire, near Kumasi' },
          { type: 'ACTIVITY', title: 'Kumasi Cultural Centre', startTime: '12:00', location: 'Kumasi' },
          { type: 'RESTAURANT', title: 'Lunch — authentic Ashanti cuisine', startTime: '13:30', location: 'Kumasi' },
          { type: 'TRANSPORT', title: 'Return to Accra', startTime: '15:00', location: 'Kumasi' },
        ],
      },
      {
        dayNumber: 7,
        title: 'Labadi Beach & Leisure',
        items: [
          { type: 'ACTIVITY', title: 'Labadi Beach (La Pleasure Beach)', startTime: '10:00', location: 'La, Accra' },
          { type: 'RESTAURANT', title: 'Beachfront lunch', startTime: '13:00', location: 'Labadi Beach' },
          { type: 'ACTIVITY', title: 'Accra Mall & Silverbird Cinemas', startTime: '16:00', location: 'Tetteh Quarshie Interchange, Accra' },
          { type: 'RESTAURANT', title: 'Farewell dinner — rooftop restaurant', startTime: '19:30', location: 'Accra' },
        ],
      },
      {
        dayNumber: 8,
        title: 'Final Morning & Departure',
        items: [
          { type: 'ACTIVITY', title: 'Last-minute shopping — craft markets', startTime: '09:00', location: 'Accra' },
          { type: 'TRANSPORT', title: 'Transfer to Kotoka International Airport', startTime: '14:00', location: 'Accra Hotel' },
        ],
      },
    ],
  },
]

async function main() {
  console.log('Seeding TripTemplate table...')

  for (const t of TEMPLATES) {
    const existing = await prisma.tripTemplate.findFirst({
      where: { name: t.name },
    })
    if (existing) {
      console.log(`  ⏭  Skipping (exists): ${t.name}`)
      continue
    }
    await prisma.tripTemplate.create({ data: t })
    console.log(`  ✅ Created: ${t.name}`)
  }

  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
