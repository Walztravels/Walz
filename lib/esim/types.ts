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
