'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plane,
  Building2,
  Car,
  MapPin,
  Activity,
  Plus,
  Trash2,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Copy,
  FileText,
  ArrowRight,
  X,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

type ItemType = 'FLIGHT' | 'HOTEL' | 'TRANSFER' | 'TOUR' | 'ACTIVITY' | 'CUSTOM'

interface BasketItem {
  id: string
  type: ItemType
  title: string
  subtitle: string
  supplier: string
  netAmount: number
  sellingPrice: number
  currency: string
  markupPercent: number
  notes?: string
  addedAt: string
}

type FilterTab = 'ALL' | ItemType

const STORAGE_KEY = 'walz-admin-basket-v1'
const SESSION_KEY = 'walz-quote-prefill'

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readStorage(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStorage(items: BasketItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // private browsing or quota exceeded — silently ignore
  }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function calcMarkup(net: number, selling: number): number {
  if (net <= 0) return 0
  return ((selling - net) / net) * 100
}

// ─── Config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ItemType, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  FLIGHT:   { label: 'Flight',   color: 'text-blue-400',   bg: 'bg-blue-900/40',   Icon: Plane },
  HOTEL:    { label: 'Hotel',    color: 'text-green-400',  bg: 'bg-green-900/40',  Icon: Building2 },
  TRANSFER: { label: 'Transfer', color: 'text-purple-400', bg: 'bg-purple-900/40', Icon: Car },
  TOUR:     { label: 'Tour',     color: 'text-rose-400',   bg: 'bg-rose-900/40',   Icon: MapPin },
  ACTIVITY: { label: 'Activity', color: 'text-amber-400',  bg: 'bg-amber-900/40',  Icon: Activity },
  CUSTOM:   { label: 'Custom',   color: 'text-gray-400',   bg: 'bg-gray-700/40',   Icon: Plus },
}

const ITEM_TYPES: ItemType[] = ['FLIGHT', 'HOTEL', 'TRANSFER', 'TOUR', 'ACTIVITY', 'CUSTOM']
const CURRENCIES = ['GBP', 'USD', 'EUR', 'NGN', 'AED']
const SUPPLIERS  = ['Duffel', 'Hotelbeds', 'Walz', 'Manual', 'Viator', 'Other']

