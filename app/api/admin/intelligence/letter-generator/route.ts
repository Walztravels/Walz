import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60


const LETTER_TYPES = [
  { id: 'cover',          label: 'Cover Letter',                desc: 'Main supporting letter from applicant' },
  { id: 'sponsor',        label: 'Sponsor Letter',              desc: 'Financial sponsor declaration' },
  { id: 'employment',     label: 'Employment Letter',           desc: 'From employer confirming position & leave' },
  { id: 'introduction',   label: 'Introduction Letter',         desc: 'From travel consultant to embassy' },
  { id: 'invitation',     label: 'Invitation Letter',           desc: 'From host in destination country' },
  { id: 'financial',      label: 'Financial Support Letter',    desc: 'Confirming financial adequacy' },
  { id: 'travel_purpose', label: 'Travel Purpose Statement',    desc: 'Detailed travel intentions & itinerary' },
  { id: 'noc',            label: 'No Objection Certificate',    desc: 'NOC from employer or institution' },
  { id: 'hotel',          label: 'Hotel Confirmation Letter',   desc: 'Hotel booking confirmation for visa' },
]

function buildLetterPrompt(letterType: string, application: Record<string, unknown>, extraContext: string): string {
  const fullName      = [application.firstName, application.middleName, application.lastName].filter(Boolean).join(' ')
  const destination   = String(application.destinationIso2 ?? 'the destination country')
  const arrivalDate   = application.arrivalDate ? new Date(String(application.arrivalDate)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'TBD'
  const returnDate    = application.returnDate  ? new Date(String(application.returnDate)).toLocaleDateString('en-GB',  { day: 'numeric', month: 'long', year: 'numeric' }) : 'TBD'
  const today         = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const prompts: Record<string, string> = {
    cover: `Write a formal cover letter for a ${application.visaType ?? 'visitor'} visa application to ${destination}.
Applicant: ${fullName} | Passport: ${application.passportNumber ?? '[PASSPORT NUMBER]'} | Nationality: ${application.nationality ?? '[NATIONALITY]'}
Travel dates: ${arrivalDate} to ${returnDate} | Purpose: ${application.purposeOfVisit ?? 'tourism'}
Accommodation: ${application.accommodationName ?? '[HOTEL NAME]'} | Employment: ${application.employerName ?? 'Self-employed'}, ${application.jobTitle ?? '[JOB TITLE]'}
Date: ${today}
${extraContext ? `Additional context: ${extraContext}` : ''}
Write a complete, embassy-quality cover letter that clearly addresses the applicant's ties to home country, financial stability, and genuine intent to return. Use formal British English. Include date, reference line, proper salutation and sign-off. Make it 350-450 words.`,

    sponsor: `Write a financial sponsorship letter for ${fullName}'s visa application to ${destination}.
Travel dates: ${arrivalDate} to ${returnDate}
${extraContext ? `Sponsor details: ${extraContext}` : 'The sponsor is a family member/friend in the home country.'}
Date: ${today}
Write a complete sponsor letter including: sponsor's full details, relationship to applicant, confirmation of financial support, bank account reference, sponsor's employment details, declaration of responsibility. 250-350 words. Formal British English.`,

    employment: `Write an employment verification letter for ${fullName}'s visa application to ${destination}.
Employee: ${fullName} | Employer: ${application.employerName ?? '[COMPANY NAME]'} | Title: ${application.jobTitle ?? '[JOB TITLE]'}
Travel dates: ${arrivalDate} to ${returnDate} | Salary: ${application.monthlyIncome ? `${application.monthlyIncome}/month` : '[SALARY]'}
${extraContext ? `Additional: ${extraContext}` : ''}
Date: ${today}
Write a complete employment letter on company letterhead format. Include: confirmation of employment, position held, duration of employment, salary details, approved leave dates, confirmation employee will return to work. 200-300 words. Formal British English.`,

    introduction: `Write an introduction letter from Walz Travels (immigration consultancy) to the ${destination} Embassy on behalf of ${fullName}.
Reference: ${application.referenceNumber ?? '[REF]'} | Travel dates: ${arrivalDate} to ${returnDate}
${extraContext ? `Additional: ${extraContext}` : ''}
Date: ${today}
Write a complete consultancy introduction letter confirming: we represent the applicant, application completeness, applicant's credibility, our accreditation. 200-280 words. Formal British English.`,

    invitation: `Write an invitation letter from a host in ${destination} country inviting ${fullName} for a ${application.visaType ?? 'visit'}.
Travel dates: ${arrivalDate} to ${returnDate} | Accommodation: ${application.accommodationName ?? 'at the host\'s residence'}
${extraContext ? `Host details: ${extraContext}` : ''}
Date: ${today}
Write a complete invitation letter. Include: host's full details, relationship, invitation purpose, accommodation offer, financial responsibility statement, host signature block. 250-320 words. Formal British English.`,

    financial: `Write a financial adequacy letter demonstrating ${fullName}'s financial capacity for travel to ${destination}.
Travel dates: ${arrivalDate} to ${returnDate} | Monthly income: ${application.monthlyIncome ?? '[INCOME]'}
${extraContext ? `Financial details: ${extraContext}` : ''}
Date: ${today}
Write a complete financial support statement covering: bank balance reference, income sources, property/asset ownership, proof travel expenses are covered, return commitment. 200-280 words. Formal British English.`,

    travel_purpose: `Write a detailed travel purpose statement for ${fullName}'s ${application.visaType ?? 'visitor'} visa to ${destination}.
Dates: ${arrivalDate} to ${returnDate} | Purpose: ${application.purposeOfVisit ?? 'tourism'}
Accommodation: ${application.accommodationName ?? '[HOTEL]'}, ${application.accommodationAddress ?? '[ADDRESS]'}
${extraContext ? `Itinerary/additional: ${extraContext}` : ''}
Date: ${today}
Write a comprehensive travel purpose statement covering: specific reason for visit, planned itinerary (day by day if possible), places to visit, people to meet, why chosen these dates, confirmation of return. 350-450 words. Formal British English.`,

    noc: `Write a No Objection Certificate (NOC) for ${fullName}'s travel to ${destination}.
Employer: ${application.employerName ?? '[COMPANY NAME]'} | Job Title: ${application.jobTitle ?? '[TITLE]'}
Travel dates: ${arrivalDate} to ${returnDate}
${extraContext ? `Additional: ${extraContext}` : ''}
Date: ${today}
Write a complete NOC letter stating: no objection to travel, employee's responsibilities are covered, employee will return to resume duties, company endorsement of the application. 180-240 words. Formal British English.`,

    hotel: `Write a hotel booking confirmation letter for ${fullName}'s stay at ${application.accommodationName ?? '[HOTEL NAME]'} in ${destination}.
Check-in: ${arrivalDate} | Check-out: ${returnDate}
${extraContext ? `Hotel details: ${extraContext}` : ''}
Date: ${today}
Write a hotel confirmation letter including: booking reference number (generate a realistic one), hotel name and address, guest name, room type, check-in/check-out dates, rate per night, total amount, breakfast inclusion, hotel contact details, manager signature. 200-260 words. Formal British English.`,
  }

  return prompts[letterType] ?? prompts['cover']
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { letterType, applicationId, extraContext = '' } = await req.json() as {
      letterType:   string
      applicationId: string
      extraContext?: string
    }

    if (!letterType || !applicationId) {
      return NextResponse.json({ error: 'letterType and applicationId required' }, { status: 400 })
    }

    const application = await prisma.visaApplication.findUnique({ where: { id: applicationId } })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const appData: Record<string, unknown> = {
      referenceNumber:     application.referenceNumber,
      firstName:           application.firstName,
      middleName:          application.middleName,
      lastName:            application.lastName,
      dateOfBirth:         application.dateOfBirth,
      nationality:         application.nationality,
      passportNumber:      application.passportNumber,
      destinationIso2:     application.destinationIso2,
      visaType:            application.visaType,
      arrivalDate:         application.arrivalDate,
      returnDate:          application.returnDate,
      purposeOfVisit:      application.purposeOfVisit,
      accommodationName:   application.accommodationName,
      accommodationAddress: application.accommodationAddress,
      employerName:        application.employerName,
      jobTitle:            application.jobTitle,
      monthlyIncome:       application.monthlyIncome,
      homeAddress:         application.homeAddress,
      city:                application.city,
      country:             application.country,
      phone:               application.phone,
      email:               application.email,
    }

    const prompt = buildLetterPrompt(letterType, appData, extraContext)

    const res = await getAnthropic().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const letter = res.content[0].type === 'text' ? res.content[0].text : ''
    const letterTypeMeta = LETTER_TYPES.find(l => l.id === letterType)

    return NextResponse.json({
      letter,
      letterType,
      letterLabel: letterTypeMeta?.label ?? letterType,
      application: appData,
    })
  } catch (e) {
    console.error('[letter-generator]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ letterTypes: LETTER_TYPES })
}
