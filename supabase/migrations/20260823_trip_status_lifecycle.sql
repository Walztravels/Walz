-- Release 2C: Extend TripStatus enum with payment-lifecycle values.
-- Run in Supabase SQL editor.
-- These values are provider-independent; Stripe/Flutterwave/Paystack/Bank Transfer
-- all drive the same lifecycle transitions.

ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'CHECKOUT_STARTED';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'CONFIRMING';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_CONFIRMED';
