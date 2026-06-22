import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// One-time migration endpoint — runs the schema SQL via Prisma's $executeRawUnsafe.
// Protected by admin session. Call once, then the tables exist forever.
export async function POST(req: NextRequest) {
  // Allow admin session OR CRON_SECRET header (for CLI-triggered runs)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const cronOk     = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!cronOk && !(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const statements = [
    // Enums
    `CREATE TYPE IF NOT EXISTS "BookingType" AS ENUM ('FLIGHT', 'HOTEL', 'PACKAGE')`,
    `CREATE TYPE IF NOT EXISTS "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'FAILED')`,
    `CREATE TYPE IF NOT EXISTS "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED')`,
    `CREATE TYPE IF NOT EXISTS "VisaApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN')`,
    `CREATE TYPE IF NOT EXISTS "TourEnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'BOOKED', 'CANCELLED')`,

    // Tables
    `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL,"name" TEXT,"email" TEXT,"emailVerified" TIMESTAMP(3),"image" TEXT,"stripeCustomerId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "Account" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"type" TEXT NOT NULL,"provider" TEXT NOT NULL,"providerAccountId" TEXT NOT NULL,"refresh_token" TEXT,"access_token" TEXT,"expires_at" INTEGER,"token_type" TEXT,"scope" TEXT,"id_token" TEXT,"session_state" TEXT,CONSTRAINT "Account_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT NOT NULL,"sessionToken" TEXT NOT NULL,"userId" TEXT NOT NULL,"expires" TIMESTAMP(3) NOT NULL,CONSTRAINT "Session_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "VerificationToken" ("identifier" TEXT NOT NULL,"token" TEXT NOT NULL,"expires" TIMESTAMP(3) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS "Booking" ("id" TEXT NOT NULL,"userId" TEXT,"bookingReference" TEXT NOT NULL,"pnr" TEXT,"type" "BookingType" NOT NULL,"status" "BookingStatus" NOT NULL DEFAULT 'PENDING',"paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',"totalAmount" DOUBLE PRECISION NOT NULL,"currency" TEXT NOT NULL DEFAULT 'GBP',"stripePaymentIntentId" TEXT,"stripeClientSecret" TEXT,"contactEmail" TEXT NOT NULL,"contactPhone" TEXT,"flightDetails" JSONB,"hotelDetails" JSONB,"passengers" JSONB,"addons" JSONB,"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "VisaApplication" ("id" TEXT NOT NULL,"userId" TEXT,"status" "VisaApplicationStatus" NOT NULL DEFAULT 'DRAFT',"firstName" TEXT NOT NULL,"lastName" TEXT NOT NULL,"email" TEXT NOT NULL,"phone" TEXT NOT NULL,"dateOfBirth" TEXT NOT NULL,"nationality" TEXT NOT NULL,"destinationCountry" TEXT NOT NULL,"visaType" TEXT NOT NULL,"travelDate" TEXT NOT NULL,"returnDate" TEXT,"purpose" TEXT NOT NULL,"passportNumber" TEXT NOT NULL,"passportExpiry" TEXT NOT NULL,"hasOnwardTicket" BOOLEAN NOT NULL DEFAULT false,"hasAccommodation" BOOLEAN NOT NULL DEFAULT false,"previousRefusal" BOOLEAN NOT NULL DEFAULT false,"processingFee" DOUBLE PRECISION,"currency" TEXT NOT NULL DEFAULT 'GBP',"referenceNumber" TEXT,"additionalInfo" TEXT,"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "VisaApplication_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "TourEnquiry" ("id" TEXT NOT NULL,"userId" TEXT,"status" "TourEnquiryStatus" NOT NULL DEFAULT 'NEW',"firstName" TEXT NOT NULL,"lastName" TEXT NOT NULL,"email" TEXT NOT NULL,"phone" TEXT NOT NULL,"tourName" TEXT NOT NULL,"tourDate" TEXT NOT NULL,"groupSize" INTEGER NOT NULL,"specialRequirements" TEXT,"preferredPickupLocation" TEXT,"quotedPrice" DOUBLE PRECISION,"currency" TEXT NOT NULL DEFAULT 'GBP',"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "TourEnquiry_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "SiteSetting" ("id" TEXT NOT NULL,"key" TEXT NOT NULL,"value" TEXT NOT NULL,"label" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "WidgetConfig" ("id" TEXT NOT NULL,"key" TEXT NOT NULL,"label" TEXT NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT true,"order" INTEGER NOT NULL DEFAULT 0,CONSTRAINT "WidgetConfig_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "FeaturedDeal" ("id" TEXT NOT NULL,"origin" TEXT NOT NULL,"destination" TEXT NOT NULL,"price" DOUBLE PRECISION NOT NULL,"currency" TEXT NOT NULL DEFAULT 'GBP',"airline" TEXT,"imageUrl" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"order" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "FeaturedDeal_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "TourListing" ("id" TEXT NOT NULL,"name" TEXT NOT NULL,"slug" TEXT NOT NULL,"description" TEXT NOT NULL,"highlights" TEXT NOT NULL DEFAULT '[]',"price" DOUBLE PRECISION NOT NULL,"currency" TEXT NOT NULL DEFAULT 'GBP',"duration" TEXT NOT NULL,"location" TEXT NOT NULL,"imageUrl" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"order" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "TourListing_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "VisaService" ("id" TEXT NOT NULL,"country" TEXT NOT NULL,"flag" TEXT,"visaType" TEXT NOT NULL,"processingTime" TEXT NOT NULL,"fee" DOUBLE PRECISION NOT NULL,"currency" TEXT NOT NULL DEFAULT 'GBP',"requirements" TEXT NOT NULL DEFAULT '[]',"imageUrl" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "VisaService_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "SiteImage" ("id" TEXT NOT NULL,"key" TEXT NOT NULL,"label" TEXT NOT NULL,"url" TEXT NOT NULL,"bucket" TEXT NOT NULL DEFAULT 'walz-images',"path" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "SiteImage_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "BlogPost" ("id" TEXT NOT NULL,"title" TEXT NOT NULL,"slug" TEXT NOT NULL,"content" TEXT NOT NULL,"excerpt" TEXT,"category" TEXT NOT NULL DEFAULT 'Travel Tips',"featuredImageUrl" TEXT,"metaDescription" TEXT,"published" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "Voucher" ("id" TEXT NOT NULL,"code" TEXT NOT NULL,"name" TEXT,"voucherKind" TEXT NOT NULL DEFAULT 'gift',"serviceType" TEXT NOT NULL DEFAULT 'all',"discountType" TEXT NOT NULL DEFAULT 'fixed',"amount" DOUBLE PRECISION NOT NULL,"currency" TEXT NOT NULL DEFAULT 'GBP',"remainingAmount" DOUBLE PRECISION NOT NULL,"tourName" TEXT,"maxUses" INTEGER NOT NULL DEFAULT 1,"usedCount" INTEGER NOT NULL DEFAULT 0,"status" TEXT NOT NULL DEFAULT 'ACTIVE',"active" BOOLEAN NOT NULL DEFAULT true,"senderName" TEXT,"senderEmail" TEXT,"recipientName" TEXT,"recipientEmail" TEXT,"personalMessage" TEXT,"scheduledDeliveryDate" TIMESTAMP(3),"sentAt" TIMESTAMP(3),"redeemedAt" TIMESTAMP(3),"redeemedBookingId" TEXT,"paymentReference" TEXT,"paymentGateway" TEXT,"paidAmount" DOUBLE PRECISION,"validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id"))`,

    // Unique indexes
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId")`,
    `CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken")`,
    `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Booking_bookingReference_key" ON "Booking"("bookingReference")`,
    `CREATE INDEX IF NOT EXISTS "Booking_userId_idx" ON "Booking"("userId")`,
    `CREATE INDEX IF NOT EXISTS "Booking_bookingReference_idx" ON "Booking"("bookingReference")`,
    `CREATE INDEX IF NOT EXISTS "Booking_pnr_idx" ON "Booking"("pnr")`,
    `CREATE INDEX IF NOT EXISTS "Booking_stripePaymentIntentId_idx" ON "Booking"("stripePaymentIntentId")`,
    `CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status")`,
    `CREATE INDEX IF NOT EXISTS "Booking_createdAt_idx" ON "Booking"("createdAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "VisaApplication_referenceNumber_key" ON "VisaApplication"("referenceNumber")`,
    `CREATE INDEX IF NOT EXISTS "VisaApplication_userId_idx" ON "VisaApplication"("userId")`,
    `CREATE INDEX IF NOT EXISTS "VisaApplication_email_idx" ON "VisaApplication"("email")`,
    `CREATE INDEX IF NOT EXISTS "VisaApplication_status_idx" ON "VisaApplication"("status")`,
    `CREATE INDEX IF NOT EXISTS "VisaApplication_destinationCountry_idx" ON "VisaApplication"("destinationCountry")`,
    `CREATE INDEX IF NOT EXISTS "TourEnquiry_userId_idx" ON "TourEnquiry"("userId")`,
    `CREATE INDEX IF NOT EXISTS "TourEnquiry_email_idx" ON "TourEnquiry"("email")`,
    `CREATE INDEX IF NOT EXISTS "TourEnquiry_status_idx" ON "TourEnquiry"("status")`,
    `CREATE INDEX IF NOT EXISTS "TourEnquiry_tourName_idx" ON "TourEnquiry"("tourName")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "SiteSetting_key_key" ON "SiteSetting"("key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WidgetConfig_key_key" ON "WidgetConfig"("key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "TourListing_slug_key" ON "TourListing"("slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "VisaService_country_visaType_key" ON "VisaService"("country", "visaType")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "SiteImage_key_key" ON "SiteImage"("key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug")`,
    `CREATE INDEX IF NOT EXISTS "BlogPost_published_idx" ON "BlogPost"("published")`,
    `CREATE INDEX IF NOT EXISTS "BlogPost_category_idx" ON "BlogPost"("category")`,
    `CREATE INDEX IF NOT EXISTS "BlogPost_createdAt_idx" ON "BlogPost"("createdAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_code_key" ON "Voucher"("code")`,
    `CREATE INDEX IF NOT EXISTS "Voucher_status_idx" ON "Voucher"("status")`,
    `CREATE INDEX IF NOT EXISTS "Voucher_voucherKind_idx" ON "Voucher"("voucherKind")`,
    `CREATE INDEX IF NOT EXISTS "Voucher_active_idx" ON "Voucher"("active")`,
    `CREATE INDEX IF NOT EXISTS "Voucher_expiresAt_idx" ON "Voucher"("expiresAt")`,

    // Auth: password fields on User (IF NOT EXISTS via DO block)
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='password') THEN ALTER TABLE "User" ADD COLUMN "password" TEXT; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='passwordResetToken') THEN ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='passwordResetExpires') THEN ALTER TABLE "User" ADD COLUMN "passwordResetExpires" TIMESTAMP(3); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='verificationToken') THEN ALTER TABLE "User" ADD COLUMN "verificationToken" TEXT; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='verificationTokenExpires') THEN ALTER TABLE "User" ADD COLUMN "verificationTokenExpires" TIMESTAMP(3); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='stripePaymentMethodId') THEN ALTER TABLE "User" ADD COLUMN "stripePaymentMethodId" TEXT; END IF; END $$`,

    // Upsert super_admin RolePermission — grants all permissions including trips_view and inbox_delete
    `INSERT INTO "RolePermission" (id, role, label, color, permissions, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, 'super_admin', 'Super Admin', '#7C3AED', '{"dashboard_view":true,"dashboard_stats_all":true,"staff_view":true,"staff_create":true,"staff_edit":true,"staff_delete":true,"staff_manage_roles":true,"applications_view":true,"applications_view_all":true,"applications_create":true,"applications_edit":true,"applications_delete":true,"applications_assign":true,"applications_approve":true,"visa_view":true,"visa_view_all":true,"visa_create":true,"visa_edit":true,"visa_delete":true,"visa_approve":true,"trips_view":true,"trips_view_all":true,"trips_create":true,"trips_edit":true,"trips_delete":true,"trips_assign":true,"trips_proposals":true,"bookings_view":true,"bookings_view_all":true,"bookings_create":true,"bookings_edit":true,"bookings_delete":true,"payments_view":true,"payments_view_all":true,"payments_create":true,"payments_edit":true,"payments_delete":true,"payments_refund":true,"reports_view":true,"reports_all":true,"reports_revenue":true,"reports_staff":true,"reports_export":true,"settings_view":true,"settings_edit":true,"settings_roles":true,"settings_integrations":true,"cms_view":true,"cms_edit":true,"cms_publish":true,"inbox_delete":true,"notifications_view":true,"notifications_send":true,"notifications_broadcast":true}'::jsonb, NOW(), NOW())
     ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, "updatedAt" = NOW()`,

    // Foreign keys (ADD IF NOT EXISTS not supported, so we catch errors)
    `ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "TourEnquiry" ADD CONSTRAINT "TourEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ]

  const results: { statement: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = []

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt)
      results.push({ statement: stmt.slice(0, 60) + '…', status: 'ok' })
    } catch (e: unknown) {
      const msg = (e as Error).message ?? ''
      // "already exists" errors are fine — skip them
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        results.push({ statement: stmt.slice(0, 60) + '…', status: 'skipped' })
      } else {
        results.push({ statement: stmt.slice(0, 60) + '…', status: 'error', error: msg })
      }
    }
  }

  const errors = results.filter(r => r.status === 'error')
  return NextResponse.json({
    success: errors.length === 0,
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: errors.length,
    details: results,
  })
}
