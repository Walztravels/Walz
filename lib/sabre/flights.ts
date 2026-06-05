import { sabreRequest, SabreError } from './auth'
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/redis'
import type {
  SabreFlightResponse,
  PricedItinerary,
  OriginDestinationOption,
  AirItineraryPricingInfo,
  FlightSegment,
} from '@/types/sabre'
import type { FlightResult, FlightSegmentResult, CabinClass } from '@/types/booking'

export interface FlightSearchParams {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children?: number
  infants?: number
  cabinClass?: CabinClass
  directOnly?: boolean
  currency?: string
  maxResults?: number
}

const CABIN_CLASS_MAP: Record<CabinClass, string> = {
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'S',
  BUSINESS: 'C',
  FIRST: 'F',
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightResult[]> {
  const cacheKey = CACHE_KEYS.flightSearch(JSON.stringify(params))
  const cached = await cacheGet<FlightResult[]>(cacheKey)
  if (cached) return cached

  const {
    origin,
    destination,
    departureDate,
    returnDate,
    adults = 1,
    children = 0,
    infants = 0,
    cabinClass = 'ECONOMY',
    directOnly = false,
    currency = 'GBP',
    maxResults = 50,
  } = params

  const passengerTypeQuantities = []
  if (adults > 0) passengerTypeQuantities.push({ Code: 'ADT', Quantity: adults })
  if (children > 0) passengerTypeQuantities.push({ Code: 'CNN', Quantity: children })
  if (infants > 0) passengerTypeQuantities.push({ Code: 'INF', Quantity: infants })

  const originDestinationInformation = [
    {
      RPH: '1',
      DepartureDateTime: `${departureDate}T00:00:00`,
      OriginLocation: { LocationCode: origin },
      DestinationLocation: { LocationCode: destination },
      TPA_Extensions: directOnly
        ? {
            SegmentType: { Code: 'O' },
            NumStopsCode: { NumStops: '0' },
          }
        : undefined,
    },
  ]

  if (returnDate) {
    originDestinationInformation.push({
      RPH: '2',
      DepartureDateTime: `${returnDate}T00:00:00`,
      OriginLocation: { LocationCode: destination },
      DestinationLocation: { LocationCode: origin },
      TPA_Extensions: directOnly
        ? {
            SegmentType: { Code: 'O' },
            NumStopsCode: { NumStops: '0' },
          }
        : undefined,
    })
  }

  const payload = {
    OTA_AirLowFareSearchRQ: {
      Version: '4',
      POS: {
        Source: [
          {
            PseudoCityCode: process.env.SABRE_PCC || 'LHRGB28IT',
            RequestorID: {
              Type: '1',
              ID: 'WalzTravels',
              CompanyName: { Code: 'TN' },
            },
          },
        ],
      },
      OriginDestinationInformation: originDestinationInformation,
      TravelPreferences: {
        MaxStopsQuantity: directOnly ? 0 : 3,
        CabinPref: [
          {
            Cabin: CABIN_CLASS_MAP[cabinClass],
            PreferLevel: 'Preferred',
          },
        ],
        VendorPref: [],
        TPA_Extensions: {
          TripType: { Value: returnDate ? 'Return' : 'OneWay' },
          LongConnectTime: { Enable: true, Min: 0, Max: 0 },
          ExcludeCallDirectCarriers: { Enabled: true },
        },
      },
      TravelerInfoSummary: {
        SeatsRequested: [adults + children],
        AirTravelerAvail: [
          {
            PassengerTypeQuantity: passengerTypeQuantities,
          },
        ],
        PriceRequestInformation: {
          CurrencyCode: currency,
          TPA_Extensions: {
            BrandedFareIndicators: {
              ReturnBrandAncillaries: true,
              SingleBrandedFare: true,
            },
          },
        },
      },
      TPA_Extensions: {
        IntelliSellTransaction: {
          RequestedNumberOfItineraries: { Value: String(maxResults) },
        },
      },
    },
  }

  const response = await sabreRequest<SabreFlightResponse>(
    '/v4/offers/shop',
    {
      method: 'POST',
      body: payload,
    }
  )

  if (response.OTA_AirLowFareSearchRS.Errors) {
    const errors = response.OTA_AirLowFareSearchRS.Errors.Error
    throw new SabreError(
      errors.map((e) => e.ShortText).join(', '),
      400,
      errors[0]?.Code
    )
  }

  const itineraries = response.OTA_AirLowFareSearchRS.PricedItineraries?.PricedItinerary || []
  const results = itineraries.map((itinerary, index) =>
    transformFlightResult(itinerary, index, adults + children + infants)
  )

  await cacheSet(cacheKey, results, 300) // 5-minute cache
  return results
}

function transformFlightResult(
  itinerary: PricedItinerary,
  index: number,
  totalPassengers: number
): FlightResult {
  const originDestOptions =
    itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption

  const outboundOption: OriginDestinationOption = originDestOptions[0]
  const inboundOption: OriginDestinationOption | undefined = originDestOptions[1]

  const outbound = outboundOption.FlightSegment.map(transformSegment)
  const inbound = inboundOption?.FlightSegment.map(transformSegment)

  const pricingInfo = Array.isArray(itinerary.AirItineraryPricingInfo)
    ? itinerary.AirItineraryPricingInfo[0]
    : itinerary.AirItineraryPricingInfo

  const totalFare = pricingInfo.ItinTotalFare.TotalFare
  const totalAmount = totalFare.Amount
  const perPerson = totalPassengers > 0 ? totalAmount / totalPassengers : totalAmount

  const stops =
    outboundOption.FlightSegment.reduce(
      (acc: number, seg: FlightSegment) => acc + seg.StopQuantity,
      outboundOption.FlightSegment.length - 1
    )

  const totalDuration = outboundOption.ElapsedTime

  const validatingCarrier =
    itinerary.TPA_Extensions?.ValidatingCarrier?.Default?.Code ||
    outboundOption.FlightSegment[0].MarketingAirline.Code

  const firstPricingSegment = (
    Array.isArray(pricingInfo.PTC_FareBreakdowns?.PTC_FareBreakdown)
      ? pricingInfo.PTC_FareBreakdowns!.PTC_FareBreakdown[0]
      : pricingInfo.PTC_FareBreakdowns?.PTC_FareBreakdown
  )

  const isRefundable = firstPricingSegment?.Endorsements?.NonRefundableIndicator !== true

  const seatsInfo = pricingInfo.FareInfos?.FareInfo?.[0]?.TPA_Extensions?.SeatsRemaining

  return {
    id: `flight-${index}-${Date.now()}`,
    outbound,
    inbound,
    price: {
      amount: totalAmount,
      currency: totalFare.CurrencyCode,
      perPerson,
    },
    stops,
    totalDuration,
    cabinClass: getCabinClassFromCode(outboundOption.FlightSegment[0].ResBookDesigCode),
    seatsRemaining: seatsInfo?.Number,
    isRefundable,
    validatingCarrier,
    baggage: {
      carry: '1 x 7kg',
      checked: '1 x 23kg',
    },
  }
}

function transformSegment(segment: FlightSegment): FlightSegmentResult {
  return {
    departureAirport: segment.DepartureAirport.LocationCode,
    arrivalAirport: segment.ArrivalAirport.LocationCode,
    departureTime: segment.DepartureDateTime,
    arrivalTime: segment.ArrivalDateTime,
    airline: segment.OperatingAirline.CompanyShortName || segment.OperatingAirline.Code,
    airlineCode: segment.OperatingAirline.Code,
    flightNumber: `${segment.MarketingAirline.Code}${segment.OperatingAirline.FlightNumber}`,
    duration: segment.ElapsedTime,
    aircraft: segment.Equipment?.[0]?.AirEquipType,
    cabinClass: getCabinClassFromCode(segment.ResBookDesigCode),
    bookingCode: segment.ResBookDesigCode,
  }
}

function getCabinClassFromCode(code: string): CabinClass {
  const businessCodes = ['C', 'D', 'I', 'J', 'Z']
  const firstCodes = ['F', 'A', 'P']
  const premiumCodes = ['S', 'W']

  if (firstCodes.includes(code)) return 'FIRST'
  if (businessCodes.includes(code)) return 'BUSINESS'
  if (premiumCodes.includes(code)) return 'PREMIUM_ECONOMY'
  return 'ECONOMY'
}

export function transformFlightResults(response: SabreFlightResponse): FlightResult[] {
  const itineraries = response.OTA_AirLowFareSearchRS.PricedItineraries?.PricedItinerary || []
  return itineraries.map((itinerary, index) => transformFlightResult(itinerary, index, 1))
}

export type { SabreFlightResponse, AirItineraryPricingInfo }
