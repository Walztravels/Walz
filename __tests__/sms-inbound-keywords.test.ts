import {
  classifySmsKeyword,
  SMS_STOP_KEYWORDS,
  SMS_START_KEYWORDS,
  SMS_HELP_KEYWORDS,
} from '@/lib/sms/keywords'

describe('classifySmsKeyword', () => {
  it.each([
    ...SMS_STOP_KEYWORDS.map((k) => [k, 'STOP']),
    ...SMS_START_KEYWORDS.map((k) => [k, 'START']),
    ...SMS_HELP_KEYWORDS.map((k) => [k, 'HELP']),
    ['  stop ', 'STOP'],
    ['Unsubscribe', 'STOP'],
    ['yes\n', 'START'],
    ['info', 'HELP'],
  ])('%j -> %s', (body, cls) => {
    expect(classifySmsKeyword(body)).toBe(cls)
  })

  it.each(['please stop calling', 'stop it now', 'yes please', 'helpme', '', '   ', 'hello', 'STOPPED', 'stop stop'])(
    '%j -> OTHER (exact match only)',
    (body) => {
      expect(classifySmsKeyword(body)).toBe('OTHER')
    },
  )

  it('trusts a valid OptOutType over the body', () => {
    expect(classifySmsKeyword('hello', 'STOP')).toBe('STOP')
    expect(classifySmsKeyword('stop', 'HELP')).toBe('HELP')
    expect(classifySmsKeyword('x', 'start')).toBe('START')
  })

  it('ignores an invalid OptOutType and falls back to the body', () => {
    expect(classifySmsKeyword('stop', 'BOGUS')).toBe('STOP')
    expect(classifySmsKeyword('hi', '')).toBe('OTHER')
    expect(classifySmsKeyword('hi', null)).toBe('OTHER')
  })
})

describe('surrounding punctuation is ignored, the keyword itself stays exact', () => {
  it.each([['stop.', 'STOP'], ['STOP!', 'STOP'], ['  Stop  ', 'STOP'], ['"unsubscribe"', 'STOP'], ['Start.', 'START'], ['help?', 'HELP']])(
    '%j -> %s',
    (body, cls) => {
      expect(classifySmsKeyword(body)).toBe(cls)
    },
  )
})
