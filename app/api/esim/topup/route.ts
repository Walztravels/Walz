import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Airalo does not support data top-ups on existing SIMs.
// Customers who need more data must purchase a new eSIM plan.
export async function POST() {
  return NextResponse.json(
    { error: 'Top-ups are not supported. Please purchase a new eSIM plan for your destination.' },
    { status: 501 },
  )
}
