/**
 * Helcim server-side utilities
 *
 * Docs: https://devdocs.helcim.com/reference/helcim-pay-overview
 */

const HELCIM_API_BASE = 'https://api.helcim.com/v2'
const API_TOKEN = process.env.HELCIM_API_TOKEN!

function helcimHeaders() {
  return {
    'api-token': API_TOKEN,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export interface HelcimCheckoutSession {
  checkoutToken: string
  secretToken: string
}

export interface HelcimTransaction {
  transactionId: number
  dateCreated: string
  cardBatchId: number
  status: string       // "APPROVED" | "DECLINED" | "ERROR"
  type: string         // "purchase" | "preauth" | "capture" | "refund"
  amount: number
  currency: string
  cardNumber: string   // masked, e.g. "4111********1111"
  cardToken: string
  cardType: string
  approvalCode: string
  avsResponse: string
  cvvResponse: string
  customer?: { customerCode: string; firstName: string; lastName: string; email?: string }
  invoiceNumber?: string
}

// ── Initialize a Helcim Pay checkout session ──────────────────────────────────
export async function initializeHelcimCheckout({
  amount,
  currency,
  invoiceNumber,
  customerCode,
}: {
  amount: number
  currency: string
  invoiceNumber?: string
  customerCode?: string
}): Promise<HelcimCheckoutSession> {
  const body: Record<string, unknown> = {
    paymentType: 'purchase',
    amount: parseFloat(amount.toFixed(2)),
    currency: currency.toUpperCase(),
  }
  if (invoiceNumber) body.invoiceNumber = invoiceNumber
  if (customerCode) body.customerCode = customerCode

  const res = await fetch(`${HELCIM_API_BASE}/helcim-pay/initialize`, {
    method: 'POST',
    headers: helcimHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Helcim initialize failed (${res.status}): ${err}`)
  }

  return res.json() as Promise<HelcimCheckoutSession>
}

// ── Verify a completed transaction ────────────────────────────────────────────
export async function verifyHelcimTransaction(
  transactionId: string | number
): Promise<HelcimTransaction | null> {
  const res = await fetch(`${HELCIM_API_BASE}/transactions/${transactionId}`, {
    headers: helcimHeaders(),
  })

  if (!res.ok) return null

  // Helcim returns { transactions: [...] }
  const data = await res.json() as { transactions?: HelcimTransaction[]; transactionId?: number; status?: string; amount?: number; currency?: string }

  // Handle both formats
  if (Array.isArray(data.transactions) && data.transactions.length > 0) {
    return data.transactions[0]
  }
  if (data.transactionId) {
    return data as unknown as HelcimTransaction
  }

  return null
}

// ── Verify amount matches expected (within $1 tolerance) ─────────────────────
export function isTransactionValid(
  tx: HelcimTransaction,
  expectedAmount: number,
  expectedCurrency: string
): boolean {
  if (tx.status !== 'APPROVED') return false
  if (tx.currency.toUpperCase() !== expectedCurrency.toUpperCase()) return false
  if (Math.abs(tx.amount - expectedAmount) > 1) return false
  return true
}
