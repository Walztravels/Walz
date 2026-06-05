import { sabreRequest, SabreError } from './auth'
import type { SabrePNRResponse, SabrePNRDetailsResponse } from '@/types/sabre'

export interface Passenger {
  type: 'ADT' | 'CHD' | 'INF'
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: 'M' | 'F'
  passportNumber: string
  passportExpiry: string
  nationality: string
  email?: string
  phone?: string
}

export interface BookingDetails {
  originDestOptions: Array<{
    origin: string
    destination: string
    departureDateTime: string
    marketingAirline: string
    flightNumber: string
    classOfService: string
    status: string
    quantity: number
  }>
  passengers: Passenger[]
  contactEmail: string
  contactPhone?: string
  currency?: string
  priceQuote?: {
    amount: number
    currency: string
  }
}

export interface PNRResult {
  pnr: string
  status: string
  passengers: Array<{
    nameId: string
    firstName: string
    lastName: string
  }>
  segments: Array<{
    origin: string
    destination: string
    departureDate: string
    airline: string
    flightNumber: string
  }>
}

export async function createPNR(details: BookingDetails): Promise<PNRResult> {
  const { originDestOptions, passengers, contactEmail, contactPhone } = details

  const airSegments = originDestOptions.map((seg, idx) => ({
    OperatingAirlineCode: seg.marketingAirline,
    ClassOfService: seg.classOfService,
    DepartureDateTime: seg.departureDateTime,
    DestinationLocation: { LocationCode: seg.destination },
    FlightNumber: seg.flightNumber,
    MarketingAirlineCode: seg.marketingAirline,
    NumberInParty: String(passengers.filter((p) => p.type !== 'INF').length),
    OriginLocation: { LocationCode: seg.origin },
    ResBookDesigCode: seg.classOfService,
    SegmentAncillaries: {},
    Status: seg.status || 'NN',
    TPA_Extensions: {
      eTicket: { Ind: true },
      SegmentNumber: String(idx + 1),
    },
  }))

  const passengerData = passengers.map((pax, idx) => ({
    NameNumber: `${idx + 1}.1`,
    PassengerType: { Code: pax.type },
    PersonName: {
      NamePrefix: pax.gender === 'F' ? 'MRS' : 'MR',
      GivenName: pax.firstName.toUpperCase(),
      Surname: pax.lastName.toUpperCase(),
    },
    ...(pax.dateOfBirth && {
      DateOfBirth: { DateOfBirth: pax.dateOfBirth },
    }),
    ...(pax.passportNumber && {
      Passport: {
        ExpirationDate: pax.passportExpiry,
        NationalityCountry: { SubCode: pax.nationality },
        PassportNumber: pax.passportNumber,
        Type: 'P',
      },
    }),
    ...(pax.email && {
      Email: [
        {
          Address: pax.email,
          Type: 'HOME',
          NameNumber: `${idx + 1}.1`,
        },
      ],
    }),
  }))

  const contactInfo = {
    ContactNumber: [
      ...(contactPhone
        ? [
            {
              Phone: contactPhone,
              PhoneUseType: 'MOBILE',
              NameNumber: '1.1',
            },
          ]
        : []),
    ],
    PersonName: {
      GivenName: passengers[0].firstName.toUpperCase(),
      Surname: passengers[0].lastName.toUpperCase(),
    },
    Email: [
      {
        Address: contactEmail,
        Type: 'HOME',
        NameNumber: '1.1',
      },
    ],
  }

  const payload = {
    CreatePassengerNameRecordRQ: {
      version: '2.3.0',
      targetCity: process.env.SABRE_PCC || 'RR9K',
      haltOnAirPriceError: true,
      IgnoreOnError: false,
      AirBook: {
        RetryRebook: { Option: 'true' },
        HaltOnStatus: [
          { Code: 'NO' },
          { Code: 'NN' },
          { Code: 'UC' },
          { Code: 'US' },
        ],
        RedisplayReservation: true,
        OriginDestinationInformation: {
          FlightSegment: airSegments,
        },
      },
      AirPrice: [
        {
          PriceRequestInformation: {
            OptionalQualifiers: {
              FOP_Qualifiers: {
                BasicFOP: { Type: 'CC' },
              },
              PricingQualifiers: {
                PassengerType: passengers.map((p) => ({
                  Code: p.type,
                  Quantity: '1',
                })),
              },
            },
            Retain: true,
          },
        },
      ],
      TravelItineraryAddInfo: {
        AgencyInfo: {
          Address: {
            AddressLine: '2102, Office 17, The Metropolis Tower',
            CityName: 'Dubai',
            CountryCode: 'AE',
            PostalCode: '00000',
            StateCountyProv: { StateCode: 'DU' },
            StreetNmbr: 'Burj Khalifa Boulevard, Business Bay',
          },
          Ticketing: {
            TicketType: '7TAW',
          },
        },
        CustomerInfo: {
          ContactNumbers: {
            ContactNumber: [
              ...(contactPhone
                ? [
                    {
                      NameNumber: '1.1',
                      Phone: contactPhone.replace(/\D/g, ''),
                      PhoneUseType: 'H',
                    },
                  ]
                : []),
            ],
          },
          PersonName: passengers.map((p, idx) => ({
            NameNumber: `${idx + 1}.1`,
            PassengerType: p.type,
            GivenName: p.firstName.toUpperCase(),
            Surname: p.lastName.toUpperCase(),
          })),
          CustomerIdentifier: contactEmail,
        },
      },
      UpdatePassengerNameRecord: {
        Passengers: {
          Passenger: passengerData,
        },
      },
      SpecialReqDetails: {
        AddRemark: {
          RemarkInfo: {
            Remark: [
              {
                Type: 'General',
                Text: `WALZ TRAVELS BOOKING - ${new Date().toISOString()}`,
              },
              {
                Type: 'Historical',
                Text: `EMAIL: ${contactEmail}`,
              },
            ],
          },
        },
        SpecialService: {
          SpecialServiceInfo: {
            Service: [
              {
                SSR_Code: 'CTCE',
                PersonName: { NameNumber: '1.1' },
                Text: contactEmail.replace('@', '//'),
              },
              ...(contactPhone
                ? [
                    {
                      SSR_Code: 'CTCM',
                      PersonName: { NameNumber: '1.1' },
                      Text: contactPhone.replace(/\D/g, ''),
                    },
                  ]
                : []),
            ],
          },
        },
      },
      PostProcessing: {
        RedisplayReservation: {
          waitInterval: 100,
        },
        EndTransaction: {
          Source: {
            ReceivedFrom: 'WALZTRAVELS',
          },
        },
      },
    },
  }

  const response = await sabreRequest<SabrePNRResponse>(
    '/v2.3.0/passenger/records?mode=create',
    {
      method: 'POST',
      body: payload,
    }
  )

  const result = response.CreatePassengerNameRecordRS

  if (result.ApplicationResults?.Error && result.ApplicationResults.Error.length > 0) {
    const msg = result.ApplicationResults.Error[0]?.SystemSpecificResults?.[0]?.Message?.[0]
    const errorMsg = msg?.content || msg?.value || 'Failed to create PNR'
    throw new SabreError(errorMsg, 400)
  }

  // v2.3.0 returns the PNR locator inside TravelItineraryRead
  const pnr = result.TravelItineraryRead?.TravelItinerary?.ItineraryRef?.ID
  if (!pnr) {
    throw new SabreError('PNR not returned from Sabre', 500)
  }

  const paxList =
    result.PassengerReservation?.Passengers?.Passenger?.map((p) => ({
      nameId: p.nameId,
      firstName: p.FirstName,
      lastName: p.LastName,
    })) || []

  const segmentList =
    result.PassengerReservation?.Segments?.Air?.map((s) => ({
      origin: s.origin,
      destination: s.destination,
      departureDate: s.departureDateTimeRaw,
      airline: s.marketingAirlineCode,
      flightNumber: s.marketingFlightNumber,
    })) || []

  return {
    pnr,
    status: result.ApplicationResults?.status || 'Complete',
    passengers: paxList,
    segments: segmentList,
  }
}

export async function cancelPNR(pnr: string, reason?: string): Promise<{ success: boolean; message: string }> {
  const payload = {
    IgnoreTransactionRQ: {
      Version: '2.0.0',
      POS: {
        Source: {
          PseudoCityCode: process.env.SABRE_PCC || 'LHRGB28IT',
          RequestorID: {
            ID: 'WalzTravels',
            Type: '1',
          },
        },
      },
      Reservation: {
        Sabre: {
          Value: pnr,
        },
      },
      ...(reason && { CancelReasonCode: { Code: reason } }),
    },
  }

  await sabreRequest(
    '/v1.0.0/passenger/cancelrecords',
    {
      method: 'POST',
      body: payload,
    }
  )

  return {
    success: true,
    message: `PNR ${pnr} successfully cancelled`,
  }
}

export async function getPNRDetails(pnr: string): Promise<SabrePNRDetailsResponse> {
  const response = await sabreRequest<SabrePNRDetailsResponse>(
    `/v1.1.0/passenger/records?locator=${pnr}&returnItin=true`,
    {
      method: 'GET',
    }
  )

  return response
}
