import { prisma } from '@/lib/db'
import { ITINERARY_PUBLIC_STATUSES, GENERIC_ITINERARY_METADATA, buildItineraryMetadata, type ItineraryPreviewInput } from './og-metadata'
import type { Metadata } from 'next'

/**
 * Loads ONLY the preview columns of a PUBLIC itinerary (same status gate as
 * the page). Returns null for unknown / non-public refs and on any DB error.
 */
export async function loadPublicItineraryPreview(ref: string): Promise<ItineraryPreviewInput | null> {
  try {
    if (typeof ref !== 'string' || !ref || ref.length > 100) return null
    const row = await prisma.itinerary.findUnique({
      where: { referenceNumber: ref },
      select: { referenceNumber: true, status: true, clientName: true, destination: true, startDate: true, endDate: true, coverImage: true },
    })
    if (!row) return null
    if (!(ITINERARY_PUBLIC_STATUSES as readonly string[]).includes(row.status)) return null
    return {
      referenceNumber: row.referenceNumber,
      clientName: row.clientName,
      destination: row.destination,
      startDate: row.startDate,
      endDate: row.endDate,
      coverImage: row.coverImage,
    }
  } catch {
    return null
  }
}

export async function resolveItineraryMetadata(ref: string): Promise<Metadata> {
  const preview = await loadPublicItineraryPreview(ref)
  return preview ? buildItineraryMetadata(preview) : GENERIC_ITINERARY_METADATA
}
