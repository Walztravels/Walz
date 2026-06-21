import type { FlightItinerary, FlightSegment, CabinClass } from './types'

const LOGO = (iata: string) => `https://pics.avs.io/200/200/${iata}.png`

function seg(
  id: string,
  airline: string, airlineName: string, aircraft: string,
  from: string, fromCity: string, to: string, toCity: string,
  baseDateIso: string, deptHour: number, durationMins: number,
  cabin: CabinClass,
  amenities: { wifi: boolean; meals: boolean; lounge: boolean; flatbed: boolean; power: boolean }
): FlightSegment {
  const dep = new Date(baseDateIso)
  dep.setUTCHours(deptHour, 0, 0, 0)
  const arr = new Date(dep.getTime() + durationMins * 60_000)
  const flightNum = `${airline}${Math.floor(100 + (id.charCodeAt(0) * 37 + id.charCodeAt(1) * 13) % 900)}`
  return {
    id,
    airline,
    airlineName,
    airlineLogo: LOGO(airline),
    flightNumber: flightNum,
    aircraft,
    departureIata: from,
    departureCity: fromCity,
    departureTime: dep.toISOString(),
    arrivalIata:   to,
    arrivalCity:   toCity,
    arrivalTime:   arr.toISOString(),
    durationMins,
    cabinClass:    cabin,
    seatsRemaining: Math.floor(3 + Math.abs(id.charCodeAt(0) - 65) % 9),
    amenities: [
      { type: 'wifi',          available: amenities.wifi          },
      { type: 'meals',         available: amenities.meals         },
      { type: 'entertainment', available: true                    },
      { type: 'power',         available: amenities.power         },
      { type: 'lounge',        available: amenities.lounge        },
      { type: 'flatbed',       available: amenities.flatbed       },
    ],
  }
}

