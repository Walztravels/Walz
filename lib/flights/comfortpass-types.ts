// Shared types for ComfortPass API responses.
// Kept here (not in the API route) so client-side pages can import them
// without pulling in server-only modules (ioredis, Node.js built-ins).

export interface CPExtraPrice {
  extraId:     string    // our ID: 'lounge' | 'fasttrack' | 'transfer' | 'meetgreet'
  serviceCode: string    // ComfortPass service code
  name:        string
  price:       number    // raw amount in `currency`
  currency:    string
  perPerson:   boolean
}

export interface CPExtrasResult {
  airport:  string
  services: CPExtraPrice[]
}
