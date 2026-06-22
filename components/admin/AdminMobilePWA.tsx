'use client'

import { useState } from 'react'
import { ServiceWorkerRegistration } from './ServiceWorkerRegistration'
import { MobileNav } from './MobileNav'
import { MobileMoreDrawer } from './MobileMoreDrawer'
import { PWAInstallPrompt } from './PWAInstallPrompt'

export function AdminMobilePWA() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <ServiceWorkerRegistration />
      <PWAInstallPrompt />
      <MobileNav onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileMoreDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
