'use client'
import { createContext, useContext, useState, useCallback } from 'react'

export interface CartItem {
  id:       string
  type:     'activity' | 'transfer' | 'tour' | 'hotel' | 'flight'
  title:    string
  price:    number
  currency: string
  quantity: number
  meta:     Record<string, string>
}

interface CartContextType {
  items:      CartItem[]
  addItem:    (item: CartItem) => void
  removeItem: (id: string) => void
  clearCart:  () => void
  total:      number
  itemCount:  number
}

const CartContext = createContext<CartContextType>({} as CartContextType)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const exists = prev.find(i => i.id === item.id)
      if (exists) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, item]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const total     = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
