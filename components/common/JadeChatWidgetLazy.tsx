'use client'

import dynamic from 'next/dynamic'

// The Jade chat widget is ~1k lines of client code rendered on EVERY page.
// Loading it with ssr:false splits it into its own async chunk fetched
// after hydration, so it never sits in the critical first-load JS. The
// widget itself is unchanged — same floating button, same behaviour.
const JadeChatWidget = dynamic(
  () => import('./JadeChatWidget').then(m => ({ default: m.JadeChatWidget })),
  { ssr: false },
)

export default function JadeChatWidgetLazy() {
  return <JadeChatWidget />
}
