// Client-safe half of lib/site-settings: the type + static defaults.
//
// lib/site-settings imports Prisma and next/cache, so a 'use client' module
// (SettingsProvider) importing SETTING_DEFAULTS from there pulled the whole
// server stack into the first-load JS of every page. Only pure values live
// here; the DB-backed getter stays in lib/site-settings (which re-exports
// these for existing server callers).
import { BUSINESS } from '@/lib/config/business'

export type SiteSettings = {
  whatsapp_header: string
  whatsapp_header_display: string
  whatsapp_cta: string
  whatsapp_cta_display: string
  phone_uk: string
  phone_canada: string
  phone_uae: string
  phone_nigeria: string
  phone_ghana: string
  footer_wa_1_label: string
  footer_wa_1_number: string
  footer_wa_2_label: string
  footer_wa_2_number: string
  footer_wa_3_label: string
  footer_wa_3_number: string
  footer_wa_4_label: string
  footer_wa_4_number: string
  business_address: string
  business_email: string
  business_name: string
}

export const SETTING_DEFAULTS: SiteSettings = {
  whatsapp_header:         BUSINESS.contacts.globalWhatsapp.display,
  whatsapp_header_display: BUSINESS.contacts.globalWhatsapp.display,
  whatsapp_cta:            BUSINESS.contacts.globalWhatsapp.display,
  whatsapp_cta_display:    BUSINESS.contacts.globalWhatsapp.display,
  phone_uk:                BUSINESS.contacts.globalWhatsapp.display,
  phone_canada:            '+13657200865',
  phone_uae:               '+971000000000',
  phone_nigeria:           BUSINESS.contacts.nigeriaWhatsapp.display,
  phone_ghana:             '+2330000000000',
  footer_wa_1_label:       'WhatsApp UK',
  footer_wa_1_number:      BUSINESS.contacts.globalWhatsapp.display,
  footer_wa_2_label:       'WhatsApp Canada',
  footer_wa_2_number:      '+13657200865',
  footer_wa_3_label:       '',
  footer_wa_3_number:      '',
  footer_wa_4_label:       '',
  footer_wa_4_number:      '',
  business_address:        'THE WALZ TRAVELS INC · Ontario, Canada · Registered in England & Wales',
  business_email:          'contact@walztravels.com',
  business_name:           'Walz Travels Ltd',
}
