/**
 * V1.4 Jade Staff Communication Intelligence — model invocation abstraction
 * (owner decision 16).
 *
 * The architecture audit confirmed NO shared "call the model" library exists
 * anywhere in this codebase — every Jade route builds its own client inline,
 * with no timeout, no retry, no token/cost tracking, and inconsistent
 * provider fallback ordering. This module is scoped to V1.4 ONLY: it does
 * not migrate any existing (legacy) Jade endpoint, and none of those
 * endpoints import from here. A platform-wide Jade consolidation is
 * explicitly deferred to a later release.
 *
 * Provides: central model configuration, a per-call timeout (never relying
 * on the Next.js route's overall maxDuration alone), Claude -> OpenAI
 * provider fallback, an optional FORCED tool call for structured output
 * (mirroring the one existing strong precedent, app/api/admin/email/jade/
 * route.ts's draft_email tool), a bounded max output size, and safe
 * observability logging — generation id, operation, model, provider,
 * latency, and token usage where the provider response exposes it. Prompt
 * text, conversation content, and generated output are NEVER logged.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const PRIMARY_MODEL = { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' }
const FALLBACK_MODEL = { provider: 'openai' as const, model: 'gpt-4o-mini' }

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_TOKENS = 1000
/** Hard ceiling regardless of what a caller requests — a rewrite must never unexpectedly generate pages of text. */
const MAX_TOKENS_CEILING = 2000

export interface ModelToolSchema {
  name: string
  description: string
  /** JSON-Schema-shaped input schema (same shape Anthropic/OpenAI both expect). */
  inputSchema: Record<string, unknown>
}

export interface ModelCallOptions {
  /** Short label for observability only, e.g. 'fix_writing', 'draft_reply'. Never logged content, just this label. */
  operation: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  /** When set, forces structured output via a tool call rather than free text. */
  tool?: ModelToolSchema
  /** Optional correlation id — generated internally if omitted. */
  generationId?: string
}

export interface ModelUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface ModelCallSuccess {
  ok: true
  /** Plain-text output, OR JSON.stringify(toolInput) when a tool was forced — callers needing the structured object should read toolInput instead. */
  text: string
  toolInput?: Record<string, unknown>
  model: string
  provider: 'anthropic' | 'openai'
  usage: ModelUsage
  latencyMs: number
}

export type ModelCallFailureCode = 'MODEL_UNAVAILABLE' | 'MODEL_EMPTY_OUTPUT'

export interface ModelCallFailure {
  ok: false
  code: ModelCallFailureCode
  message: string
}

export type ModelCallResult = ModelCallSuccess | ModelCallFailure

function boundedMaxTokens(requested: number | undefined): number {
  const value = requested ?? DEFAULT_MAX_TOKENS
  return Math.min(Math.max(value, 1), MAX_TOKENS_CEILING)
}

function log(fields: Record<string, string | number | undefined>) {
  const line = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  console.log(`[jade-assist:model] ${line}`)
}

async function callAnthropic(opts: ModelCallOptions, maxTokens: number): Promise<ModelCallSuccess> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
  const started = Date.now()

  const params: Anthropic.MessageCreateParams = {
    model: PRIMARY_MODEL.model,
    max_tokens: maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userMessage }],
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }
  if (opts.tool) {
    params.tools = [{
      name: opts.tool.name,
      description: opts.tool.description,
      input_schema: opts.tool.inputSchema as Anthropic.Tool.InputSchema,
    }]
    params.tool_choice = { type: 'tool', name: opts.tool.name }
  }

  const message = await anthropic.messages.create(params, {
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
  const latencyMs = Date.now() - started

  let text = ''
  let toolInput: Record<string, unknown> | undefined
  if (opts.tool) {
    const toolBlock = message.content.find(
      (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === opts.tool!.name,
    )
    if (toolBlock) {
      toolInput = toolBlock.input as Record<string, unknown>
      text = JSON.stringify(toolInput)
    }
  } else {
    const textBlock = message.content.find((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    text = textBlock?.text ?? ''
  }

  return {
    ok: true,
    text,
    toolInput,
    model: PRIMARY_MODEL.model,
    provider: 'anthropic',
    usage: {
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
    },
    latencyMs,
  }
}

async function callOpenAI(opts: ModelCallOptions, maxTokens: number): Promise<ModelCallSuccess> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  const started = Date.now()

  const tools = opts.tool
    ? [{
        type: 'function' as const,
        function: { name: opts.tool.name, description: opts.tool.description, parameters: opts.tool.inputSchema },
      }]
    : undefined

  const completion = await openai.chat.completions.create(
    {
      model: FALLBACK_MODEL.model,
      max_tokens: maxTokens,
      temperature: opts.temperature,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
      ...(tools ? { tools, tool_choice: { type: 'function', function: { name: opts.tool!.name } } } : {}),
    },
    { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS },
  )
  const latencyMs = Date.now() - started

  let text = ''
  let toolInput: Record<string, unknown> | undefined
  const choice = completion.choices?.[0]
  const toolCall = choice?.message?.tool_calls?.find(
    (c): c is Extract<typeof c, { type: 'function' }> => c.type === 'function' && c.function?.name === opts.tool?.name,
  )
  if (toolCall) {
    try {
      toolInput = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
      text = JSON.stringify(toolInput)
    } catch { /* fall through to empty text — treated as empty output below */ }
  } else {
    text = choice?.message?.content ?? ''
  }

  return {
    ok: true,
    text,
    toolInput,
    model: FALLBACK_MODEL.model,
    provider: 'openai',
    usage: {
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    },
    latencyMs,
  }
}

/**
 * Calls the primary model (Claude), falling back to OpenAI on any failure
 * (timeout, provider error, or empty output). Never throws — every failure
 * mode returns `{ ok: false, code, message }`.
 */
export async function callJadeModel(options: ModelCallOptions): Promise<ModelCallResult> {
  const generationId = options.generationId ?? crypto.randomUUID()
  const maxTokens = boundedMaxTokens(options.maxTokens)

  try {
    const result = await callAnthropic(options, maxTokens)
    if (result.text.trim().length > 0) {
      log({
        generationId, operation: options.operation, model: result.model, provider: result.provider,
        latencyMs: result.latencyMs, tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens,
        outcome: 'ok',
      })
      return result
    }
    log({ generationId, operation: options.operation, model: result.model, provider: result.provider, outcome: 'empty_output_trying_fallback' })
  } catch (err) {
    log({ generationId, operation: options.operation, model: PRIMARY_MODEL.model, provider: 'anthropic', outcome: 'error_trying_fallback', errorType: err instanceof Error ? err.constructor.name : 'unknown' })
  }

  try {
    const result = await callOpenAI(options, maxTokens)
    if (result.text.trim().length > 0) {
      log({
        generationId, operation: options.operation, model: result.model, provider: result.provider,
        latencyMs: result.latencyMs, tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens,
        outcome: 'ok_fallback',
      })
      return result
    }
    log({ generationId, operation: options.operation, model: result.model, provider: result.provider, outcome: 'empty_output_fallback_exhausted' })
    return { ok: false, code: 'MODEL_EMPTY_OUTPUT', message: 'Jade returned an empty response. Please try again.' }
  } catch (err) {
    log({ generationId, operation: options.operation, model: FALLBACK_MODEL.model, provider: 'openai', outcome: 'error_fallback_exhausted', errorType: err instanceof Error ? err.constructor.name : 'unknown' })
    return { ok: false, code: 'MODEL_UNAVAILABLE', message: 'Jade is unavailable right now. Please try again in a moment.' }
  }
}
