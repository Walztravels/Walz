'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Plus, Trash2, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BookingPassenger } from '@/types/booking'

const passengerSchema = z.object({
  type: z.enum(['ADT', 'CHD', 'INF']),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['M', 'F']),
  passportNumber: z.string().min(5, 'Enter a valid passport number').max(20),
  passportExpiry: z.string().min(1, 'Passport expiry is required'),
  nationality: z.string().min(2, 'Nationality is required'),
  email: z.string().email('Valid email required').or(z.literal('')),
  phone: z.string().optional(),
})

const formSchema = z.object({
  passengers: z.array(passengerSchema).min(1, 'At least one passenger required'),
  contactEmail: z.string().email('Valid email address required'),
  contactPhone: z
    .string()
    .min(7, 'WhatsApp number is required')
    .regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid number with country code (e.g. +447911123456)'),
})

type FormData = z.infer<typeof formSchema>

interface PassengerFormProps {
  initialPassengerCount?: number
  onSubmit: (passengers: BookingPassenger[], contactEmail: string, contactPhone: string) => void
  isLoading?: boolean
}

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia',
  'Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Belarus','Belgium','Belize',
  'Benin','Bolivia','Bosnia','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso',
  'Burundi','Cambodia','Cameroon','Canada','Chile','China','Colombia','Congo','Croatia',
  'Cuba','Cyprus','Czech Republic','Denmark','Ecuador','Egypt','El Salvador','Estonia',
  'Ethiopia','Finland','France','Gabon','Georgia','Germany','Ghana','Greece','Guatemala',
  'Guinea','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq',
  'Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait',
  'Kyrgyzstan','Laos','Latvia','Lebanon','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Malaysia','Maldives','Mali','Malta','Mexico','Moldova','Monaco','Mongolia','Morocco',
  'Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nigeria','Norway',
  'Oman','Pakistan','Panama','Paraguay','Peru','Philippines','Poland','Portugal','Qatar',
  'Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia','Singapore','Slovakia',
  'Slovenia','Somalia','South Africa','South Korea','Spain','Sri Lanka','Sudan','Sweden',
  'Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Tunisia','Turkey',
  'Turkmenistan','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States',
  'Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
]