// ─── Sub-components ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ItemType }) {
  const { label, color, bg } = TYPE_CONFIG[type]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color} ${bg}`}>
      {label}
    </span>
  )
}

function TypeIcon({ type, className }: { type: ItemType; className?: string }) {
  const { Icon, color } = TYPE_CONFIG[type]
  return <Icon className={`${color} ${className ?? 'w-5 h-5'}`} />
}

// ─── Item Card ─────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: BasketItem
  onDelete: (id: string) => void
  onPriceChange: (id: string, price: number) => void
}

function ItemCard({ item, onDelete, onPriceChange }: ItemCardProps) {
  const [priceInput, setPriceInput] = useState(item.sellingPrice.toFixed(2))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPriceInput(item.sellingPrice.toFixed(2))
  }, [item.sellingPrice])

  function handleBlur() {
    const parsed = parseFloat(priceInput)
    if (!isNaN(parsed) && parsed >= 0) {
      onPriceChange(item.id, parsed)
    } else {
      setPriceInput(item.sellingPrice.toFixed(2))
    }
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      onDelete(item.id)
    } else {
      setConfirmDelete(true)
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const profit = item.sellingPrice - item.netAmount
  const markup = calcMarkup(item.netAmount, item.sellingPrice)

  return (
    <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-xl p-4 flex gap-3 group">
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <TypeIcon type={item.type} className="w-5 h-5" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <TypeBadge type={item.type} />
          <span className="text-xs text-[#4a7fa5] bg-[#0d2035] px-2 py-0.5 rounded">
            {item.supplier}
          </span>
        </div>

        <p className="text-white font-medium text-sm leading-snug truncate">{item.title}</p>
        <p className="text-[#8eb4d4] text-xs mt-0.5 truncate">{item.subtitle}</p>

        {item.notes && (
          <p className="text-gray-500 text-xs mt-1 italic">{item.notes}</p>
        )}

        {/* Pricing row */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-xs text-gray-400">
            Cost: <span className="text-gray-300 font-medium">{formatCurrency(item.netAmount, item.currency)}</span>
          </span>

          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Sell:</span>
            <span className="text-xs text-gray-400">{item.currency}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              onBlur={handleBlur}
              className="w-24 bg-[#0d2035] border border-[#1a2f4a] rounded px-2 py-0.5 text-xs text-[#C9A84C] font-semibold focus:outline-none focus:border-[#C9A84C] text-right"
            />
          </div>

          {profit !== 0 && (
            <span className={`text-xs font-medium ${profit >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
              {profit >= 0 ? '+' : ''}{formatCurrency(profit, item.currency)} ({markup.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <div className="shrink-0 flex items-start pt-0.5">
        <button
          onClick={handleDeleteClick}
          title={confirmDelete ? 'Click again to confirm' : 'Remove item'}
          className={`p-1.5 rounded transition-colors ${
            confirmDelete
              ? 'bg-rose-600 text-white'
              : 'text-gray-500 hover:text-rose-400 hover:bg-rose-900/30'
          }`}
        >
          {confirmDelete ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── Manual Add Form ───────────────────────────────────────────────────────

interface ManualAddFormProps {
  onAdd: (item: BasketItem) => void
}

function ManualAddForm({ onAdd }: ManualAddFormProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    type: 'CUSTOM' as ItemType,
    title: '',
    subtitle: '',
    supplier: 'Manual',
    netAmount: '',
    sellingPrice: '',
    currency: 'GBP',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = 'Required'
    if (!form.netAmount || isNaN(Number(form.netAmount))) errs.netAmount = 'Enter a valid number'
    if (!form.sellingPrice || isNaN(Number(form.sellingPrice))) errs.sellingPrice = 'Enter a valid number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleAdd() {
    if (!validate()) return
    const net = parseFloat(form.netAmount)
    const sell = parseFloat(form.sellingPrice)
    const item: BasketItem = {
      id: generateId(),
      type: form.type,
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      supplier: form.supplier.trim() || 'Manual',
      netAmount: net,
      sellingPrice: sell,
      currency: form.currency,
      markupPercent: calcMarkup(net, sell),
      notes: form.notes.trim() || undefined,
      addedAt: new Date().toISOString(),
    }
    onAdd(item)
    setForm({
      type: 'CUSTOM',
      title: '',
      subtitle: '',
      supplier: 'Manual',
      netAmount: '',
      sellingPrice: '',
      currency: 'GBP',
      notes: '',
    })
    setErrors({})
    setOpen(false)
  }

  return (
    <div className="border border-[#1a2f4a] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#8eb4d4] hover:text-white hover:bg-[#0d2035] transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#C9A84C]" />
          Add manual item
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="bg-[#0a1929] border-t border-[#1a2f4a] p-4 space-y-3">
          {/* Row 1: Type + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]"
              >
                {ITEM_TYPES.map(t => (
                  <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title <span className="text-rose-400">*</span></label>
            <input
              type="text"
              placeholder="e.g. LOS → LHR · Emirates EK783"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={`w-full bg-[#061320] border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] ${errors.title ? 'border-rose-500' : 'border-[#1a2f4a]'}`}
            />
            {errors.title && <p className="text-rose-400 text-xs mt-0.5">{errors.title}</p>}
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Subtitle</label>
            <input
              type="text"
              placeholder="e.g. Economy · 25 Jan 2026 · 2 adults"
              value={form.subtitle}
              onChange={e => set('subtitle', e.target.value)}
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Supplier</label>
            <input
              type="text"
              list="supplier-list"
              placeholder="Supplier name"
              value={form.supplier}
              onChange={e => set('supplier', e.target.value)}
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
            <datalist id="supplier-list">
              {SUPPLIERS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Net / Cost <span className="text-rose-400">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.netAmount}
                onChange={e => set('netAmount', e.target.value)}
                className={`w-full bg-[#061320] border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] ${errors.netAmount ? 'border-rose-500' : 'border-[#1a2f4a]'}`}
              />
              {errors.netAmount && <p className="text-rose-400 text-xs mt-0.5">{errors.netAmount}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Selling Price <span className="text-rose-400">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.sellingPrice}
                onChange={e => set('sellingPrice', e.target.value)}
                className={`w-full bg-[#061320] border rounded-lg px-3 py-2 text-sm text-[#C9A84C] placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] ${errors.sellingPrice ? 'border-rose-500' : 'border-[#1a2f4a]'}`}
              />
              {errors.sellingPrice && <p className="text-rose-400 text-xs mt-0.5">{errors.sellingPrice}</p>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              className="flex-1 flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#b8973d] text-black font-semibold text-sm py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add to basket
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-2 border border-[#1a2f4a] rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary Card ──────────────────────────────────────────────────────────

interface SummaryCardProps {
  items: BasketItem[]
  onClear: () => void
  onBuildQuote: (clientName: string, clientEmail: string) => void
}

function SummaryCard({ items, onClear, onBuildQuote }: SummaryCardProps) {
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState('GBP')

  const currencies = [...new Set(items.map(i => i.currency))]
  const hasMixedCurrencies = currencies.length > 1

  // Filter items by display currency for totals (best-effort)
  const sameItems = items.filter(i => i.currency === displayCurrency)
  const otherItems = items.filter(i => i.currency !== displayCurrency)

  const totalNet   = sameItems.reduce((s, i) => s + i.netAmount, 0)
  const totalSell  = sameItems.reduce((s, i) => s + i.sellingPrice, 0)
  const profit     = totalSell - totalNet
  const margin     = totalSell > 0 ? (profit / totalSell) * 100 : 0

  function handleClear() {
    if (confirmClear) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      onClear()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 3000)
    }
  }

  function handleBuild() {
    onBuildQuote(clientName, clientEmail)
  }

  return (
    <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-xl p-5 space-y-5">
      <h2 className="text-white font-semibold text-base flex items-center gap-2">
        <FileText className="w-4 h-4 text-[#C9A84C]" />
        Summary
      </h2>

      {/* Currency selector */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Display currency</label>
        <select
          value={displayCurrency}
          onChange={e => setDisplayCurrency(e.target.value)}
          className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]"
        >
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Totals */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total items</span>
          <span className="text-white font-medium">{items.length}</span>
        </div>

        {hasMixedCurrencies && otherItems.length > 0 && (
          <p className="text-xs text-amber-400 bg-amber-900/20 rounded px-2 py-1">
            {otherItems.length} item{otherItems.length !== 1 ? 's' : ''} in other currencies excluded from totals
          </p>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Supplier cost</span>
          <span className="text-gray-300">{formatCurrency(totalNet, displayCurrency)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Selling price</span>
          <span className="text-[#C9A84C] font-semibold">{formatCurrency(totalSell, displayCurrency)}</span>
        </div>

        <div className="border-t border-[#1a2f4a] pt-2 flex justify-between text-sm">
          <span className="text-gray-400">Gross profit</span>
          <span className={`font-semibold ${profit >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
            {formatCurrency(profit, displayCurrency)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Margin</span>
          <span className={`font-semibold ${margin >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Client info */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Client</p>
        <input
          type="text"
          placeholder="Client name"
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
        />
        <input
          type="email"
          placeholder="Client email"
          value={clientEmail}
          onChange={e => setClientEmail(e.target.value)}
          className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={handleBuild}
          disabled={items.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#b8973d] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          <FileText className="w-4 h-4" />
          Build Quote
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={handleClear}
          disabled={items.length === 0}
          className={`w-full flex items-center justify-center gap-2 text-sm py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            confirmClear
              ? 'border-rose-500 text-rose-400 bg-rose-900/20'
              : 'border-[#1a2f4a] text-gray-400 hover:text-white hover:border-gray-500'
          }`}
        >
          {confirmClear ? (
            <><Check className="w-4 h-4" /> Confirm clear</>
          ) : (
            <><Trash2 className="w-4 h-4" /> Clear basket</>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterTab }) {
  const quickLinks = [
    { href: '/admin/book/flight',   label: 'Add flight',   Icon: Plane },
    { href: '/admin/book/hotel',    label: 'Add hotel',    Icon: Building2 },
    { href: '/admin/book/transfer', label: 'Add transfer', Icon: Car },
    { href: '/admin/book/tour',     label: 'Add tour',     Icon: MapPin },
    { href: '/admin/book/activity', label: 'Add activity', Icon: Activity },
  ]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[#0d2035] border border-[#1a2f4a] flex items-center justify-center mb-4">
        <ShoppingCart className="w-7 h-7 text-[#C9A84C]" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-1">
        {filter === 'ALL' ? 'Your basket is empty' : `No ${TYPE_CONFIG[filter].label} items`}
      </h3>
      <p className="text-gray-400 text-sm mb-8 max-w-xs">
        {filter === 'ALL'
          ? 'Add products from booking flows or enter items manually below.'
          : `No ${TYPE_CONFIG[filter].label.toLowerCase()} items in the basket yet.`}
      </p>

      {filter === 'ALL' && (
        <div className="flex flex-wrap justify-center gap-2">
          {quickLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0a1929] border border-[#1a2f4a] rounded-lg text-sm text-[#8eb4d4] hover:text-white hover:border-[#C9A84C]/40 transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function BasketPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [items, setItems]       = useState<BasketItem[]>([])
  const [filter, setFilter]     = useState<FilterTab>('ALL')
  const [mounted, setMounted]   = useState(false)
  const [toast, setToast]       = useState<string | null>(null)
  const toastTimer              = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mount + read localStorage
  useEffect(() => {
    setItems(readStorage())
    setMounted(true)
  }, [])

  // Handle ?add= URL param
  useEffect(() => {
    if (!mounted) return
    const addParam = searchParams.get('add')
    if (!addParam) return
    try {
      const decoded = atob(addParam)
      const parsed = JSON.parse(decoded) as Partial<BasketItem>
      if (parsed && parsed.title) {
        const newItem: BasketItem = {
          id:            parsed.id          ?? generateId(),
          type:          parsed.type        ?? 'CUSTOM',
          title:         parsed.title       ?? 'Untitled',
          subtitle:      parsed.subtitle    ?? '',
          supplier:      parsed.supplier    ?? 'Manual',
          netAmount:     parsed.netAmount   ?? 0,
          sellingPrice:  parsed.sellingPrice ?? 0,
          currency:      parsed.currency    ?? 'GBP',
          markupPercent: parsed.markupPercent ?? 0,
          notes:         parsed.notes,
          addedAt:       parsed.addedAt     ?? new Date().toISOString(),
        }
        setItems(prev => {
          // Avoid duplicate ids
          if (prev.some(i => i.id === newItem.id)) return prev
          const next = [...prev, newItem]
          writeStorage(next)
          return next
        })
        showToast(`"${newItem.title}" added to basket`)
      }
    } catch {
      // Invalid base64 / JSON — ignore
    }
    // Strip the param from the URL
    const params = new URLSearchParams(searchParams.toString())
    params.delete('add')
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    router.replace(newUrl, { scroll: false })
  }, [mounted, searchParams, router])

  function showToast(message: string) {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // Persist on change
  const persist = useCallback((next: BasketItem[]) => {
    writeStorage(next)
    setItems(next)
  }, [])

  function addItem(item: BasketItem) {
    persist([...items, item])
    showToast(`"${item.title}" added to basket`)
  }

  function deleteItem(id: string) {
    persist(items.filter(i => i.id !== id))
  }

  function updatePrice(id: string, price: number) {
    persist(items.map(i =>
      i.id === id
        ? { ...i, sellingPrice: price, markupPercent: calcMarkup(i.netAmount, price) }
        : i
    ))
  }

  function clearAll() {
    persist([])
  }

  function buildQuote(clientName: string, clientEmail: string) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        clientName,
        clientEmail,
        items,
      }))
    } catch {
      // ignore
    }
    router.push('/admin/quotes/new')
  }

  const currencies = [...new Set(items.map(i => i.currency))]
  const hasMixedCurrencies = currencies.length > 1

  const filteredItems = filter === 'ALL'
    ? items
    : items.filter(i => i.type === filter)

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: 'All' },
    ...ITEM_TYPES.map(t => ({ key: t as FilterTab, label: TYPE_CONFIG[t].label })),
  ]

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#061320] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#061320] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-[#0a1929] border border-[#C9A84C]/40 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-[#C9A84C] shrink-0" />
            {toast}
          </div>
        )}

        <div className="xl:grid xl:grid-cols-[1fr_320px] xl:gap-6 space-y-6 xl:space-y-0">

          {/* ── LEFT COLUMN ───────────────────────────── */}
          <div className="space-y-5">

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#0a1929] border border-[#1a2f4a] rounded-xl">
                  <ShoppingCart className="w-5 h-5 text-[#C9A84C]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Trip Basket</h1>
                  <p className="text-xs text-gray-400">Assemble a multi-product trip</p>
                </div>
                {items.length > 0 && (
                  <span className="bg-[#C9A84C] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                )}
              </div>

              {items.length > 0 && (
                <Link
                  href="/admin/book"
                  className="flex items-center gap-1.5 text-sm text-[#8eb4d4] hover:text-white border border-[#1a2f4a] hover:border-[#C9A84C]/40 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add product
                </Link>
              )}
            </div>

            {/* Mixed currency warning */}
            {hasMixedCurrencies && (
              <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-300 text-sm">
                  Basket contains items in multiple currencies ({currencies.join(', ')}). Totals may be approximate.
                </p>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {FILTER_TABS.map(({ key, label }) => {
                const count = key === 'ALL' ? items.length : items.filter(i => i.type === key).length
                const active = filter === key
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#C9A84C] text-black'
                        : 'bg-[#0a1929] border border-[#1a2f4a] text-gray-400 hover:text-white'
                    }`}
                  >
                    {key !== 'ALL' && (
                      <TypeIcon type={key as ItemType} className="w-3.5 h-3.5" />
                    )}
                    {label}
                    {count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        active ? 'bg-black/20 text-black' : 'bg-[#1a2f4a] text-gray-300'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Items list or empty state */}
            {filteredItems.length === 0 ? (
              <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-xl">
                <EmptyState filter={filter} />
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onDelete={deleteItem}
                    onPriceChange={updatePrice}
                  />
                ))}
              </div>
            )}

            {/* Manual add form */}
            <ManualAddForm onAdd={addItem} />

          </div>

          {/* ── RIGHT COLUMN ──────────────────────────── */}
          <div className="xl:sticky xl:top-6 xl:self-start">
            <SummaryCard
              items={items}
              onClear={clearAll}
              onBuildQuote={buildQuote}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
