import { sabreRequest, SabreError } from './auth'
import type { SabreFlightResponse } from '@/types/sabre'
import type { WalzFlight, SabreMatchResult } from '@/lib/types/flight'
import type { CabinClass } from '@/types/booking'

const CABIN_CLASS_MAP: Record<CabinClass, string> = {
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'S',
  BUSINESS: 'C',
  FIRST: 'F',
}

/**
 * Given a WalzFlight selected by the user (sourced from Google or Skyscanner),
 * find the same flight in Sabre so we can create a real bookable PNR.
 *
 * Strategy:
 * 1. Run a targeted Sabre shop for the exact route + date
 * 2. Exact match: same marketing flight number on outbound first segment
 * 3. Fallback: same airline + earliest departure within ±90 minutes
 */
export async function matchFlightInSabre(
  flight: WalzFlight,
  adults: number,
  currency = 'GBP'
): Promise<SabreMatchResult> {
  const firstSeg = flight.outbound[0]
  if (!firstSeg) {
    return { bookable: false, reason: 'No outbound segment on flight' }
  }

  const origin = firstSeg.departureAirport
  const destination = flight.outbound[flight.outbound.length - 1].arrivalAirport
  const departureDate = firstSeg.departureTime.slice(0, 10)
  const targetFlightNumber = firstSeg.flightNumber.replace(/\s+/g, '')
  const targetAirline = firstSeg.airlineCode

  const payload = {
    OTA_AirLowFareSearchRQ: {
      Version: '4',
      POS: {
        Source: [
          {
            PseudoCityCode: process.env.SABRE_PCC || 'RR9K',
            RequestorID: {
              Type: '1',
              ID: 'WalzTravels',
              CompanyName: { Code: 'TN' },
            },
          },
        ],
      },
      OriginDestinationInformation: [
        {
          RPH: '1',
          DepartureDateTime: `${departureDate}T00:00:00`,
          OriginLocation: { LocationCode: origin },
          DestinationLocation: { LocationCode: destination },
          TPA_Extensions: {
            // Ask Sabre for the specific carrier to narrow results
            IncludeVendorPref: [{ Code: targetAirline }],
          },
        },
      ],
      TravelPreferences: {
        MaxStopsQuantity: flight.stops,
        CabinPref: [
          {
            Cabin: CABIN_CLASS_MAP[flight.cabinClass] ?? 'Y',
            PreferLevel: 'Preferred',
          },
        ],
        VendorPref: [{ Code: targetAirline, PreferLevel: 'Preferred' }],
      },
      TravelerInfoSummary: {
        SeatsRequested: [adults],
        AirTravelerAvail: [
          {
            PassengerTypeQuantity: [{ Code: 'ADT', Quantity: adults }],
          },
        ],
        PriceRequestInformation: {
          CurrencyCode: currency,
        },
      },
      TPA_Extensions: {
        IntelliSellTransaction: {
          RequestedNumberOfItineraries: { Value: '30' },
        },
      },
    },
  }

  let sabreResponse: SabreFlightResponse
  try {
    sabreResponse = await sabreRequest<SabreFlightResponse>('/v4/offers/shop', {
      method: 'POST',
      body: payload,
    })
  } catch (err) {
    if (err instanceof SabreError) {
      return { bookable: false, reason: `Sabre error: ${err.message}` }
    }
    return { bookable: false, reason: 'Sabre unavailable' }
  }

  const itineraries =
    sabreResponse.OTA_AirLowFareSearchRS.PricedItineraries?.PricedItinerary ?? []

  if (itineraries.length === 0) {
    return { bookable: false, reason: 'No Sabre inventory for this route/date' }
  }

  const targetDepMs = new Date(firstSeg.departureTime).getTime()

  // Try exact match first
  let matchedItinerary = itineraries.find((itin) => {
    const firstFlightSeg =
      itin.AirItinerary.OriginDestinationOptions.OriginDestinationOption[0]?.FlightSegment[0]
    if (!firstFlightSeg) return false

    const sabreFlightNumber =
      `${firstFlightSeg.MarketingAirline.Code}${firstFlightSeg.OperatingAirline.FlightNumber}`.replace(
        /\s+/g,
        ''
      )
    return sabreFlightNumber === targetFlightNumber
  })

  // Fallback: same airline, closest departure within ±90 min
  if (!matchedItinerary) {
    let closestDeltaMs = 90 * 60 * 1000
    for (const itin of itineraries) {
      const firstFlightSeg =
        itin.AirItinerary.OriginDestinationOptions.OriginDestinationOption[0]?.FlightSegment[0]
      if (!firstFlightSeg) continue
      if (firstFlightSeg.MarketingAirline.Code !== targetAirline) continue

      const sabreDepMs = new Date(firstFlightSeg.DepartureDateTime).getTime()
      const delta = Math.abs(sabreDepMs - targetDepMs)
      if (delta < closestDeltaMs) {
        closestDeltaMs = delta
        matchedItinerary = itin
      }
    }
  }

  if (!matchedItinerary) {
    return {
      bookable: false,
      reason: `Flight ${targetFlightNumber} not found in Sabre inventory`,
    }
  }

  const pricingInfo = Array.isArray(matchedItinerary.AirItineraryPricingInfo)
    ? matchedItinerary.AirItineraryPricingInfo[0]
    : matchedItinerary.AirItineraryPricingInfo

  const sabreTotal = pricingInfo.ItinTotalFare.TotalFare.Amount
  const sabreCurrency = pricingInfo.ItinTotalFare.TotalFare.CurrencyCode
  const sabrePerPerson = adults > 0 ? sabreTotal / adults : sabreTotal

  const displayTotal = flight.displayPrice.amount
  const priceDiffPct =
    displayTotal > 0 ? Math.round(((sabreTotal - displayTotal) / displayTotal) * 100) : 0

  const sabreSolutionId = pricingInfo.SolutionID ?? matchedItinerary.SequenceNumber?.toString() ?? '0'

  return {
    bookable: true,
    sabrePrice: {
      amount: sabreTotal,
      currency: sabreCurrency,
      perPerson: sabrePerPerson,
    },
    sabreSolutionId,
    priceDiffPct,
  }
}
