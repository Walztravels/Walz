/**
 * Walz Orbit — Graphic Designer template registry.
 *
 * All five Walz template families are exported here.
 * Import from this file, not individual template files.
 */

export { walzHeroSplit }           from './walz-hero-split'
export { walzDestinationEditorial } from './walz-destination-editorial'
export { walzInformationPoster }   from './walz-information-poster'
export { walzSeasonalCampaign }    from './walz-seasonal-campaign'
export { walzTravelCollage }        from './walz-travel-collage'
export type {
  WalzTemplate,
  TemplateCanvas,
  CampaignType,
  CommercialFieldConfig,
  ArtDirection,
  CreativeBrief,
} from './schema'
export { TEMPLATE_CANVASES, CAMPAIGN_TYPE_LABELS } from './schema'

import { walzHeroSplit }           from './walz-hero-split'
import { walzDestinationEditorial } from './walz-destination-editorial'
import { walzInformationPoster }   from './walz-information-poster'
import { walzSeasonalCampaign }    from './walz-seasonal-campaign'
import { walzTravelCollage }        from './walz-travel-collage'
import type { WalzTemplate, CampaignType } from './schema'

export const ALL_TEMPLATES: WalzTemplate[] = [
  walzHeroSplit,
  walzDestinationEditorial,
  walzInformationPoster,
  walzSeasonalCampaign,
  walzTravelCollage,
]

export const TEMPLATE_MAP: Record<string, WalzTemplate> = Object.fromEntries(
  ALL_TEMPLATES.map(t => [t.key, t])
)

/** Returns templates appropriate for a given campaign type. */
export function templatesForCampaignType(type: CampaignType): WalzTemplate[] {
  return ALL_TEMPLATES.filter(t => t.campaignTypes.includes(type))
}
