import Anthropic from '@anthropic-ai/sdk'

let _anthropic: Anthropic | undefined

export function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_t, prop, receiver) {
    return Reflect.get(getAnthropic(), prop, receiver)
  },
})