export function generateMockResults(
  from: string,
  to:   string,
  cabin: string,
  paxCount: number,
  tripType: string = 'one-way',
): FlightItinerary[] {
  const c        = (cabin as CabinClass) || 'ECONOMY'
  const fromCity = from || 'London'
  const toCity   = to   || 'Lagos'
  const outDate  = '2024-12-15T00:00:00Z'
  const retDate  = '2024-12-22T00:00:00Z'
  const isRT     = tripType === 'round-trip'

  const results: FlightItinerary[] = [
    // 1 — Qatar Airways  RECOMMENDED
    {
      id:            'QR-001',
      segments: [
        seg('s1', 'QR', 'Qatar Airways', 'Boeing 787 Dreamliner', from, fromCity, 'DOH', 'Doha',  outDate, 8,  380, c, { wifi: true,  meals: true,  lounge: true,  flatbed: true,  power: true  }),
        seg('s2', 'QR', 'Qatar Airways', 'Boeing 787 Dreamliner', 'DOH', 'Doha',  to, toCity,    outDate, 14, 370, c, { wifi: true,  meals: true,  lounge: true,  flatbed: true,  power: true  }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('r1', 'QR', 'Qatar Airways', 'Boeing 787 Dreamliner', to, toCity, 'DOH', 'Doha',   retDate, 7,  370, c, { wifi: true,  meals: true,  lounge: true,  flatbed: true,  power: true  }),
          seg('r2', 'QR', 'Qatar Airways', 'Boeing 787 Dreamliner', 'DOH', 'Doha', from, fromCity, retDate, 14, 380, c, { wifi: true,  meals: true,  lounge: true,  flatbed: true,  power: true  }),
        ],
        returnDuration:  870,
        returnLayovers:  [{ airport: 'DOH', city: 'Doha', durationMins: 120, overnight: false }],
      } : {}),
      stops:         1,
      totalDuration: 870,
      layovers:      [{ airport: 'DOH', city: 'Doha',   durationMins: 120, overnight: false }],
      price:         { total: 1320 * paxCount, base: 980 * paxCount,  taxes: 340 * paxCount,  currency: 'GBP', perPerson: 1320 },
      fareType:      'flex',
      refundable:    true,
      changeable:    true,
      baggageInfo:   { cabin: '1 × 7kg', checked: '2 × 30kg', included: true },
      seatsLeft:     4,
      co2Kg:         380,
      badge:         'recommended',
      badgeLabel:    '⭐ Recommended',
    },

    // 2 — Royal Air Maroc  CHEAPEST
    {
      id:            'AT-002',
      segments: [
        seg('s3', 'AT', 'Royal Air Maroc', 'Boeing 737 MAX', from, fromCity, 'CMN', 'Casablanca', outDate, 10, 200, c, { wifi: false, meals: true,  lounge: false, flatbed: false, power: false }),
        seg('s4', 'AT', 'Royal Air Maroc', 'Boeing 737 MAX', 'CMN', 'Casablanca', to, toCity,     outDate, 14, 240, c, { wifi: false, meals: true,  lounge: false, flatbed: false, power: false }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('r3', 'AT', 'Royal Air Maroc', 'Boeing 737 MAX', to, toCity, 'CMN', 'Casablanca', retDate, 8,  240, c, { wifi: false, meals: true,  lounge: false, flatbed: false, power: false }),
          seg('r4', 'AT', 'Royal Air Maroc', 'Boeing 737 MAX', 'CMN', 'Casablanca', from, fromCity, retDate, 13, 200, c, { wifi: false, meals: true,  lounge: false, flatbed: false, power: false }),
        ],
        returnDuration:  560,
        returnLayovers:  [{ airport: 'CMN', city: 'Casablanca', durationMins: 60, overnight: false }],
      } : {}),
      stops:         1,
      totalDuration: 560,
      layovers:      [{ airport: 'CMN', city: 'Casablanca', durationMins: 60,  overnight: false }],
      price:         { total: 1050 * paxCount, base: 820 * paxCount,  taxes: 230 * paxCount,  currency: 'GBP', perPerson: 1050 },
      fareType:      'lite',
      refundable:    false,
      changeable:    false,
      baggageInfo:   { cabin: '1 × 7kg', checked: '1 × 23kg', included: true },
      seatsLeft:     9,
      co2Kg:         290,
      badge:         'cheapest',
      badgeLabel:    '💰 Cheapest',
    },

    // 3 — British Airways  FASTEST
    {
      id:            'BA-003',
      segments: [
        seg('s5', 'BA', 'British Airways', 'Airbus A350-1000', from, fromCity, to, toCity, outDate, 9, 820, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('r5', 'BA', 'British Airways', 'Airbus A350-1000', to, toCity, from, fromCity, retDate, 10, 820, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
        ],
        returnDuration:  820,
        returnLayovers:  [],
      } : {}),
      stops:         0,
      totalDuration: 820,
      layovers:      [],
      price:         { total: 1780 * paxCount, base: 1350 * paxCount, taxes: 430 * paxCount, currency: 'GBP', perPerson: 1780 },
      fareType:      'flex',
      refundable:    true,
      changeable:    true,
      baggageInfo:   { cabin: '1 × 7kg', checked: '2 × 23kg', included: true },
      seatsLeft:     7,
      co2Kg:         410,
      badge:         'fastest',
      badgeLabel:    '⚡ Fastest — Direct',
    },

    // 4 — Emirates  LUXURY
    {
      id:            'EK-004',
      segments: [
        seg('s6', 'EK', 'Emirates', 'Boeing 777-300ER', from, fromCity, 'DXB', 'Dubai', outDate, 11, 420, 'BUSINESS', { wifi: true, meals: true, lounge: true, flatbed: true, power: true }),
        seg('s7', 'EK', 'Emirates', 'Boeing 777-300ER', 'DXB', 'Dubai', to, toCity,     outDate, 16, 360, 'BUSINESS', { wifi: true, meals: true, lounge: true, flatbed: true, power: true }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('r6', 'EK', 'Emirates', 'Boeing 777-300ER', to, toCity, 'DXB', 'Dubai', retDate, 9,  360, 'BUSINESS', { wifi: true, meals: true, lounge: true, flatbed: true, power: true }),
          seg('r7', 'EK', 'Emirates', 'Boeing 777-300ER', 'DXB', 'Dubai', from, fromCity, retDate, 15, 420, 'BUSINESS', { wifi: true, meals: true, lounge: true, flatbed: true, power: true }),
        ],
        returnDuration:  900,
        returnLayovers:  [{ airport: 'DXB', city: 'Dubai', durationMins: 120, overnight: false }],
      } : {}),
      stops:         1,
      totalDuration: 900,
      layovers:      [{ airport: 'DXB', city: 'Dubai', durationMins: 120, overnight: false }],
      price:         { total: 4250 * paxCount, base: 3200 * paxCount, taxes: 1050 * paxCount, currency: 'GBP', perPerson: 4250 },
      fareType:      'business',
      refundable:    true,
      changeable:    true,
      baggageInfo:   { cabin: '2 × 7kg', checked: '2 × 40kg', included: true },
      seatsLeft:     3,
      co2Kg:         520,
      badge:         'luxury',
      badgeLabel:    '👑 Business Class',
    },

    // 5 — Turkish Airlines  BEST-VALUE
    {
      id:            'TK-005',
      segments: [
        seg('s8', 'TK', 'Turkish Airlines', 'Boeing 787-9', from, fromCity, 'IST', 'Istanbul',  outDate, 7,  340, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
        seg('s9', 'TK', 'Turkish Airlines', 'Boeing 787-9', 'IST', 'Istanbul', to, toCity,      outDate, 12, 390, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('r8', 'TK', 'Turkish Airlines', 'Boeing 787-9', to, toCity, 'IST', 'Istanbul',  retDate, 8,  390, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
          seg('r9', 'TK', 'Turkish Airlines', 'Boeing 787-9', 'IST', 'Istanbul', from, fromCity, retDate, 14, 340, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: true }),
        ],
        returnDuration:  790,
        returnLayovers:  [{ airport: 'IST', city: 'Istanbul', durationMins: 60, overnight: false }],
      } : {}),
      stops:         1,
      totalDuration: 790,
      layovers:      [{ airport: 'IST', city: 'Istanbul', durationMins: 60, overnight: false }],
      price:         { total: 1190 * paxCount, base: 920 * paxCount, taxes: 270 * paxCount, currency: 'GBP', perPerson: 1190 },
      fareType:      'standard',
      refundable:    false,
      changeable:    true,
      baggageInfo:   { cabin: '1 × 8kg', checked: '1 × 23kg', included: true },
      seatsLeft:     6,
      co2Kg:         350,
      badge:         'best-value',
      badgeLabel:    '🎯 Best Value',
    },

    // 6 — Ethiopian Airlines
    {
      id:            'ET-006',
      segments: [
        seg('sa', 'ET', 'Ethiopian Airlines', 'Boeing 787-8', from, fromCity, 'ADD', 'Addis Ababa',  outDate, 6,  480, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: false }),
        seg('sb', 'ET', 'Ethiopian Airlines', 'Boeing 787-8', 'ADD', 'Addis Ababa', to, toCity,      outDate, 13, 270, c, { wifi: false, meals: true, lounge: false, flatbed: false, power: false }),
      ],
      ...(isRT ? {
        returnSegments: [
          seg('ra', 'ET', 'Ethiopian Airlines', 'Boeing 787-8', to, toCity, 'ADD', 'Addis Ababa', retDate, 7,  270, c, { wifi: false, meals: true, lounge: false, flatbed: false, power: false }),
          seg('rb', 'ET', 'Ethiopian Airlines', 'Boeing 787-8', 'ADD', 'Addis Ababa', from, fromCity, retDate, 12, 480, c, { wifi: true, meals: true, lounge: false, flatbed: false, power: false }),
        ],
        returnDuration:  810,
        returnLayovers:  [{ airport: 'ADD', city: 'Addis Ababa', durationMins: 60, overnight: false }],
      } : {}),
      stops:         1,
      totalDuration: 810,
      layovers:      [{ airport: 'ADD', city: 'Addis Ababa', durationMins: 60, overnight: false }],
      price:         { total: 1140 * paxCount, base: 880 * paxCount, taxes: 260 * paxCount, currency: 'GBP', perPerson: 1140 },
      fareType:      'standard',
      refundable:    false,
      changeable:    false,
      baggageInfo:   { cabin: '1 × 7kg', checked: '1 × 23kg', included: true },
      seatsLeft:     11,
      co2Kg:         340,
    },
  ]

  return results
}

export const MOCK_ITINERARY = generateMockResults('LHR', 'LOS', 'ECONOMY', 1)[0]
