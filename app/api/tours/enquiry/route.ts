import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendTourEnquiryConfirmation } from '@/lib/email'

const tourEnquirySchema = z.object({
  tourName: z.string().min(2, 'Tour name required'),
  tourDate: z.string().min(1, 'Tour date required'),
  groupSize: z.number().int().min(1).max(20),
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(7, 'Phone number required'),
  specialRequirements: z.string().optional(),
  preferredPickupLocation: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()

    const parsed = tourEnquirySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid enquiry data',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Save to database
    const enquiry = await prisma.tourEnquiry.create({
      data: {
        userId: session?.user?.id || null,
        status: 'NEW',
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        tourName: data.tourName,
        tourDate: data.tourDate,
        groupSize: data.groupSize,
        specialRequirements: data.specialRequirements,
        preferredPickupLocation: data.preferredPickupLocation,
      },
    })

    // Send confirmation email
    try {
      await sendTourEnquiryConfirmation(data.email, data.tourName)
    } catch (emailError) {
      console.error('[Tour Enquiry] Email send failed:', emailError)
    }

    return NextResponse.json({
      success: true,
      enquiryId: enquiry.id,
      message: 'Your enquiry has been received. We will contact you within 24 hours.',
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    console.error('[Tour Enquiry API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to submit enquiry. Please try again.' },
      { status: 500 }
    )
  }
}
