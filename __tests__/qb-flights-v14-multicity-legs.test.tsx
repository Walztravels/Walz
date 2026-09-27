/**
 * @jest-environment jsdom
 *
 * QUOTE BUILDER V1.4 (Agent A — search UI) — multi-city leg rows
 * (MultiCityLegsDesktop.tsx / MultiCityMobileCards.tsx):
 *  - Leg 1 and Leg 2 (index 0/1) are mandatory: no Remove button.
 *  - Leg 3+ (index >= 2) gets a Remove button.
 *  - "+ Add flight" is offered while under MC_MAX_LEGS.
 *  - A chronology violation (leg N's date before leg N-1's) shows an
 *    inline error and blocks the search call — a UI pre-check mirroring
 *    the server's rule in route.ts, not a replacement for it.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MultiCityLegsDesktop, mcLegsChronologyError } from '@/app/admin/inbox/components/quote-builder/desktop/panels/MultiCityLegsDesktop'
import { MultiCityMobileCards } from '@/app/admin/inbox/components/quote-builder/mobile/MultiCityMobileCards'
import { FlightPanel as DesktopFlightPanel } from '@/app/admin/inbox/components/quote-builder/desktop/panels/FlightPanel'
import { MC_MAX_LEGS, type QuoteBuilderState, type FlLeg } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function leg(fromCode: string, toCode: string, depart: string): FlLeg {
  return { from: fromCode, fromCode, to: toCode, toCode, depart, fromSug: [], toSug: [] }
}

function makeState(overrides: Record<string, unknown> = {}): QuoteBuilderState {
  return {
    flTrip: 'multi-city', setFlTrip: jest.fn(),
    flFromQuery: '', flFrom: '', flFromSug: [],
    flToQuery: '', flTo: '', flToSug: [],
    flDepart: '', setFlDepart: jest.fn(),
    flReturn: '', setFlReturn: jest.fn(),
    flCabin: 'economy', setFlCabin: jest.fn(),
    flStops: 'any', setFlStops: jest.fn(),
    flAdults: 1, setFlAdults: jest.fn(),
    onFlFromChange: jest.fn(), onFlToChange: jest.fn(),
    selectFlFrom: jest.fn(), selectFlTo: jest.fn(),
    mcLegs: [leg('LOS', 'DXB', '2026-12-01'), leg('DXB', 'LHR', '2026-12-08')],
    updateMcLeg: jest.fn(), addMcLeg: jest.fn(), removeMcLeg: jest.fn(),
    onMcFromChange: jest.fn(), onMcToChange: jest.fn(), selectMcFrom: jest.fn(), selectMcTo: jest.fn(),
    flightResults: [],
    searchFlightsLive: jest.fn(async () => {}),
    liveSearching: false, liveError: null,
    openPending: jest.fn(),
    ...overrides,
  } as unknown as QuoteBuilderState
}

let root: Root | null = null
let container: HTMLDivElement | null = null
function renderInto(node: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  act(() => { root = createRoot(container!); root.render(node) })
  return container
}
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; container = null
})

function removeButtons(el: HTMLElement): HTMLButtonElement[] {
  return Array.from(el.querySelectorAll('button[aria-label^="Remove flight"]'))
}
function findButtonByText(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined
}
function click(btn: HTMLButtonElement) {
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('mcLegsChronologyError — pure rule, mirrors the server (route.ts)', () => {
  it('no error when legs are in non-decreasing date order', () => {
    expect(mcLegsChronologyError([leg('A', 'B', '2026-12-01'), leg('B', 'C', '2026-12-01'), leg('C', 'D', '2026-12-05')])).toBeNull()
  })
  it('flags a leg dated before the previous leg', () => {
    const err = mcLegsChronologyError([leg('A', 'B', '2026-12-10'), leg('B', 'C', '2026-12-01')])
    expect(err).toMatch(/Flight 2.*before Flight 1/)
  })
  it('ignores legs still missing a date (in-progress, not yet a violation)', () => {
    expect(mcLegsChronologyError([leg('A', 'B', '2026-12-10'), leg('B', 'C', '')])).toBeNull()
  })
})

describe('MultiCityLegsDesktop — leg rows', () => {
  it('Leg 1 and Leg 2 have no Remove button; only later legs do', () => {
    const state = makeState({ mcLegs: [leg('A', 'B', '2026-12-01'), leg('B', 'C', '2026-12-02'), leg('C', 'D', '2026-12-03')] })
    const el = renderInto(<MultiCityLegsDesktop state={state} />)
    expect(removeButtons(el)).toHaveLength(1)
    expect(removeButtons(el)[0].getAttribute('aria-label')).toBe('Remove flight 3')
  })

  it('offers "+ Add another flight" while under MC_MAX_LEGS, hides it at the cap', () => {
    const under = renderInto(<MultiCityLegsDesktop state={makeState({ mcLegs: [leg('A', 'B', '2026-12-01'), leg('B', 'C', '2026-12-02')] })} />)
    expect(findButtonByText(under, '+ Add another flight')).toBeTruthy()

    const atCap = renderInto(<MultiCityLegsDesktop state={makeState({
      mcLegs: Array.from({ length: MC_MAX_LEGS }, (_, i) => leg(`A${i}`, `B${i}`, '2026-12-01')),
    })} />)
    expect(findButtonByText(atCap, '+ Add another flight')).toBeFalsy()
  })

  it('a chronology violation renders an inline error', () => {
    const el = renderInto(<MultiCityLegsDesktop state={makeState({
      mcLegs: [leg('A', 'B', '2026-12-10'), leg('B', 'C', '2026-12-01')],
    })} />)
    expect(el.textContent).toContain("Flight 2: departure date cannot be before Flight 1's departure date.")
  })
})

describe('Desktop FlightPanel — multi-city Search is blocked on a chronology violation', () => {
  it('Search flights is disabled and never calls searchFlightsLive while legs are out of order', () => {
    const searchFlightsLive = jest.fn(async () => {})
    const state = makeState({
      mcLegs: [leg('LOS', 'DXB', '2026-12-10'), leg('DXB', 'LHR', '2026-12-01')],
      searchFlightsLive,
    })
    const el = renderInto(<DesktopFlightPanel state={state} />)
    expect(el.textContent).toContain("Flight 2: departure date cannot be before Flight 1's departure date.")
    const searchBtn = findButtonByText(el, 'Search flights')!
    expect(searchBtn.disabled).toBe(true)
    click(searchBtn)
    expect(searchFlightsLive).not.toHaveBeenCalled()
  })

  it('Search flights is enabled and calls searchFlightsLive once legs are back in order', () => {
    const searchFlightsLive = jest.fn(async () => {})
    const state = makeState({
      mcLegs: [leg('LOS', 'DXB', '2026-12-01'), leg('DXB', 'LHR', '2026-12-08')],
      searchFlightsLive,
    })
    const el = renderInto(<DesktopFlightPanel state={state} />)
    const searchBtn = findButtonByText(el, 'Search flights')!
    expect(searchBtn.disabled).toBe(false)
    click(searchBtn)
    expect(searchFlightsLive).toHaveBeenCalledTimes(1)
  })
})

describe('MultiCityMobileCards — leg rows and chronology gate', () => {
  it('Leg 1 and Leg 2 have no Remove button; only later legs do', () => {
    const state = makeState({ mcLegs: [leg('A', 'B', '2026-12-01'), leg('B', 'C', '2026-12-02'), leg('C', 'D', '2026-12-03')] })
    const el = renderInto(<MultiCityMobileCards state={state} onSearch={jest.fn()} />)
    expect(removeButtons(el)).toHaveLength(1)
    expect(removeButtons(el)[0].getAttribute('aria-label')).toBe('Remove flight 3')
  })

  it('a chronology violation shows an inline error and does not call onSearch', () => {
    const onSearch = jest.fn()
    const state = makeState({ mcLegs: [leg('LOS', 'DXB', '2026-12-10'), leg('DXB', 'LHR', '2026-12-01')] })
    const el = renderInto(<MultiCityMobileCards state={state} onSearch={onSearch} />)
    expect(el.textContent).toContain("Flight 2: departure date cannot be before Flight 1's departure date.")
    click(findButtonByText(el, 'Search Flights')!)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('calls onSearch when legs are in order', () => {
    const onSearch = jest.fn()
    const state = makeState({ mcLegs: [leg('LOS', 'DXB', '2026-12-01'), leg('DXB', 'LHR', '2026-12-08')] })
    const el = renderInto(<MultiCityMobileCards state={state} onSearch={onSearch} />)
    click(findButtonByText(el, 'Search Flights')!)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
