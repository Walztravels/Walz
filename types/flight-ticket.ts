export interface FlightLeg {
  flightNumber: string
  airline: string
  aircraft?: string
  operatedBy?: string
  departureCode: string
  departureCity: string
  departureAirport: string
  departureCountry: string
  departureTerminal?: string
  departureDate: string
  departureTime: string
  arrivalCode: string
  arrivalCity: string
  arrivalAirport: string
  arrivalCountry: string
  arrivalTerminal?: string
  arrivalDate: string
  arrivalTime: string
  arrivalNextDay?: boolean
  duration: string
  cabinClass: string
  baggage: string
  seat?: string
  mealPreference?: string
  connectionTime?: string
}

export interface Passenger {
  title: string
  firstName: string
  lastName: string
  eTicketNumber?: string
  cabinClass: string
  seat?: string
  meal?: string
  passport?: string
  nationality?: string
  dob?: string
  frequentFlyer?: string
}

export interface PricingBreakdown {
  currency: string
  currencySymbol: string
  baseFare: number
  taxes: number
  carrierFees?: number
  total: number
  passengerCount: number
  grandTotal: number
  lineItems?: { label: string; amount: number }[]
}

export interface FlightTicketEmailProps {
  reference: string
  pnr: string
  issueDate: string
  issuedBy: string
  title: string
  firstName: string
  lastName: string
  email: string
  phone: string
  outbound: FlightLeg[]
  inbound: FlightLeg[]
  tripType: 'one-way' | 'return'
  passengers: Passenger[]
  pricing?: PricingBreakdown
  agentMessage?: string
}
