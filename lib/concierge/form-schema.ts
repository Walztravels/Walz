// lib/concierge/form-schema.ts
// Form field types, Zod schema, and step-grouping utilities for
// the multi-step ConciergeRequestForm.

import { z } from 'zod'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'daterange'
  | 'time'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'city'
  | 'budget'

export type FieldGroup = 'service' | 'logistics' | 'party' | 'preferences' | 'contact'

export interface FormField {
  key:          string
  label:        string
  type:         FieldType
  group:        FieldGroup
  required:     boolean
  placeholder?: string
  helpText?:    string
  options?:     { value: string; label: string }[]
  min?:         number
  max?:         number
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const FieldTypeSchema = z.enum([
  'text', 'textarea', 'date', 'daterange', 'time',
  'number', 'select', 'multiselect', 'city', 'budget',
])

const FieldGroupSchema = z.enum([
  'service', 'logistics', 'party', 'preferences', 'contact',
])

export const FormFieldSchema = z.object({
  key:         z.string().min(1),
  label:       z.string().min(1),
  type:        FieldTypeSchema,
  group:       FieldGroupSchema,
  required:    z.boolean(),
  placeholder: z.string().optional(),
  helpText:    z.string().optional(),
  options:     z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  min:         z.number().optional(),
  max:         z.number().optional(),
})

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate raw required_fields from the DB.
 * Falls back to [] on any parse failure so pages never crash.
 * The DB may store RequiredField (key/label/type/required/options as string[]),
 * so we coerce it to FormField format before parsing.
 */
export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []

  const results: FormField[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue

    // Coerce legacy RequiredField shape (options: string[]) to FormField shape
    const coerced = {
      key:         (item as Record<string, unknown>).key,
      label:       (item as Record<string, unknown>).label,
      type:        coerceFieldType((item as Record<string, unknown>).type),
      group:       coerceFieldGroup((item as Record<string, unknown>).group),
      required:    Boolean((item as Record<string, unknown>).required),
      placeholder: (item as Record<string, unknown>).placeholder,
      helpText:    (item as Record<string, unknown>).helpText,
      options:     coerceOptions((item as Record<string, unknown>).options),
      min:         (item as Record<string, unknown>).min,
      max:         (item as Record<string, unknown>).max,
    }

    const parsed = FormFieldSchema.safeParse(coerced)
    if (parsed.success) {
      results.push(parsed.data)
    }
    // Silently skip invalid entries — never throw
  }
  return results
}

function coerceFieldType(raw: unknown): string {
  const VALID: FieldType[] = [
    'text', 'textarea', 'date', 'daterange', 'time',
    'number', 'select', 'multiselect', 'city', 'budget',
  ]
  // Map legacy types to extended types
  if (raw === 'select' || VALID.includes(raw as FieldType)) return raw as string
  return 'text'
}

function coerceFieldGroup(raw: unknown): string {
  const VALID: FieldGroup[] = ['service', 'logistics', 'party', 'preferences', 'contact']
  if (VALID.includes(raw as FieldGroup)) return raw as string
  return 'service'
}

function coerceOptions(raw: unknown): { value: string; label: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.map(o => {
    if (typeof o === 'string') return { value: o, label: o }
    if (o && typeof o === 'object' && 'value' in o) return o as { value: string; label: string }
    return null
  }).filter(Boolean) as { value: string; label: string }[]
}

// ── Step order ────────────────────────────────────────────────────────────────

export const STEP_ORDER: FieldGroup[] = [
  'service', 'logistics', 'party', 'preferences', 'contact',
]

/**
 * Group fields by step order. Only includes groups with at least one field.
 * The 'contact' group is always populated via the form's built-in contact step.
 */
export function groupFields(fields: FormField[]): Map<FieldGroup, FormField[]> {
  const map = new Map<FieldGroup, FormField[]>()

  for (const group of STEP_ORDER) {
    const groupFields = fields.filter(f => f.group === group)
    if (groupFields.length > 0) {
      map.set(group, groupFields)
    }
  }

  return map
}
