'use client'

// Route-fix (P1 regression, 2026-09): a Next.js App Router `page.tsx` may
// only have a default export (plus the small documented allow-list like
// `metadata`/`generateStaticParams`) — `next build`'s own page-shape check
// rejects any other named export, e.g. `error TS: "mcLegsChronologyError"
// is not a valid Page export field.` (caught here only by a REAL `next
// build`, not by `tsc --noEmit` or jest, since it's a Next-specific
// typegen check). All of this page's actual implementation therefore lives
// in the sibling `NewQuotePageContent.tsx` (a plain, non-page module with
// no export restrictions), which is free to export `NewQuoteInner` and the
// `mcLegsChronologyError` helper for the route-level test
// (__tests__/quotes-new-page-v14-route-fix.test.tsx) to import directly.
// This file stays a pure route shell — no logic, no other exports.
import { Suspense } from 'react'
import { NewQuoteInner } from './NewQuotePageContent'

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading…</div>}>
      <NewQuoteInner />
    </Suspense>
  )
}
