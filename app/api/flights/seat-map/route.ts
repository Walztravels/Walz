import { NextRequest, NextResponse } from 'next/server'
import { getSeatMap } from '@/lib/flights/duffel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type SeatType = 'window' | 'aisle' | 'middle' | 'extra-legroom' | 'business'

export interface SeatElement {
  designator:   string
  type:         SeatType
  available:    boolean
  priceGBP:     number
  row:          number
  col:          'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  extraLegroom: boolean
}

function generateMockSeatMap(): SeatElement[] {
  const seats: SeatElement[] = []
  const COLS: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'> = ['A', 'B', 'C', 'D', 'E', 'F']
  for (let row = 1; row <= 30; row++) {
    for (const col of COLS) {
      const isBusiness     = row <= 4
      const isExitRow      = row === 12 || row === 13
      const isWindow       = col === 'A' || col === 'F'
      const isAisle        = col === 'C' || col === 'D'
      const isExtraLegroom = isExitRow && !isBusiness

      let type: SeatType = 'middle'
      if (isBusiness)     type = 'business'
      else if (isExtraLegroom) type = 'extra-legroom'
      else if (isWindow)  type = 'window'
      else if (isAisle)   type = 'aisle'

      let priceGBP = 0
      if (isBusiness)     priceGBP = 0   // included
      else if (isExtraLegroom) priceGBP = 35
      else if (isWindow)  priceGBP = 20
      else if (isAisle)   priceGBP = 15
      else                priceGBP = 10  // middle

      // ~45% randomly occupied — deterministic by row+col
      const seed     = row * 6 + COLS.indexOf(col)
      const available = (seed * 2654435761) % 100 >= 45

      seats.push({ designator: `${row}${col}`, type, available, priceGBP, row, col, extraLegroom: isExtraLegroom })
    }
  }
  return seats
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformDuffelSeatMap(data: any[]): SeatElement[] {
  const seats: SeatElement[] = []
  for (const seatMap of data) {
    for (const cabin of (seatMap.cabins ?? [])) {
      for (const row of (cabin.rows ?? [])) {
        const rowNum = parseInt(row.sections?.[0]?.elements?.[0]?.designator?.replace(/\D/g, '') ?? '0')
        for (const section of (row.sections ?? [])) {
          for (const el of (section.elements ?? [])) {
            if (el.type !== 'seat') continue
            const col = el.designator?.replace(/\d/g, '') as 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
            const isWindow = col === 'A' || col === 'F'
            const isAisle  = col === 'C' || col === 'D'
            let type: SeatType = 'middle'
            if (isWindow) type = 'window'
            else if (isAisle) type = 'aisle'

            const service   = el.available_services?.[0]
            const priceGBP  = service ? parseFloat(service.total_amount ?? '0') : 0
            const available = Array.isArray(el.available_services) && el.available_services.length > 0

            seats.push({
              designator:   el.designator ?? '',
              type,
              available,
              priceGBP,
              row:          rowNum,
              col,
              extraLegroom: el.name?.toLowerCase().includes('extra') ?? false,
            })
          }
        }
      }
    }
  }
  return seats
}

export async function GET(req: NextRequest) {
  const offerId = req.nextUrl.searchParams.get('offer_id') ?? ''

  if (offerId.startsWith('off_') && process.env.DUFFEL_API_KEY) {
    try {
      const data  = await getSeatMap(offerId)
      const seats = transformDuffelSeatMap(data)
      return NextResponse.json({ seats, source: 'duffel' })
    } catch (err) {
      console.error('[seat-map] Duffel error:', err)
    }
  }

  return NextResponse.json({ seats: generateMockSeatMap(), source: 'mock' })
}
