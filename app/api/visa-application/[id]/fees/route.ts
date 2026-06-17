import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = cookies().get('admin_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { serviceFeeAmount, serviceFeeCurrency, govtFeeAmount, govtFeeInstructions } = await req.json()

  const data: Record<string, unknown> = {}
  if (serviceFeeAmount !== undefined) data.serviceFeeAmount = serviceFeeAmount
  if (serviceFeeCurrency !== undefined) data.serviceFeeCurrency = serviceFeeCurrency
  if (govtFeeAmount !== undefined) data.govtFeeAmount = govtFeeAmount
  if (govtFeeInstructions !== undefined) data.govtFeeInstructions = govtFeeInstructions

  await prisma.visaApplication.update({ where: { id: params.id }, data })

  return NextResponse.json({ success: true })
}
