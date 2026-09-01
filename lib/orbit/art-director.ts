/**
 * Walz Orbit Art Director — converts a simple staff brief into a structured CreativeBrief.
 *
 * The Art Director is powered by Claude (claude-haiku-4-5-20251001).
 * It translates a short natural-language description into a structured
 * CreativeBrief that the VisualPromptBuilder can then use to construct
 * a detailed image generation prompt.
 *
 * CRITICAL: The Art Director NEVER generates commercial values
 * (prices, routes, salaries, legal terms, programme guarantees).
 * It only generates visual creative direction.
 */

import Anthropic from '@anthropic-ai/sdk'
import { ALL_TEMPLATES, TEMPLATE_MAP, type WalzTemplate } from './templates'
import type { CampaignType, CreativeBrief } from './templates/schema'

const anthropic = new Anthropic()

interface ArtDirectorInput {
  campaignDescription: string
  campaignType:        CampaignType
  preferredTemplate?:  string
  brandPreset?:        string
  canvasKey?:          string
}

interface ArtDirectorOutput {
  brief: CreativeBrief
  template: WalzTemplate
  reasoning: string
}

const SYSTEM_PROMPT = `You are the Art Director for Walz Travels, a premium travel agency.
Your job is to convert a short campaign description into a structured visual creative brief.

CRITICAL RULES:
- You NEVER generate commercial values: no prices, no routes, no salaries, no visa fees, no legal guarantees.
- You ONLY describe VISUAL elements: what you see in a photograph, how it is lit, composed, and styled.
- Think like a commercial photographer, not a copywriter.
- Be specific and vivid about visual details: lighting direction, colour palette, composition, depth.
- Output ONLY valid JSON matching the specified schema.`

const USER_PROMPT_TEMPLATE = (
  input: ArtDirectorInput,
  templates: WalzTemplate[],
): string => `
Campaign type: ${input.campaignType}
Campaign description: ${input.campaignDescription}
${input.preferredTemplate ? `Preferred template: ${input.preferredTemplate}` : ''}
${input.brandPreset ? `Brand preset: ${input.brandPreset}` : ''}

Available templates:
${templates.map(t => `- ${t.key}: ${t.description} (campaignTypes: ${t.campaignTypes.join(', ')})`).join('\n')}

Return a JSON object with this exact structure:
{
  "templateKey": "<one of the template keys above>",
  "visualMood": "<3-6 word mood descriptor for the image, no commercial info>",
  "subject": "<specific visual subject to photograph, no commercial info>",
  "environment": "<location / setting description, no commercial info>",
  "lighting": "<specific lighting description: direction, quality, time of day>",
  "composition": "<composition technique: rule of thirds, leading lines, etc.>",
  "decorativeElements": ["<visual element>", "<visual element>"],
  "requiredCommercialFields": [],
  "reasoning": "<1-2 sentences why you chose this template and visual direction>"
}

IMPORTANT: decorativeElements and all fields describe ONLY visual photographic elements.
Never mention prices, routes, fees, or any commercial values.`

export async function runArtDirector(input: ArtDirectorInput): Promise<ArtDirectorOutput> {
  const eligibleTemplates = input.preferredTemplate
    ? [TEMPLATE_MAP[input.preferredTemplate]].filter(Boolean)
    : ALL_TEMPLATES.filter(t => t.campaignTypes.includes(input.campaignType))

  const templates = eligibleTemplates.length > 0 ? eligibleTemplates : ALL_TEMPLATES

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages: [
      {
        role:    'user',
        content: USER_PROMPT_TEMPLATE(input, templates),
      },
    ],
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  let parsed: {
    templateKey:              string
    visualMood:               string
    subject:                  string
    environment:              string
    lighting:                 string
    composition:              string
    decorativeElements:       string[]
    requiredCommercialFields: string[]
    reasoning:                string
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in Art Director response')
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(`Art Director returned invalid JSON: ${err instanceof Error ? err.message : err}`)
  }

  const template = TEMPLATE_MAP[parsed.templateKey] ?? templates[0]

  const brief: CreativeBrief = {
    campaignType:            input.campaignType,
    templateKey:             template.key,
    visualMood:              parsed.visualMood,
    subject:                 parsed.subject,
    environment:             parsed.environment,
    lighting:                parsed.lighting,
    composition:             parsed.composition,
    decorativeElements:      parsed.decorativeElements ?? [],
    requiredCommercialFields: [],
  }

  return {
    brief,
    template,
    reasoning: parsed.reasoning,
  }
}
