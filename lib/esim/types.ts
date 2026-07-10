export interface EsimPackage {
  packageCode:  string
  name:         string
  slug:         string
  locationCode: string
  locationName: string
  durationDays: number
  dataLabel:    string
  dataAmount:   number | null
  dataUnit:     string
  wholesaleUsd: number
  retailUsd:    number
  marginUsd:    number
  speed:        string
  // Plan type fields (from Airalo — optional for back-compat with legacy parsers)
  isUnlimited?: boolean
  voice?:       string | null   // non-null means voice calls included (e.g. "Unlimited" or "60 min")
  text?:        string | null   // non-null means SMS included
}

export interface CountryGroup {
  code:     string
  name:     string
  flag:     string
  region:   string
  packages: EsimPackage[]
  minPrice: number
}

export interface CartItem {
  pkg:     EsimPackage
  country: CountryGroup
}

export interface Toast {
  id:      string
  message: string
  type:    'success' | 'error' | 'info'
}
