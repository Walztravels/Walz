'use client'

import { useState } from 'react'

const EXTRAS_DATA = [
  { id: 'transfer',  name: 'Airport Transfer',     category: 'Transport',   price: 45,  bookings: 312, revenue: 14040, enabled: true,  photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=80&h=60&fit=crop&q=80' },
  { id: 'lounge',    name: 'Airport Lounge',       category: 'Comfort',     price: 35,  bookings: 248, revenue: 8680,  enabled: true,  photo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=80&h=60&fit=crop&q=80' },
  { id: 'insurance', name: 'Travel Insurance',     category: 'Protection',  price: 24,  bookings: 193, revenue: 4632,  enabled: true,  photo: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=80&h=60&fit=crop&q=80' },
  { id: 'upgrade',   name: 'Cabin Upgrade',        category: 'Comfort',     price: 189, bookings: 87,  revenue: 16443, enabled: true,  photo: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=80&h=60&fit=crop&q=80' },
  { id: 'fasttrack', name: 'Fast Track Security',  category: 'Convenience', price: 18,  bookings: 156, revenue: 2808,  enabled: true,  photo: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=80&h=60&fit=crop&q=80' },
  { id: 'baggage',   name: 'Extra Baggage (23kg)', category: 'Baggage',     price: 55,  bookings: 289, revenue: 15895, enabled: true,  photo: 'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=80&h=60&fit=crop&q=80' },
  { id: 'esim',      name: 'Jade Connect eSIM',    category: 'Technology',  price: 9,   bookings: 412, revenue: 3708,  enabled: true,  photo: 'https://images.unsplash.com/photo-1601972599720-36938d4ecd31?w=80&h=60&fit=crop&q=80' },
  { id: 'visa',      name: 'Visa Service',         category: 'Documents',   price: 99,  bookings: 64,  revenue: 6336,  enabled: false, photo: 'https://images.unsplash.com/photo-1590099033615-be195f8d575c?w=80&h=60&fit=crop&q=80' },
]

const CATEGORIES = ['All', 'Transport', 'Comfort', 'Protection', 'Convenience', 'Baggage', 'Technology', 'Documents']

export default function FlightExtrasAdminPage() {
  const [extras, setExtras] = useState(EXTRAS_DATA)
  const [filter, setFilter] = useState('All')
  const [editId, setEditId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')

  const filtered = filter === 'All' ? extras : extras.filter(e => e.category === filter)

  const totalRevenue = extras.reduce((s, e) => s + e.revenue, 0)
  const totalBookings = extras.reduce((s, e) => s + e.bookings, 0)
  const activeCount = extras.filter(e => e.enabled).length

  function toggleEnabled(id: string) {
    setExtras(es => es.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e))
  }

  function savePrice(id: string) {
    const price = Number(editPrice)
    if (!isNaN(price) && price > 0) {
      setExtras(es => es.map(e => e.id === id ? { ...e, price } : e))
    }
    setEditId(null)
    setEditPrice('')
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B1F3A]">Flight Extras</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage ancillary services shown on the checkout extras page.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue', value: `£${(totalRevenue / 1000).toFixed(1)}k`, sub: 'from all extras' },
          { label: 'Total Add-ons', value: totalBookings.toLocaleString(), sub: 'across all services' },
          { label: 'Active Services', value: `${activeCount} / ${extras.length}`, sub: 'currently showing' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-[#0B1F3A]">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === cat ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Extras table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Add-ons</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(extra => (
              <tr key={extra.id} className={`transition-colors hover:bg-gray-50 ${!extra.enabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={extra.photo} alt={extra.name} className="w-12 h-9 object-cover rounded-lg flex-shrink-0" />
                    <span className="font-medium text-[#0B1F3A]">{extra.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#0B1F3A]/5 text-[#0B1F3A]/60 font-medium">{extra.category}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {editId === extra.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                        className="w-20 text-right border border-[#C9A84C] rounded-lg px-2 py-1 text-sm focus:outline-none"
                        onKeyDown={e => { if (e.key === 'Enter') savePrice(extra.id); if (e.key === 'Escape') setEditId(null) }} />
                      <button onClick={() => savePrice(extra.id)} className="text-[#C9A84C] font-bold text-xs hover:underline">Save</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditId(extra.id); setEditPrice(String(extra.price)) }}
                      className="font-bold text-[#0B1F3A] hover:text-[#C9A84C] transition-colors cursor-pointer">
                      £{extra.price}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{extra.bookings.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-[#0B1F3A]">£{extra.revenue.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleEnabled(extra.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${extra.enabled ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${extra.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button className="text-xs text-gray-400 hover:text-[#0B1F3A] transition-colors font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Changes to prices and active status are reflected immediately on the flight booking extras page. Click any price to edit inline.
      </p>
    </div>
  )
}
