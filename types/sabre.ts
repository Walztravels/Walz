// Sabre API TypeScript interfaces

export interface SabreTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// Flight Search Response Types
export interface SabreFlightResponse {
  OTA_AirLowFareSearchRS: OTAAirLowFareSearchRS
}

export interface OTAAirLowFareSearchRS {
  Success?: Record<string, unknown>
  Errors?: SabreErrors
  PricedItineraries?: {
    PricedItinerary: PricedItinerary[]
  }
  TPA_Extensions?: Record<string, unknown>
}

export interface SabreErrors {
  Error: Array<{
    Code: string
    ShortText: string
    Type: string
  }>
}

export interface PricedItinerary {
  SequenceNumber: number
  AirItinerary: AirItinerary
  AirItineraryPricingInfo: AirItineraryPricingInfo | AirItineraryPricingInfo[]
  TPA_Extensions?: TpaExtensions
}

export interface AirItinerary {
  DirectionInd: 'OneWay' | 'Return' | 'Circle'
  OriginDestinationOptions: {
    OriginDestinationOption: OriginDestinationOption[]
  }
}

export interface OriginDestinationOption {
  ElapsedTime: number
  FlightSegment: FlightSegment[]
}

export interface FlightSegment {
  DepartureAirport: { LocationCode: string }
  ArrivalAirport: { LocationCode: string }
  OperatingAirline: {
    Code: string
    FlightNumber: string
    CompanyShortName?: string
  }
  Equipment?: Array<{ AirEquipType: string }>
  MarketingAirline: { Code: string }
  DepartureDateTime: string
  ArrivalDateTime: string
  StopQuantity: number
  ElapsedTime: number
  ResBookDesigCode: string
  Status: string
  TPA_Extensions?: {
    eTicket?: { Ind: boolean }
    Mileage?: { Amount: number }
  }
}

export interface AirItineraryPricingInfo {
  SolutionID?: string
  Taxes?: {
    Tax: Array<{
      TaxCode: string
      Amount: number
      CurrencyCode: string
      DecimalPlaces: number
      TaxShortDescription: string
    }>
  }
  ItinTotalFare: ItinTotalFare
  PTC_FareBreakdowns?: {
    PTC_FareBreakdown: PTCFareBreakdown | PTCFareBreakdown[]
  }
  FareInfos?: {
    FareInfo: FareInfo[]
  }
}

export interface ItinTotalFare {
  BaseFare: {
    Amount: number
    CurrencyCode: string
    DecimalPlaces: number
  }
  Taxes?: {
    Tax: Array<{
      TaxCode: string
      Amount: number
      CurrencyCode: string
    }>
    TotalTax: {
      Amount: number
      CurrencyCode: string
    }
  }
  TotalFare: {
    Amount: number
    CurrencyCode: string
    DecimalPlaces: number
  }
}

export interface PTCFareBreakdown {
  PassengerTypeQuantity: {
    Code: string
    Quantity: number
  }
  FareBasisCodes: {
    FareBasisCode: Array<{
      BookingCode: string
      AvailabilityBreak: boolean
      DepartureAirportCode: string
      ArrivalAirportCode: string
      content: string
    }>
  }
  PassengerFare: {
    BaseFare: { Amount: number; CurrencyCode: string }
    Taxes: { Tax: Array<{ TaxCode: string; Amount: number; CurrencyCode: string }> }
    TotalFare: { Amount: number; CurrencyCode: string }
    TPA_Extensions?: Record<string, unknown>
  }
  Endorsements?: { NonRefundableIndicator: boolean }
}

export interface FareInfo {
  FareReference: string
  TPA_Extensions?: {
    SeatsRemaining?: { Number: number; BelowMin: boolean }
    Cabin?: { Cabin: string }
    Meal?: Array<{ Code: string }>
  }
}

export interface TpaExtensions {
  ValidatingCarrier?: {
    NewVcxProcess: boolean
    Default: { Code: string }
  }
  DiversitySwapper?: { WeighedPriceAmount: number }
}

// Hotel Search Response Types
export interface SabreHotelResponse {
  GetHotelAvailRS: GetHotelAvailRS
}

export interface GetHotelAvailRS {
  ApplicationResults?: {
    Success: Array<{ timeStamp: string }>
    Error?: Array<{
      timeStamp: string
      type: string
      SystemSpecificResults: Array<{
        Message: Array<{ type: string; value: string }>
      }>
    }>
  }
  Result: HotelAvailResult[]
}

