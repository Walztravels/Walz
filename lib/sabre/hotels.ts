import { sabreRequest, SabreError } from './auth'
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/redis'
import type { SabreHotelResponse, HotelAvailResult, HotelProperty } from '@/types/sabre'
import type { HotelResult, HotelAmenity } from '@/types/booking'

export interface HotelSearchParams {
  destination: string
  checkIn: string
  checkOut: string
  rooms?: number
  adults?: number
  children?: number
  currency?: string
  maxResults?: number
  starRating?: number[]
  hotelChains?: string[]
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelResult[]> {
  const cacheKey = CACHE_KEYS.hotelSearch(JSON.stringify(params))
  const cached = await cacheGet<HotelResult[]>(cacheKey)
  if (cached) return cached

  const {
    destination,
    checkIn,
    checkOut,
    rooms = 1,
    adults = 2,
    children = 0,
    currency = 'GBP',
    maxResults = 20,
    starRating,
    hotelChains,
  } = params

  const guestCounts = [{ NumAdults: adults }]
  if (children > 0) {
    guestCounts[0] = { ...guestCounts[0], NumChildren: children } as typeof guestCounts[0]
  }

  const payload = {
    GetHotelAvailRQ: {
      POS: {
        Source: {
          PseudoCityCode: process.env.SABRE_PCC || 'LHRGB28IT',
          RequestorID: {
            ID: 'WalzTravels',
            Type: '1',
          },
        },
      },
      SearchCriteria: {
        GeoSearch: {
          GeoRef: {
            Radius: 25,
            UOM: 'KM',
            RefPoint: {
              Value: destination,
              ValueContext: 'CODE',
            },
          },
        },
        RatePlanCandidates: {
          RatePlanCandidate: [
            {
              CurrencyCode: currency,
            },
          ],
        },
        PropertyTypeList: {
          PropertyType: 'Hotel',
        },
        ...(starRating && starRating.length > 0
          ? {
              HotelAmenity: starRating.map((star) => ({
                Code: String(star * 10),
              })),
            }
          : {}),
        ...(hotelChains && hotelChains.length > 0
          ? {
              HotelChain: hotelChains.map((chain) => ({ Code: chain })),
            }
          : {}),
      },
      Criteria: {
        Criterion: {
          StayDateRange: {
            Start: checkIn,
            End: checkOut,
          },
          RoomStayCandidates: {
            RoomStayCandidate: Array(rooms)
              .fill(null)
              .map((_, idx) => ({
                Quantity: 1,
                RPH: String(idx + 1),
                GuestCounts: { GuestCount: guestCounts },
              })),
          },
        },
      },
      TPA_Extensions: {
        MaxSearchResults: maxResults,
        ReturnPropertyInfo: true,
        ReturnRateDetails: true,
        SortBy: 'PRICE',
      },
    },
  }

  const response = await sabreRequest<SabreHotelResponse>(
    '/v3.0/hotel/availability',
    {
      method: 'POST',
      body: payload,
    }
  )

  const appResults = response.GetHotelAvailRS.ApplicationResults
  if (appResults?.Error && appResults.Error.length > 0) {
    const errorMsg = appResults.Error[0]?.SystemSpecificResults?.[0]?.Message?.[0]?.value
    throw new SabreError(errorMsg || 'Hotel search failed', 400)
  }

  const hotelResults = response.GetHotelAvailRS.Result || []

  const nights = calculateNights(checkIn, checkOut)
  const results = hotelResults.map((result, index) =>
    transformHotelResult(result, index, nights, currency)
  )

  await cacheSet(cacheKey, results, 300) // 5-minute cache
  return results
}

function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const diff = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function transformHotelResult(
  result: HotelAvailResult,
  index: number,
  nights: number,
  defaultCurrency: string
): HotelResult {
  const property: HotelProperty = result.HotelProperty
  const extensions = property.TPA_Extensions

  // Extract price
  let pricePerNight = 0
  let totalPrice = 0
  let currency = defaultCurrency
  let isRefundable = true
  let roomType: string | undefined
  let mealPlan: string | undefined

  if (result.RoomRates?.RoomRate && result.RoomRates.RoomRate.length > 0) {
    const roomRate = result.RoomRates.RoomRate[0]
    pricePerNight = roomRate.MinimumRate
    totalPrice = roomRate.HotelTotalPriceAfterTax || roomRate.MinimumRate * nights
    currency = roomRate.CurrencyCode
    isRefundable = roomRate.RefundableBookingIndicator
    roomType = roomRate.RoomDescription?.Text?.[0]
    mealPlan = roomRate.MealPlanIndicator

    if (roomRate.CancelPenalties?.CancelPenalty) {
      isRefundable = roomRate.CancelPenalties.CancelPenalty[0]?.RefundableIndicator ?? true
    }
  } else if (result.Rates?.Rate && result.Rates.Rate.length > 0) {
    const rate = result.Rates.Rate[0]
    pricePerNight = rate.AmountAfterTax || rate.AmountBeforeTax || 0
    totalPrice = rate.HotelTotalPriceAfterTax || pricePerNight * nights
    currency = rate.CurrencyCode
  }

  // Extract address
  const locationDesc = property.LocationDescription
  const rawAddr = locationDesc?.Address
  const address = rawAddr
    ? {
        lines: rawAddr.AddressLine || [],
        city: rawAddr.CityName?.content || '',
        country: rawAddr.CountryName?.content || '',
        postcode: rawAddr.PostalCode,
      }
    : { lines: [], city: '', country: '' }

  // Extract star rating from property class
  const stars = extractStarRating(extensions?.PropertyClassType?.ClassCode)

  // Extract amenities
  const amenities: HotelAmenity[] = (extensions?.Amenities?.Amenity || []).map((a) => ({
    code: a.Code,
    description: a.Description,
  }))

  // Extract images
  const images: string[] = (extensions?.Images?.Image || [])
    .filter((img) => img.url)
    .map((img) => img.url)
    .slice(0, 5)

  // Fallback images from Unsplash
  if (images.length === 0) {
    images.push(
      `https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80`
    )
  }

  // Extract rating
  const ratingData = extensions?.Rating
  const rating = ratingData?.bubbles || undefined
  const reviewCount = ratingData?.count || undefined

  return {
    id: `hotel-${index}-${property.HotelCode}`,
    hotelCode: property.HotelCode,
    chainCode: property.ChainCode,
    name: property.HotelName,
    address,
    stars,
    pricePerNight: {
      amount: pricePerNight,
      currency,
    },
    totalPrice: {
      amount: totalPrice,
      currency,
    },
    amenities,
    images,
    rating,
    reviewCount,
    isRefundable,
    roomType,
    mealPlan,
  }
}

function extractStarRating(classCode?: string): number {
  if (!classCode) return 3
  const code = parseInt(classCode, 10)
  if (isNaN(code)) return 3
  // Sabre typically uses 10-50 for 1-5 stars
  if (code >= 10 && code <= 50) return Math.floor(code / 10)
  if (code >= 1 && code <= 5) return code
  return 3
}

export function transformHotelResults(
  response: SabreHotelResponse,
  nights = 1,
  currency = 'GBP'
): HotelResult[] {
  const results = response.GetHotelAvailRS.Result || []
  return results.map((result, index) =>
    transformHotelResult(result, index, nights, currency)
  )
}
