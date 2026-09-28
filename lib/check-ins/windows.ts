// lib/check-ins/windows.ts
//
// Single shared source of truth for turning a staff member's configured
// schedule (CheckInSettings + their own timezone/break hours) into the list
// of discrete, independent check-in windows for a given local day. Every
// check-in surface (manual check-in, staff "my" view, admin live dashboard,
// the missed-check-in cron) must use this SAME function so a window is
// defined identically everywhere — this is what "if a staff member checks
// in at 11:00 AM, that does NOT satisfy 12:00 PM" and "reuse the existing
// configured schedule" actually mean in code.

export interface CheckInWindow {
  windowStart: Date // UTC
  windowEnd:   Date // UTC — windowStart + 1 hour
  localHour:   number
}

export interface ScheduleSettings {
  workStartHour: number
  workEndHour:   number
  satEnabled:    boolean
  satStartHour:  number
  satEndHour:    number
  sunEnabled:    boolean
}

/** IANA-timezone offset (hours) from UTC, at "now" (handles DST correctly
 * because it re-derives the offset every call instead of caching it). */
export function tzOffsetHours(tz: string): number {
  const now   = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const utc   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - utc.getTime()) / 3_600_000)
}

export function fmt12(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:00 ${suffix}`
}

/**
 * Build every check-in window for "today" (in the staff member's own local
 * timezone) up to and including the window currently in progress — never
 * windows that haven't opened yet. Break hours are excluded entirely (no
 * window is ever created for a break hour). Weekend days are excluded per
 * settings.sat/sunEnabled.
 */
export function buildTodaysWindows(params: {
  now:            Date
  timezone:       string
  breakStartHour: number
  breakEndHour:   number
  settings:       ScheduleSettings
}): CheckInWindow[] {
  const { now, timezone, breakStartHour, breakEndHour, settings } = params
  const offset     = tzOffsetHours(timezone)
  const nowLocal   = new Date(now.getTime() + offset * 3_600_000)
  const todayLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()))
  const localDow   = nowLocal.getUTCDay() // 0=Sun, 6=Sat

  let workStart: number
  let workEnd:   number
  if (localDow === 0) {
    if (!settings.sunEnabled) return []
    workStart = settings.workStartHour
    workEnd   = settings.workEndHour
  } else if (localDow === 6) {
    if (!settings.satEnabled) return []
    workStart = settings.satStartHour
    workEnd   = settings.satEndHour
  } else {
    workStart = settings.workStartHour
    workEnd   = settings.workEndHour
  }

  const windows: CheckInWindow[] = []
  for (let h = workStart; h < workEnd; h++) {
    if (h >= breakStartHour && h < breakEndHour) continue // break hour — never a window

    const localSlotMs = todayLocal.getTime() + h * 3_600_000
    const windowStart = new Date(localSlotMs - offset * 3_600_000) // -> UTC
    if (windowStart > now) continue // hasn't opened yet

    windows.push({
      windowStart,
      windowEnd: new Date(windowStart.getTime() + 3_600_000),
      localHour: h,
    })
  }
  return windows
}

/** A window is closed to further manual check-ins (and decidable as MISSED
 * by the cron) once `now >= windowEnd + graceMinutes`. */
export function isWindowClosed(win: CheckInWindow, now: Date, graceMinutes: number): boolean {
  return now.getTime() >= win.windowEnd.getTime() + graceMinutes * 60_000
}

/** A window is still open for a manual check-in click right now — either
 * genuinely in progress, or past its end but still inside the grace period. */
export function isWindowOpenForCheckIn(win: CheckInWindow, now: Date, graceMinutes: number): boolean {
  return now.getTime() >= win.windowStart.getTime() && !isWindowClosed(win, now, graceMinutes)
}
