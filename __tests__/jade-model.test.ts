/**
 * V1.4 — model invocation abstraction (owner decision 16). Verifies:
 * central config, bounded output, Claude -> OpenAI fallback, forced
 * structured tool output, and that failures never throw.
 */
const mockAnthropicCreate = jest.fn()
const mockOpenAICreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } }))
})
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockOpenAICreate } } }))
})

import { callJadeModel } from '@/lib/jade/assist/model'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.OPENAI_API_KEY = 'test-key'
})

describe('callJadeModel — primary (Anthropic) success', () => {
  it('returns the text output and usage from Claude on success', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello, professionally rewritten.' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    })
    const result = await callJadeModel({ operation: 'fix_writing', systemPrompt: 'sys', userMessage: 'msg' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.text).toBe('Hello, professionally rewritten.')
    expect(result.provider).toBe('anthropic')
    expect(result.usage.inputTokens).toBe(50)
    expect(result.usage.outputTokens).toBe(20)
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('bounds maxTokens to the hard ceiling regardless of what was requested', async () => {
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }], usage: {} })
    await callJadeModel({ operation: 'summarize', systemPrompt: 'sys', userMessage: 'msg', maxTokens: 999999 })
    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    expect(callArgs.max_tokens).toBeLessThanOrEqual(2000)
  })

  it('supports a forced structured tool call and returns parsed toolInput', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'draft_result', input: { suggestion: 'Rewritten text' } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const result = await callJadeModel({
      operation: 'professionalize', systemPrompt: 'sys', userMessage: 'msg',
      tool: { name: 'draft_result', description: 'return result', inputSchema: { type: 'object', properties: { suggestion: { type: 'string' } }, required: ['suggestion'] } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.toolInput).toEqual({ suggestion: 'Rewritten text' })
    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'draft_result' })
  })
})

describe('callJadeModel — fallback to OpenAI', () => {
  it('falls back to OpenAI when Anthropic throws', async () => {
    mockAnthropicCreate.mockRejectedValue(new Error('anthropic down'))
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'Fallback response' } }],
      usage: { prompt_tokens: 30, completion_tokens: 10 },
    })
    const result = await callJadeModel({ operation: 'translate', systemPrompt: 'sys', userMessage: 'msg' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.provider).toBe('openai')
    expect(result.text).toBe('Fallback response')
  })

  it('falls back to OpenAI when Anthropic returns empty text', async () => {
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }], usage: {} })
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: 'From OpenAI' } }], usage: {} })
    const result = await callJadeModel({ operation: 'draft_reply', systemPrompt: 'sys', userMessage: 'msg' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.provider).toBe('openai')
  })

  it('supports a forced tool call on the OpenAI fallback path too', async () => {
    mockAnthropicCreate.mockRejectedValue(new Error('down'))
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ type: 'function', function: { name: 'draft_result', arguments: JSON.stringify({ suggestion: 'x' }) } }] } }],
      usage: {},
    })
    const result = await callJadeModel({
      operation: 'shorten', systemPrompt: 'sys', userMessage: 'msg',
      tool: { name: 'draft_result', description: 'd', inputSchema: { type: 'object', properties: {} } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.toolInput).toEqual({ suggestion: 'x' })
  })
})

describe('callJadeModel — total failure never throws', () => {
  it('returns a controlled MODEL_UNAVAILABLE failure when both providers throw', async () => {
    mockAnthropicCreate.mockRejectedValue(new Error('down'))
    mockOpenAICreate.mockRejectedValue(new Error('also down'))
    const result = await callJadeModel({ operation: 'fix_writing', systemPrompt: 'sys', userMessage: 'msg' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('MODEL_UNAVAILABLE')
  })

  it('returns MODEL_EMPTY_OUTPUT when both providers return empty text', async () => {
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }], usage: {} })
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: '' } }], usage: {} })
    const result = await callJadeModel({ operation: 'fix_writing', systemPrompt: 'sys', userMessage: 'msg' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('MODEL_EMPTY_OUTPUT')
  })

  it('never throws even if a provider call rejects with a non-Error value', async () => {
    mockAnthropicCreate.mockRejectedValue('a string rejection, not an Error')
    mockOpenAICreate.mockRejectedValue(null)
    await expect(callJadeModel({ operation: 'fix_writing', systemPrompt: 'sys', userMessage: 'msg' })).resolves.toMatchObject({ ok: false })
  })
})
