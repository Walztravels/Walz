export const DEFAULT_EXTRAS = [
  { id: 'transfer',  name: 'Airport Transfer',     category: 'Transport',   price: 45,  enabled: true,  popular: true,  description: 'Private car to/from airport',        photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&h=300&fit=crop&q=80' },
  { id: 'lounge',    name: 'Airport Lounge',       category: 'Comfort',     price: 35,  enabled: true,  popular: true,  description: 'Access 1,300+ lounges worldwide',     photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=300&fit=crop&q=80' },
  { id: 'insurance', name: 'Travel Insurance',     category: 'Protection',  price: 24,  enabled: true,  popular: false, description: 'Comprehensive cover for your trip',   photo: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=300&fit=crop&q=80' },
  { id: 'upgrade',   name: 'Cabin Upgrade',        category: 'Comfort',     price: 189, enabled: true,  popular: false, description: 'Upgrade to next cabin class',         photo: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=400&h=300&fit=crop&q=80' },
  { id: 'fasttrack', name: 'Fast Track Security',  category: 'Convenience', price: 18,  enabled: true,  popular: false, description: 'Skip the queues, save time',          photo: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400&h=300&fit=crop&q=80' },
  { id: 'baggage',   name: 'Extra Baggage (23kg)', category: 'Baggage',     price: 55,  enabled: true,  popular: false, description: '23kg checked bag — pre-paid',         photo: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=400&h=300&fit=crop&q=80' },
  { id: 'esim',      name: 'Jade Connect eSIM',    category: 'Technology',  price: 9,   enabled: true,  popular: false, description: 'Data in 150+ countries from $9.99',   photo: 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=400&h=300&fit=crop&q=80' },
  { id: 'visa',      name: 'Visa Service',         category: 'Documents',   price: 99,  enabled: false, popular: false, description: 'We handle your visa application',     photo: 'https://images.unsplash.com/photo-1590099033615-be195f8d575c?w=400&h=300&fit=crop&q=80' },
]

export type FlightExtra = typeof DEFAULT_EXTRAS[number]
