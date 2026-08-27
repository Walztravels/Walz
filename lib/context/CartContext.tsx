'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

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
  sessionId:  string | null
  addItem:    (item: CartItem) => void
  removeItem: (id: string) => void
  clearCart:  () => void
  total:      number
  itemCount:  number
}

const CartContext = createContext<CartContextType>({} as CartContextType)

const SESSION_KEY = 'walz_cart_session_id'

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = 'cs_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    // localStorage unavailable (SSR, private browsing) — return ephemeral ID
    return 'cs_' + Math.random().toString(36).slice(2)
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems]         = useState<CartItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize sessionId on client mount
  useEffect(() => {
    setSessionId(getOrCreateSessionId())
  }, [])

  // Sync cart state to DB — debounced 500ms so rapid changes batch into one write
  const syncCart = useCallback((nextItems: CartItem[], sid: string) => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      const currency = nextItems[0]?.currency ?? 'GBP'
      fetch('/api/cart/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sessionId: sid,
          currency,
          items: nextItems.map(i => ({
            id:       i.id,
            type:     i.type,
            title:    i.title,
            price:    i.price,
            currency: i.currency,
            quantity: i.quantity,
          })),
        }),
      }).catch(() => { /* cart sync failure is non-fatal */ })
    }, 500)
  }, [])

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const next = (() => {
        const exists = prev.find(i => i.id === item.id)
        if (exists) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        return [...prev, item]
      })()
      if (sessionId) syncCart(next, sessionId)
      return next
    })
  }, [sessionId, syncCart])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (sessionId) syncCart(next, sessionId)
      return next
    })
  }, [sessionId, syncCart])

  const clearCart = useCallback(() => {
    setItems([])
    if (sessionId) syncCart([], sessionId)
  }, [sessionId, syncCart])

  const total     = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, sessionId, addItem, removeItem, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
