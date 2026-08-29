import type { ReactNode } from 'react'

export default function ItineraryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Fonts in <head> before any paint — prevents FOUC */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  )
}
