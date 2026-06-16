'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, CheckCircle } from 'lucide-react'
import { useCart } from '@/lib/context/CartContext'

interface ActivityInfo {
  id?: string
  slug: string
  title: string
  price: number
  currency: string
  duration: string
  location: string
}

interface Props {
  activity: ActivityInfo
  date?: string
  adults?: number
}

export function AddToCartButton({ activity, date, adults = 1 }: Props) {
  const { addItem } = useCart()
  const router = useRouter()
  const [added, setAdded] = useState(false)

  function handleAddToCart() {
    addItem({
      id:       activity.id ?? activity.slug,
      type:     'activity',
      title:    activity.title,
      price:    activity.price > 0 ? activity.price : 50,
      currency: activity.currency ?? 'USD',
      quantity: adults,
      meta: {
        location: activity.location,
        duration: activity.duration ?? '',
        adults:   String(adults),
        ...(date ? { date } : {}),
      },
    })
    setAdded(true)
    setTimeout(() => router.push('/cart'), 1500)
  }

  return (
    <button
      onClick={handleAddToCart}
      disabled={added}
      className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl transition-all ${
        added
          ? 'bg-green-500 text-white cursor-default'
          : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f] active:scale-[0.98]'
      }`}
    >
      {added ? (
        <>
          <CheckCircle className="w-4 h-4" />
          Added — Going to Cart…
        </>
      ) : (
        <>
          <ShoppingCart className="w-4 h-4" />
          Add to Cart
        </>
      )}
    </button>
  )
}
