export interface FlightExtra {
  id:          string
  name:        string
  category:    string
  description: string
  price:       number
  currency:    string
  photoUrl:    string
  enabled:     boolean
  popular:     boolean
  perPerson:   boolean
  livePriced:  boolean
  sortOrder:   number
}

export const DEFAULT_EXTRAS: FlightExtra[] = [
  { id: 'transfer',  name: 'Airport Transfer',     category: 'Transport',   price: 45,  currency: 'GBP', enabled: true,  popular: true,  perPerson: false, livePriced: true,  sortOrder: 0, description: 'Private car to/from airport',        photoUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&h=300&fit=crop&q=80' },
  { id: 'lounge',    name: 'Airport Lounge',       category: 'Comfort',     price: 35,  currency: 'GBP', enabled: true,  popular: true,  perPerson: true,  livePriced: true,  sortOrder: 1, description: 'Access 1,300+ lounges worldwide',     photoUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=300&fit=crop&q=80' },
  { id: 'insurance', name: 'Travel Insurance',     category: 'Protection',  price: 24,  currency: 'GBP', enabled: true,  popular: false, perPerson: false, livePriced: false, sortOrder: 2, description: 'Comprehensive cover for your trip',   photoUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop&q=80' },
  { id: 'upgrade',   name: 'Cabin Upgrade',        category: 'Comfort',     price: 189, currency: 'GBP', enabled: true,  popular: false, perPerson: false, livePriced: false, sortOrder: 3, description: 'Upgrade to next cabin class',         photoUrl: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400&h=300&fit=crop&q=80' },
  { id: 'fasttrack', name: 'Fast Track Security',  category: 'Convenience', price: 18,  currency: 'GBP', enabled: true,  popular: false, perPerson: true,  livePriced: true,  sortOrder: 4, description: 'Skip the queues, save time',          photoUrl: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400&h=300&fit=crop&q=80' },
  { id: 'meetgreet', name: 'Meet & Greet',         category: 'Convenience', price: 55,  currency: 'GBP', enabled: true,  popular: true,  perPerson: true,  livePriced: true,  sortOrder: 5, description: 'Personal escort from gate to exit',   photoUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&h=300&fit=crop&q=80' },
  { id: 'baggage',   name: 'Extra Baggage (23kg)', category: 'Baggage',     price: 55,  currency: 'GBP', enabled: true,  popular: false, perPerson: false, livePriced: false, sortOrder: 6, description: '23kg checked bag — pre-paid',         photoUrl: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400&h=300&fit=crop&q=80' },
  { id: 'esim',      name: 'Jade Connect eSIM',    category: 'Technology',  price: 9,   currency: 'GBP', enabled: true,  popular: false, perPerson: false, livePriced: false, sortOrder: 7, description: 'Data in 150+ countries from $9.99',   photoUrl: 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=400&h=300&fit=crop&q=80' },
  { id: 'visa',      name: 'Visa Service',         category: 'Documents',   price: 99,  currency: 'GBP', enabled: false, popular: false, perPerson: false, livePriced: false, sortOrder: 8, description: 'We handle your visa application',     photoUrl: 'https://images.unsplash.com/photo-1590099033615-be195f8d575c?w=400&h=300&fit=crop&q=80' },
]
