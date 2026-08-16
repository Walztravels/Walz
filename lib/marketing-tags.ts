/** Canonical tag list shared by the media library and the design upload page. */
export const TAGS = ['visa', 'flights', 'tours', 'testimonial', 'destination', 'team', 'general'] as const

export type MediaTag = typeof TAGS[number]