export interface HotelAvailResult {
  HotelProperty: HotelProperty
  Rates?: {
    Rate: HotelRate[]
  }
  RoomRates?: {
    RoomRate: RoomRate[]
  }
  SpecialOffers?: Array<{
    Text: string
    Type: string
  }>
}

export interface HotelProperty {
  ChainCode: string
  HotelCode: string
  HotelName: string
  LocationDescription?: {
    Address: {
      AddressLine: string[]
      CityName: { content: string }
      CountryName: { Code: string; content: string }
      PostalCode: string
      StateProv?: { StateCode: string }
    }
    Distance?: { Distance: number; Direction: string }
  }
  TPA_Extensions?: {
    Latitude?: { Value: string }
    Longitude?: { Value: string }
    Rating?: { type: string; bubbles: number; count: number }
    HotelPreference?: {
      PreferLevelCode: string
      CarrierCode: string
    }
    Amenities?: {
      Amenity: Array<{ Code: string; Description: string }>
    }
    PropertyClassType?: { ClassCode: string; Description: string }
    HotelType?: { TypeCode: string }
    Images?: {
      Image: Array<{ Category: string; url: string }>
    }
  }
}

export interface HotelRate {
  AmountBeforeTax?: number
  AmountAfterTax?: number
  CurrencyCode: string
  DecimalPlaces: number
  HotelTotalPriceBeforeTax?: number
  HotelTotalPriceAfterTax?: number
  Commission?: { NonCommission: boolean; Percent: number }
  RateConversionInd?: boolean
  DirectConnect?: boolean
}

export interface RoomRate {
  BookingCode: string
  RoomTypeCode: string
  RoomNights: string
  NumberOfRooms: number
  GuaranteeRequired: boolean
  RefundableBookingIndicator: boolean
  RatePlanCode: string
  MinimumRate: number
  MaximumRate?: number
  CurrencyCode: string
  DecimalPlaces: number
  HotelTotalPriceBeforeTax: number
  HotelTotalPriceAfterTax: number
  MealPlanIndicator?: string
  RoomDescription?: { Text: string[] }
  CancelPenalties?: {
    CancelPenalty: Array<{
      RefundableIndicator: boolean
      Deadline?: { OffsetTimeUnit: string; OffsetUnitMultiplier: string }
    }>
  }
}

// PNR / Booking Response Types
export interface SabrePNRResponse {
  CreatePassengerNameRecordRS: {
    ApplicationResults?: {
      status: string
      Success?: Array<{ timeStamp: string }>
      Error?: Array<{
        timeStamp: string
        type: string
        SystemSpecificResults: Array<{
          Message: Array<{ code?: string; content?: string; value?: string; type?: string }>
        }>
      }>
      Warning?: Array<{
        timeStamp: string
        type: string
        SystemSpecificResults: Array<{
          Message: Array<{ code?: string; content?: string; value?: string }>
        }>
      }>
    }
    // v2.3.0 API wraps the PNR in TravelItineraryRead
    TravelItineraryRead?: {
      TravelItinerary?: {
        ItineraryRef?: {
          ID?: string
          AirExtras?: boolean
          InhibitCode?: string
          PartitionID?: string
          PrimeHostID?: string
          Source?: {
            PseudoCityCode?: string
            ReceivedFrom?: string
          }
          CustomerIdentifier?: string
        }
        CustomerInfo?: {
          PersonName?: Array<{
            NameNumber: string
            GivenName: string
            Surname: string
          }>
        }
      }
    }
    PassengerReservation?: {
      Passengers?: {
        Passenger: Array<{
          nameId: string
          nameAssocId: string
          uID: string
          FirstName: string
          LastName: string
          type: string
        }>
      }
      Segments?: {
        Air: Array<{
          departureDateTimeRaw: string
          arrivalDateTimeRaw: string
          origin: string
          destination: string
          marketingAirlineCode: string
          marketingFlightNumber: string
          classOfService: string
          actionCode: string
          numberOfSeats: string
          SegmentSpecialRequests?: Record<string, unknown>
        }>
      }
    }
  }
}

export interface SabrePNRDetailsResponse {
  GetReservationRS?: {
    Reservation?: {
      Passengers?: {
        Passenger: Array<{
          NameID: string
          FirstName: string
          LastName: string
        }>
      }
      FlightSegments?: {
        FlightSegment: FlightSegment[]
      }
      Prices?: {
        TotalAmount: { Amount: number; CurrencyCode: string }
      }
    }
  }
}
