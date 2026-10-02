'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

// The Jade chat widget is ~1k lines of client code rendered on EVERY page.
// Loading it with ssr:false splits it into its own async chunk fetched
// after hydration, so it never sits in the critical first-load JS. The
// widget itself is unchanged — same floating button, same behaviour.
const JadeChatWidget = dynamic(
  () => import('./JadeChatWidget').then(m => ({ default: m.JadeChatWidget })),
  { ssr: false },
)

export default function JadeChatWidgetLazy() {
  // This component is rendered as a SIBLING of <PublicShell> in
  // app/layout.tsx, not inside it, so PublicShell's own pathname branching
  // (which hides consumer chrome on /admin and /business) does nothing for
  // it. Walz Business (V1-A) is out of scope for any Jade tooling — suppress
  // the global widget on the entire /business/** tree here, independently.
  const pathname = usePathname() ?? ''
  if (pathname.startsWith('/business')) return null

  return <JadeChatWidget />
}
