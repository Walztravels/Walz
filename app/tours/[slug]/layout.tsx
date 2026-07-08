import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  return {
    alternates: { canonical: `https://www.walztravels.com/tours/${params.slug}` },
  }
}

export default function TourSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
