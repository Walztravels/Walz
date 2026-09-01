// Poster compositor data types and defaults — no JSX, safe to import in tests.

export interface PosterLayer {
  text:       string
  x:          number
  y:          number
  fontSize:   number
  fontWeight: '400' | '600' | '700' | '800'
  color:      string
  align:      'left' | 'center' | 'right'
  visible:    boolean
  maxWidth?:  number
}

export interface PosterData {
  headline:    PosterLayer
  subheadline: PosterLayer
  route:       PosterLayer
  price:       PosterLayer
  currency:    PosterLayer
  cta:         PosterLayer
  terms:       PosterLayer
  contact:     PosterLayer
  logo:        PosterLayer
}

// Layers that must come from staff input only — AI must never set these
export const COMMERCIAL_LAYERS: Array<keyof PosterData> = ['price', 'currency', 'route']

export function defaultPosterData(): PosterData {
  return {
    logo:        { text: 'WALZ TRAVELS', x: 0.5, y: 0.06, fontSize: 32, fontWeight: '800', color: '#ffffff', align: 'center', visible: true },
    headline:    { text: '',             x: 0.5, y: 0.35, fontSize: 72, fontWeight: '800', color: '#ffffff', align: 'center', visible: true, maxWidth: 0.88 },
    subheadline: { text: '',             x: 0.5, y: 0.47, fontSize: 36, fontWeight: '400', color: '#f0e8cc', align: 'center', visible: true, maxWidth: 0.84 },
    route:       { text: '',             x: 0.5, y: 0.57, fontSize: 28, fontWeight: '600', color: '#d4af37', align: 'center', visible: true },
    price:       { text: '',             x: 0.5, y: 0.67, fontSize: 96, fontWeight: '800', color: '#ffffff', align: 'center', visible: true },
    currency:    { text: 'NGN',          x: 0.25, y: 0.67, fontSize: 28, fontWeight: '600', color: '#d4af37', align: 'left',   visible: true },
    cta:         { text: '',             x: 0.5, y: 0.80, fontSize: 32, fontWeight: '700', color: '#1a1a2e', align: 'center', visible: true },
    terms:       { text: '',             x: 0.5, y: 0.92, fontSize: 18, fontWeight: '400', color: '#c0c0c0', align: 'center', visible: true, maxWidth: 0.9 },
    contact:     { text: '',             x: 0.5, y: 0.96, fontSize: 20, fontWeight: '600', color: '#d4af37', align: 'center', visible: true },
  }
}
