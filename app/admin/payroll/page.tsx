'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Plus, Send, CheckCircle, Loader2, X } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CURRENCIES = ['NGN','GBP','USD','EUR','CAD']

interface StaffMember {
  id: string; name: string; email: string; role: string
  location: string; department: string; currency: string
  baseSalary: number; payDay: number; bankName: string | null
  accountNumber: string | null; isActive: boolean
  payslips: Payslip[]
}

interface Payslip {
  id: string; staffMemberId: string; month: number; year: number
  baseSalary: number; bonus: number; allowance: number
  attendanceDeduction: number; otherDeduction: number; deductionNote: string | null
  grossPay: number; netPay: number; currency: string; status: string
  emailSentAt: string | null; paidAt: string | null; missedCheckIns: number
  staffMember?: StaffMember
}

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:   'bg-yellow-100 text-yellow-700',
    EMAILED:   'bg-blue-100 text-blue-700',
    PAID:      'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name:'', email:'', role:'', location:'', department:'Operations', currency:'NGN', baseSalary:'', payDay:'28', bankName:'', accountNumber:'' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/payroll/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, baseSalary: Number(form.baseSalary), payDay: Number(form.payDay) }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onSaved(); onClose()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-[#0B1F3A]">Add Staff Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['name','email','role','location'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">{k}</label>
                <input value={form[k]} onChange={f(k)} required
                  className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <input value={form.department} onChange={f('department')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <select value={form.currency} onChange={f('currency')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pay Day</label>
              <input type="number" min={1} max={28} value={form.payDay} onChange={f('payDay')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Base Salary</label>
            <input type="number" min={0} value={form.baseSalary} onChange={f('baseSalary')} required
              className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
              <input value={form.bankName} onChange={f('bankName')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account Number</label>
              <input value={form.accountNumber} onChange={f('accountNumber')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Add Staff Member'}
          </button>
        </form>
      </div>
    </div>
  )
}

function GenerateModal({ staff, onClose, onSaved }: { staff: StaffMember; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const [form, setForm] = useState({
    month: now.getMonth() + 1, year: now.getFullYear(),
    bonus: 0, allowance: 0, attendanceDeduction: 0, otherDeduction: 0,
    deductionNote: '', missedCheckIns: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/payroll/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffMemberId: staff.id, ...form }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onSaved(); onClose()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: k === 'deductionNote' ? e.target.value : Number(e.target.value) }))

  const gross = staff.baseSalary + form.bonus + form.allowance
  const net   = gross - form.attendanceDeduction - form.otherDeduction

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-[#0B1F3A]">Generate Payslip</h2>
            <p className="text-gray-400 text-xs mt-0.5">{staff.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month</label>
              <select value={form.month} onChange={f('month')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Year</label>
              <input type="number" value={form.year} onChange={f('year')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Base Salary</p>
            <p className="text-[#0B1F3A] font-bold">{fmtCurrency(staff.baseSalary, staff.currency)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['bonus','allowance'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">{k}</label>
                <input type="number" min={0} value={form[k]} onChange={f(k)}
                  className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Missed Check-ins</label>
              <input type="number" min={0} value={form.missedCheckIns} onChange={f('missedCheckIns')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Attendance Deduction</label>
              <input type="number" min={0} value={form.attendanceDeduction} onChange={f('attendanceDeduction')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Other Deduction</label>
              <input type="number" min={0} value={form.otherDeduction} onChange={f('otherDeduction')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Deduction Note</label>
              <input value={form.deductionNote} onChange={e => setForm(p => ({ ...p, deductionNote: e.target.value }))}
                placeholder="Reason…"
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          {/* Summary */}
          <div className="bg-[#0B1F3A] rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40">Gross</p>
              <p className="text-white font-semibold">{fmtCurrency(gross, staff.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Net Pay</p>
              <p className="text-[#C9A84C] font-extrabold text-xl">{fmtCurrency(net, staff.currency)}</p>
            </div>
          </div>
          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {saving ? 'Generating…' : 'Generate Payslip'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function PayrollPage() {
  const now     = new Date()
  const [tab,   setTab]     = useState<'staff' | 'payslips'>('staff')
  const [staff, setStaff]   = useState<StaffMember[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [filterYear,  setFilterYear]  = useState(now.getFullYear())
  const [showAdd,     setShowAdd]     = useState(false)
  const [generateFor, setGenerateFor] = useState<StaffMember | null>(null)
  const [sending,     setSending]     = useState<string | null>(null)
  const [sendingAll,  setSendingAll]  = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/payroll/staff')
      const d   = await res.json()
      setStaff(d.staff ?? [])
    } finally { setLoading(false) }
  }, [])

  const loadPayslips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll/payslips?month=${filterMonth}&year=${filterYear}`)
      const d   = await res.json()
      setPayslips(d.payslips ?? [])
    } finally { setLoading(false) }
  }, [filterMonth, filterYear])

  useEffect(() => { if (tab === 'staff') loadStaff(); else loadPayslips() }, [tab, loadStaff, loadPayslips])

  async function sendPaystub(payslipId: string) {
    setSending(payslipId)
    try {
      const res = await fetch('/api/admin/payroll/send-paystub', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payslipId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      showToast('Paystub sent!'); loadPayslips()
    } catch (e: any) { showToast(`Error: ${e.message}`) } finally { setSending(null) }
  }

  async function markPaid(payslipId: string) {
    await fetch(`/api/admin/payroll/payslips/${payslipId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    })
    showToast('Marked as paid'); loadPayslips()
  }

  async function sendAll() {
    setSendingAll(true)
    try {
      const res = await fetch('/api/admin/payroll/send-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: filterMonth, year: filterYear }),
      })
      const d = await res.json()
      showToast(`Sent ${d.sent}, failed ${d.failed}`); loadPayslips()
    } finally { setSendingAll(false) }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B1F3A] text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-[#C9A84C]" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="font-bold text-[#0B1F3A] text-2xl">Payroll</h1>
            <p className="text-gray-400 text-sm">Manage staff salaries and paystubs</p>
          </div>
        </div>
        {tab === 'staff' && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        )}
        {tab === 'payslips' && (
          <button onClick={sendAll} disabled={sendingAll}
            className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {sendingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send All Pending
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100 pb-0">
        {(['staff', 'payslips'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t}
          </button>
        ))}
        {tab === 'payslips' && (
          <div className="ml-auto flex items-center gap-2 pb-2">
            <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
              className="border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] bg-white">
              {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              className="w-24 border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
          </div>
        )}
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : tab === 'staff' ? (
          <div className="space-y-3">
            {staff.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                No staff members yet. Add your first.
              </div>
            )}
            {staff.map(s => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0 font-bold text-[#C9A84C]">
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0B1F3A] truncate">{s.name}</span>
                    {!s.isActive && <span className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">{s.role} · {s.department} · {s.location}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-[#C9A84C]">{fmtCurrency(s.baseSalary, s.currency)}</p>
                  <p className="text-gray-400 text-xs">Pay day: {s.payDay}</p>
                </div>
                <button onClick={() => setGenerateFor(s)}
                  className="ml-2 flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[#C9A84C] text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex-shrink-0">
                  <DollarSign className="w-3.5 h-3.5" /> Payslip
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {payslips.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                No payslips for {MONTHS[filterMonth-1]} {filterYear}.
              </div>
            )}
            {payslips.map(p => (
              <div key={p.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#0B1F3A]">{p.staffMember?.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Base {fmtCurrency(p.baseSalary, p.currency)}
                    {p.bonus > 0 ? ` · +Bonus ${fmtCurrency(p.bonus, p.currency)}` : ''}
                    {p.allowance > 0 ? ` · +Allow ${fmtCurrency(p.allowance, p.currency)}` : ''}
                    {p.attendanceDeduction > 0 ? ` · −Att ${fmtCurrency(p.attendanceDeduction, p.currency)}` : ''}
                    {p.otherDeduction > 0 ? ` · −${p.deductionNote ?? 'Other'} ${fmtCurrency(p.otherDeduction, p.currency)}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-extrabold text-[#C9A84C] text-lg">{fmtCurrency(p.netPay, p.currency)}</p>
                  <p className="text-gray-400 text-[10px]">Net Pay</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.status !== 'PAID' && (
                    <button onClick={() => sendPaystub(p.id)} disabled={sending === p.id}
                      className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50">
                      {sending === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Email
                    </button>
                  )}
                  {p.status === 'EMAILED' && (
                    <button onClick={() => markPaid(p.id)}
                      className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-600 text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd     && <AddStaffModal onClose={() => setShowAdd(false)} onSaved={loadStaff} />}
      {generateFor && <GenerateModal staff={generateFor} onClose={() => setGenerateFor(null)}
        onSaved={() => { loadStaff(); setTab('payslips'); loadPayslips() }} />}
    </div>
  )
}