export function PassengerForm({ initialPassengerCount = 1, onSubmit, isLoading = false }: PassengerFormProps) {
  const [expandedPassengers, setExpandedPassengers] = useState<Set<number>>(new Set([0]))

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      passengers: Array(initialPassengerCount)
        .fill(null)
        .map(() => ({
          type: 'ADT' as const,
          firstName: '',
          lastName: '',
          dateOfBirth: '',
          gender: 'M' as const,
          passportNumber: '',
          passportExpiry: '',
          nationality: 'United Kingdom',
          email: '',
          phone: '',
        })),
      contactEmail: '',
      contactPhone: '',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'passengers' })

  const togglePassenger = (index: number) => {
    setExpandedPassengers((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  const handleFormSubmit = (data: FormData) =>
    onSubmit(data.passengers as BookingPassenger[], data.contactEmail, data.contactPhone)

  const today = new Date().toISOString().split('T')[0]
  const minExpiry = new Date()
  minExpiry.setMonth(minExpiry.getMonth() + 6)
  const minExpiryDate = minExpiry.toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">

      {/* ── Contact Information ─────────────────────────────────────────────── */}
      <div className="bg-walz-off-white rounded-2xl border border-walz-border p-5 lg:p-6">
        <h3 className="font-display text-lg font-bold text-walz-deep-navy mb-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy text-xs font-bold">1</div>
          Contact Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Email */}
          <div>
            <label className="label-walz">Email Address *</label>
            <Input
              type="email"
              placeholder="your@email.com"
              {...register('contactEmail')}
              className={cn(errors.contactEmail && 'border-walz-error')}
            />
            <p className="text-walz-muted text-xs mt-1">Confirmation and e-ticket sent here</p>
            {errors.contactEmail && (
              <p className="text-walz-error text-xs mt-1">{errors.contactEmail.message}</p>
            )}
          </div>

          {/* WhatsApp */}
          <div>
            <label className="label-walz flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-green-600" />
              WhatsApp Number *
            </label>
            <Input
              type="tel"
              placeholder="+44 7911 123456"
              {...register('contactPhone')}
              className={cn(errors.contactPhone && 'border-walz-error')}
            />
            <p className="text-walz-muted text-xs mt-1">Include country code · We'll send updates here</p>
            {errors.contactPhone && (
              <p className="text-walz-error text-xs mt-1">{errors.contactPhone.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Passengers ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="bg-white rounded-2xl border border-walz-border overflow-hidden">

            {/* Passenger header */}
            <button
              type="button"
              onClick={() => togglePassenger(index)}
              className="w-full flex items-center justify-between p-4 lg:p-5 hover:bg-walz-off-white transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-walz-off-white border border-walz-border flex items-center justify-center">
                  <User className="w-4 h-4 text-walz-muted" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-walz-deep-navy text-sm">
                    Passenger {index + 1}
                    {index === 0 && <span className="ml-2 text-xs text-walz-muted font-normal">(Lead)</span>}
                  </div>
                  <div className="text-xs text-walz-muted">
                    <select
                      onClick={(e) => e.stopPropagation()}
                      className="bg-transparent text-walz-muted text-xs border-none outline-none cursor-pointer"
                      {...register(`passengers.${index}.type`)}
                    >
                      <option value="ADT">Adult (12+)</option>
                      <option value="CHD">Child (2–11)</option>
                      <option value="INF">Infant (0–1)</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(index) }}
                    className="p-1.5 rounded-lg text-walz-error hover:bg-red-50 transition-colors"
                    aria-label="Remove passenger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {expandedPassengers.has(index)
                  ? <ChevronUp className="w-4 h-4 text-walz-muted" />
                  : <ChevronDown className="w-4 h-4 text-walz-muted" />}
              </div>
            </button>

            {/* Passenger fields */}
            {expandedPassengers.has(index) && (
              <div className="px-4 lg:px-5 pb-5 border-t border-walz-border pt-4 space-y-4">
                <p className="text-xs text-walz-muted bg-walz-gold/10 border border-walz-gold/20 rounded-lg px-3 py-2">
                  ✈️ All details must exactly match the passenger&apos;s passport
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                  {/* First Name */}
                  <div>
                    <label className="label-walz">First Name * <span className="text-walz-muted font-normal">(as on passport)</span></label>
                    <Input
                      placeholder="e.g. JAMES"
                      className={cn('uppercase', errors.passengers?.[index]?.firstName && 'border-walz-error')}
                      {...register(`passengers.${index}.firstName`)}
                    />
                    {errors.passengers?.[index]?.firstName && (
                      <p className="text-walz-error text-xs mt-1">{errors.passengers[index]?.firstName?.message}</p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="label-walz">Last Name * <span className="text-walz-muted font-normal">(as on passport)</span></label>
                    <Input
                      placeholder="e.g. SMITH"
                      className={cn('uppercase', errors.passengers?.[index]?.lastName && 'border-walz-error')}
                      {...register(`passengers.${index}.lastName`)}
                    />
                    {errors.passengers?.[index]?.lastName && (
                      <p className="text-walz-error text-xs mt-1">{errors.passengers[index]?.lastName?.message}</p>
                    )}
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="label-walz">Gender *</label>
                    <select className="input-walz h-10" {...register(`passengers.${index}.gender`)}>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="label-walz">Date of Birth *</label>
                    <Input
                      type="date"
                      max={today}
                      className={cn(errors.passengers?.[index]?.dateOfBirth && 'border-walz-error')}
                      {...register(`passengers.${index}.dateOfBirth`)}
                    />
                    {errors.passengers?.[index]?.dateOfBirth && (
                      <p className="text-walz-error text-xs mt-1">{errors.passengers[index]?.dateOfBirth?.message}</p>
                    )}
                  </div>

                  {/* Nationality */}
                  <div>
                    <label className="label-walz">Nationality *</label>
                    <select className="input-walz h-10" {...register(`passengers.${index}.nationality`)}>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Passport Number */}
                  <div>
                    <label className="label-walz">Passport Number *</label>
                    <Input
                      placeholder="e.g. 123456789"
                      className={cn('uppercase', errors.passengers?.[index]?.passportNumber && 'border-walz-error')}
                      {...register(`passengers.${index}.passportNumber`)}
                    />
                    {errors.passengers?.[index]?.passportNumber && (
                      <p className="text-walz-error text-xs mt-1">{errors.passengers[index]?.passportNumber?.message}</p>
                    )}
                  </div>

                  {/* Passport Expiry */}
                  <div>
                    <label className="label-walz">Passport Expiry *</label>
                    <Input
                      type="date"
                      min={minExpiryDate}
                      className={cn(errors.passengers?.[index]?.passportExpiry && 'border-walz-error')}
                      {...register(`passengers.${index}.passportExpiry`)}
                    />
                    <p className="text-walz-muted text-xs mt-1">Must be valid for 6+ months</p>
                    {errors.passengers?.[index]?.passportExpiry && (
                      <p className="text-walz-error text-xs mt-1">{errors.passengers[index]?.passportExpiry?.message}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="label-walz">
                      Email Address {index === 0 ? '*' : '(optional)'}
                    </label>
                    <Input
                      type="email"
                      placeholder="passenger@email.com"
                      {...register(`passengers.${index}.email`)}
                    />
                    {index === 0 && (
                      <p className="text-walz-muted text-xs mt-1">E-ticket will be sent here</p>
                    )}
                  </div>

                  {/* WhatsApp / Phone */}
                  <div>
                    <label className="label-walz flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                      WhatsApp {index === 0 ? '*' : '(optional)'}
                    </label>
                    <Input
                      type="tel"
                      placeholder="+44 7911 123456"
                      {...register(`passengers.${index}.phone`)}
                    />
                    <p className="text-walz-muted text-xs mt-1">Include country code</p>
                  </div>

                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Add Passenger ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          const idx = fields.length
          append({ type: 'ADT', firstName: '', lastName: '', dateOfBirth: '', gender: 'M', passportNumber: '', passportExpiry: '', nationality: 'United Kingdom', email: '', phone: '' })
          setExpandedPassengers((prev) => new Set([...prev, idx]))
        }}
        className="w-full py-3 rounded-xl border-2 border-dashed border-walz-border hover:border-walz-gold text-walz-muted hover:text-walz-gold transition-all flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Another Passenger
      </button>

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button type="submit" variant="gold" size="lg" disabled={isLoading} className="min-w-[200px]">
          {isLoading ? 'Saving…' : 'Continue to Payment →'}
        </Button>
      </div>
    </form>
  )
}
