/**
 * lib/portal/trip-grouping.ts — My Walz Phase 1 My Trips bucketing.
 *
 * Found by independent product/regression review: a trip with status
 * COMPLETED and a (data-anomalous) future startDate used to appear in BOTH
 * "Upcoming" and "Past" simultaneously — CANCELLED had an explicit exclusion
 * guard from Upcoming, COMPLETED did not get the mirror guard. These are
 * real unit tests against the extracted pure function (not source-grep
 * assertions on the page's JSX), so they actually exercise the grouping
 * logic with concrete trip fixtures.
 */
import { groupTrips, type GroupableTrip } from '@/lib/portal/trip-grouping'

const NOW = new Date('2026-06-15T12:00:00Z').getTime()

function trip(over: Partial<GroupableTrip> & { id: string }): GroupableTrip {
  return { startDate: null, endDate: null, status: 'CONFIRMED', ...over }
}

describe('groupTrips — mutual exclusivity (every trip in exactly one bucket)', () => {
  it('a future-dated CONFIRMED trip is Upcoming only', () => {
    const t = trip({ id: 't1', status: 'CONFIRMED', startDate: new Date('2026-07-01') })
    const { upcoming, saved, past } = groupTrips([t], NOW)
    expect(upcoming).toEqual([t])
    expect(saved).toEqual([])
    expect(past).toEqual([])
  })

  it('a CANCELLED trip is Past only, regardless of a future startDate', () => {
    const t = trip({ id: 't2', status: 'CANCELLED', startDate: new Date('2026-07-01') })
    const { upcoming, saved, past } = groupTrips([t], NOW)
    expect(upcoming).toEqual([])
    expect(past).toEqual([t])
  })

  it('REGRESSION: a COMPLETED trip with a future startDate is Past only — never also Upcoming', () => {
    const t = trip({ id: 't3', status: 'COMPLETED', startDate: new Date('2026-07-01') })
    const { upcoming, saved, past } = groupTrips([t], NOW)
    expect(upcoming).toEqual([])       // the bug: this used to also contain t3
    expect(past).toEqual([t])
    expect(saved).toEqual([])
  })

  it('a DRAFT trip with no dates is Saved/Planning only', () => {
    const t = trip({ id: 't4', status: 'DRAFT' })
    const { upcoming, saved, past } = groupTrips([t], NOW)
    expect(saved).toEqual([t])
    expect(upcoming).toEqual([])
    expect(past).toEqual([])
  })

  it('a PLANNING trip with a future startDate is Upcoming (an active plan with a real date), not Saved', () => {
    const t = trip({ id: 't5', status: 'PLANNING', startDate: new Date('2026-07-01') })
    const { upcoming, saved } = groupTrips([t], NOW)
    expect(upcoming).toEqual([t])
    expect(saved).toEqual([])
  })

  it('a CONFIRMED trip with only a past endDate (status not yet flipped to COMPLETED) stays Upcoming — pre-existing, unchanged behavior: an active status alone is treated as current regardless of dates, only a TERMINAL status (COMPLETED/CANCELLED) forces Past', () => {
    const t = trip({ id: 't6', status: 'CONFIRMED', endDate: new Date('2026-01-01') })
    const { upcoming, past } = groupTrips([t], NOW)
    expect(upcoming).toEqual([t])
    expect(past).toEqual([])
  })

  it('every trip across a realistic mixed set lands in exactly one bucket', () => {
    const trips = [
      trip({ id: 'a', status: 'CONFIRMED', startDate: new Date('2026-07-01') }),
      trip({ id: 'b', status: 'CANCELLED', startDate: new Date('2026-07-01') }),
      trip({ id: 'c', status: 'COMPLETED', startDate: new Date('2026-07-01') }), // the regression case
      trip({ id: 'd', status: 'DRAFT' }),
      trip({ id: 'e', status: 'PLANNING', startDate: new Date('2026-07-01') }),
      trip({ id: 'f', status: 'CONFIRMED', endDate: new Date('2026-01-01') }),
      trip({ id: 'g', status: 'COMPLETED' }),
    ]
    const { upcoming, saved, past } = groupTrips(trips, NOW)
    const bucketOf = (id: string) =>
      [upcoming.some(t => t.id === id), saved.some(t => t.id === id), past.some(t => t.id === id)]
        .filter(Boolean).length

    for (const t of trips) {
      expect(bucketOf(t.id)).toBe(1) // exactly one bucket — never zero, never two
    }
  })
})
