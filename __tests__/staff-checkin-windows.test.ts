/**
 * lib/check-ins/windows.ts — the single shared window-generation function
 * used by manual check-in, the staff "my" view, the admin live dashboard,
 * and the missed-check-in cron. Covers:
 *   4  An 11 AM check-in does not satisfy 12 PM (independent windows)
 *   15 Weekends, break-hour exclusion, grace period / deadline edge cases
 */
import { buildTodaysWindows, isWindowClosed, isWindowOpenForCheckIn, tzOffsetHours } from '@/lib/check-ins/windows'

const settings = { workStartHour: 8, workEndHour: 17, satEnabled: true, satStartHour: 9, satEndHour: 14, sunEnabled: false }

describe('buildTodaysWindows', () => {
  it('produces one independent window per work hour, and each is a distinct windowStart', () => {
    // Monday 2026-10-05 13:30 Lagos-equivalent — use Africa/Lagos (UTC+1) so
    // local noon/1pm windows are unambiguous in this test.
    const now = new Date('2026-10-05T12:30:00Z') // 13:30 Lagos time
    const windows = buildTodaysWindows({
      now, timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, settings,
    })
    const hours = windows.map(w => w.localHour)
    // 8..13 local hours have opened by 13:30 local; 13 (break) excluded
    expect(hours).toEqual([8, 9, 10, 11, 12])
    // test 4: the 11 and 12 local-hour windows are distinct records
    const eleven = windows.find(w => w.localHour === 11)!
    const twelve = windows.find(w => w.localHour === 12)!
    expect(eleven.windowStart.getTime()).not.toBe(twelve.windowStart.getTime())
    expect(twelve.windowStart.getTime()).toBe(eleven.windowStart.getTime() + 3_600_000)
  })

  it('excludes the configured break hour entirely — no window is ever created for it', () => {
    const now = new Date('2026-10-05T15:00:00Z') // 16:00 Lagos
    const windows = buildTodaysWindows({ now, timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, settings })
    expect(windows.some(w => w.localHour === 13)).toBe(false)
  })

  it('returns no windows on Sunday when sunEnabled is false', () => {
    const now = new Date('2026-10-04T12:00:00Z') // a Sunday
    const windows = buildTodaysWindows({ now, timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, settings })
    expect(windows).toEqual([])
  })

  it('uses the Saturday-specific schedule on Saturday', () => {
    const now = new Date('2026-10-03T12:00:00Z') // a Saturday, 13:00 Lagos
    const windows = buildTodaysWindows({ now, timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, settings })
    // sat schedule is 9-14, so by 13:00 local, hours 9..12 have opened
    expect(windows.map(w => w.localHour)).toEqual([9, 10, 11, 12])
  })

  it('never returns a window that has not opened yet', () => {
    const now = new Date('2026-10-05T07:00:00Z') // 08:00 Lagos, exactly the start
    const windows = buildTodaysWindows({ now, timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, settings })
    expect(windows.map(w => w.localHour)).toEqual([8])
  })

  it('correctly offsets Ghana (Africa/Accra, UTC+0) staff by one hour versus Lagos', () => {
    const now = new Date('2026-10-05T12:30:00Z') // 12:30 Accra, 13:30 Lagos
    const accraWindows = buildTodaysWindows({ now, timezone: 'Africa/Accra', breakStartHour: 12, breakEndHour: 13, settings })
    expect(accraWindows.map(w => w.localHour)).toEqual([8, 9, 10, 11]) // break at 12 excluded, noon hasn't opened
  })
})

describe('isWindowClosed / isWindowOpenForCheckIn — grace period', () => {
  const win = {
    windowStart: new Date('2026-10-05T11:00:00Z'),
    windowEnd:   new Date('2026-10-05T12:00:00Z'),
    localHour: 12,
  }

  it('a window is open while in progress', () => {
    expect(isWindowOpenForCheckIn(win, new Date('2026-10-05T11:30:00Z'), 0)).toBe(true)
  })

  it('with zero grace, a window closes exactly at windowEnd', () => {
    expect(isWindowClosed(win, new Date('2026-10-05T12:00:00Z'), 0)).toBe(true)
    expect(isWindowClosed(win, new Date('2026-10-05T11:59:59.999Z'), 0)).toBe(false)
  })

  it('test 15 — a check-in exactly at the deadline, with grace, is still accepted', () => {
    // grace = 5 minutes: window is still open for check-in until 12:05
    expect(isWindowOpenForCheckIn(win, new Date('2026-10-05T12:04:59Z'), 5)).toBe(true)
    expect(isWindowOpenForCheckIn(win, new Date('2026-10-05T12:05:00Z'), 5)).toBe(false)
  })

  it('a window is never "open" before it has started', () => {
    expect(isWindowOpenForCheckIn(win, new Date('2026-10-05T10:59:00Z'), 30)).toBe(false)
  })
})

describe('tzOffsetHours', () => {
  it('Africa/Lagos is UTC+1 and Africa/Accra is UTC+0', () => {
    expect(tzOffsetHours('Africa/Lagos')).toBe(1)
    expect(tzOffsetHours('Africa/Accra')).toBe(0)
  })
})
