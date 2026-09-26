/**
 * @jest-environment jsdom
 *
 * P1 — Add Passenger UI state. Renders the REAL Doc Intelligence page, switches to the
 * Dummy Ticket Generator tab and DRIVES it like staff (native value setter + input events).
 * fetch is mocked: no supplier / network call.
 */
import React, { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DocAuthPage from '@/app/admin/intelligence/doc-auth/page'
import { buildPassengersPayload, assertPayloadMatchesRows, createPassengerRow } from '@/lib/dummy-ticket/passengers'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Body = { passengers?: Array<Record<string, unknown>>; mode: string }
let bodies: Body[] = []
const fetchMock = jest.fn(async (url: string, init?: { body?: string }) => {
  if (String(url).includes('/api/admin/intelligence/dummy-ticket')) {
    bodies.push(JSON.parse(init!.body!))
    return { ok: true, status: 200, json: async () => ({ passenger_count: 2 }) }
  }
  return { ok: true, status: 200, json: async () => ({ applications: [] }) }
})
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  bodies = []
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

const setVal = (el: HTMLInputElement | HTMLSelectElement, v: string) => act(() => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
const btn = (re: RegExp) => Array.from(container.querySelectorAll('button')).find(b => re.test(b.textContent ?? '') || re.test(b.getAttribute('aria-label') ?? ''))!
const click = (re: RegExp) => act(() => { btn(re).click() })
const field = (label: string) => container.querySelector<HTMLInputElement & HTMLSelectElement>(`[aria-label="${label}"]`)!
const warning = () => container.querySelector('[data-testid="blank-rows-warning"]')?.textContent ?? null
const rowEl = (n: number) => container.querySelector<HTMLElement>(`[data-testid="passenger-row-${n}"]`)
const rowCount = () => container.querySelectorAll('[data-row-id]').length
const add = (n = 1) => { for (let i = 0; i < n; i++) click(/\+ Add Passenger/) }
const name = (n: number, v: string) => setVal(field(`Passenger ${n} full name`), v)

function setup(strict = false, opts: { fillTrip?: boolean } = {}) {
  act(() => root.render(strict ? <StrictMode><DocAuthPage /></StrictMode> : <DocAuthPage />))
  click(/Dummy Ticket Generator/)
  setVal(container.querySelector<HTMLInputElement>('input[placeholder^="Full name"]')!, 'gina fred')
  if (opts.fillTrip !== false) {
    setVal(container.querySelector<HTMLInputElement>('input[placeholder="e.g. LHR or London"]')!, 'LOS')
    setVal(container.querySelector<HTMLInputElement>('input[placeholder="e.g. DXB or Dubai"]')!, 'LHR')
    setVal(container.querySelector<HTMLInputElement>('input[type="date"]')!, '2026-12-01')
  }
}
const generate = async () => { await act(async () => { btn(/Search & Generate PDF|Generate Flight Ticket/).click() }) }

describe('reproduction of the reported message (real component)', () => {
  it('one Add + one typed name -> NO warning', () => {
    setup(); add(); name(2, 'Mike King')
    expect(rowCount()).toBe(1); expect(warning()).toBeNull()
  })
  it('THREE Add clicks then typing only Passenger 2 -> "2 ... have no name" is TRUE (two really blank rows), highlighted', () => {
    setup(); add(3); name(2, 'Mike King')
    expect(rowCount()).toBe(3)
    expect(warning()).toBe('2 passenger rows have no name and will not be included')
    expect(rowEl(2)!.className).not.toMatch(/amber/)
    expect(rowEl(3)!.className).toMatch(/amber/); expect(rowEl(4)!.className).toMatch(/amber/)
  })
  it.each([false, true])('StrictMode=%s does not add or lose rows', strict => {
    setup(strict); add(); name(2, 'Mike King')
    expect(rowCount()).toBe(1); expect(warning()).toBeNull(); expect(field('Passenger 2 full name').value).toBe('Mike King')
  })
})

describe('row model + layout', () => {
  it('labelled row: Passenger 2 header, Title/Type/Full name/Passport labels, own row for Passenger 3', () => {
    setup(); add(2)
    const r2 = rowEl(2)!, r3 = rowEl(3)!
    expect(r2.textContent).toMatch(/Passenger 2/); expect(r3.textContent).toMatch(/Passenger 3/)
    for (const l of ['Title', 'Type', 'Full name', 'Passport']) expect(r2.textContent).toContain(l)
    const order = Array.from(r2.querySelectorAll('select,input,button')).map(e => e.getAttribute('aria-label'))
    expect(order).toEqual(['Passenger 2 title', 'Passenger 2 type', 'Passenger 2 full name', 'Passenger 2 passport number', 'Remove passenger 2'])
  })
  it('each edit only changes its own field of its own row', () => {
    setup(); add(2)
    name(2, 'Mike King'); setVal(field('Passenger 2 passport number'), 'a123'); setVal(field('Passenger 2 type'), 'Child'); setVal(field('Passenger 2 title'), 'DR')
    expect(field('Passenger 3 full name').value).toBe(''); expect(field('Passenger 3 passport number').value).toBe('')
    expect(field('Passenger 3 type').value).toBe('Adult'); expect(field('Passenger 3 title').value).toBe('MR')
    expect(field('Passenger 2 full name').value).toBe('Mike King'); expect(field('Passenger 2 passport number').value).toBe('a123')
    expect(field('Passenger 2 type').value).toBe('Child'); expect(field('Passenger 2 title').value).toBe('DR')
    expect(warning()).toBe('1 passenger row has no name and will not be included')
  })
  it('key is the stable id: DOM node identity survives removing an earlier row', () => {
    setup(); add(2); name(2, 'Mike King'); name(3, 'Ada Obi')
    const before = rowEl(3)!
    click(/Remove passenger 2/)
    expect(rowCount()).toBe(1)
    expect(rowEl(2)).toBe(before) // same node, now renumbered Passenger 2
    expect(field('Passenger 2 full name').value).toBe('Ada Obi')
  })
})

describe('warning logic', () => {
  it('0 -> none, 1 -> singular, 2 -> plural, whitespace-only is blank, lead never counted', () => {
    setup(); expect(warning()).toBeNull()
    add(); expect(warning()).toBe('1 passenger row has no name and will not be included')
    add(); expect(warning()).toBe('2 passenger rows have no name and will not be included')
    name(2, '   '); expect(warning()).toBe('2 passenger rows have no name and will not be included')
    name(2, 'Mike'); name(3, 'Sam'); expect(warning()).toBeNull()
  })
})

describe('add / remove matrix', () => {
  it('lead only -> 1 (legacy shape); lead+P2 -> 2; lead+P2+P3 -> 3', async () => {
    setup(); await generate()
    expect(bodies[0].passengers).toBeUndefined()
    add(); name(2, 'Mike King'); await generate()
    expect(bodies[1].passengers).toHaveLength(2)
    add(); name(3, 'Ada Obi'); await generate()
    expect(bodies[2].passengers!.map(p => p.name)).toEqual(['gina fred', 'Mike King', 'Ada Obi'])
  })
  it('remove P2 -> P3 keeps ITS OWN name/passport/type/title', async () => {
    setup(); add(2)
    name(2, 'Mike King'); setVal(field('Passenger 2 passport number'), 'p2'); setVal(field('Passenger 2 type'), 'Child'); setVal(field('Passenger 2 title'), 'DR')
    name(3, 'Ada Obi'); setVal(field('Passenger 3 passport number'), 'p3'); setVal(field('Passenger 3 type'), 'Infant'); setVal(field('Passenger 3 title'), 'MRS')
    click(/Remove passenger 2/)
    expect(rowCount()).toBe(1)
    expect(field('Passenger 2 full name').value).toBe('Ada Obi'); expect(field('Passenger 2 passport number').value).toBe('p3')
    expect(field('Passenger 2 type').value).toBe('Infant'); expect(field('Passenger 2 title').value).toBe('MRS')
  })
  it('blank P2 + named P3 -> only P2 ignored, P3 survives, exact note', async () => {
    setup(); add(2); name(3, 'Ada Obi')
    expect(warning()).toBe('1 passenger row has no name and will not be included')
    expect(rowEl(2)!.className).toMatch(/amber/); expect(rowEl(3)!.className).not.toMatch(/amber/)
    await generate()
    expect(bodies[0].passengers!.map(p => p.name)).toEqual(['gina fred', 'Ada Obi'])
  })
  it('passports and types stay attached to the right names in the request body', async () => {
    setup(); add(2)
    name(2, 'Mike King'); setVal(field('Passenger 2 passport number'), 'a111'); setVal(field('Passenger 2 type'), 'Child')
    name(3, 'Ada Obi'); setVal(field('Passenger 3 passport number'), 'b222'); setVal(field('Passenger 3 type'), 'Infant'); setVal(field('Passenger 3 title'), 'MRS')
    await generate()
    expect(bodies[0].passengers).toEqual([
      { name: 'gina fred', type: 'Adult', title: 'MR' },
      { name: 'Mike King', type: 'Child', title: 'MR', passport: 'A111' },
      { name: 'Ada Obi', type: 'Infant', title: 'MRS', passport: 'B222' },
    ])
  })
  it('8-extra cap unchanged', () => {
    setup(); add(8)
    expect(rowCount()).toBe(8); expect(container.textContent).not.toContain('+ Add Passenger')
  })
  it('rows survive unrelated edits (lead name, origin, date)', () => {
    setup(); add(); name(2, 'Mike King'); setVal(field('Passenger 2 passport number'), 'zz9')
    setVal(container.querySelector<HTMLInputElement>('input[placeholder^="Full name"]')!, 'gina fred jr')
    setVal(container.querySelector<HTMLInputElement>('input[placeholder="e.g. LHR or London"]')!, 'ACC')
    setVal(container.querySelector<HTMLInputElement>('input[type="date"]')!, '2026-12-05')
    expect(field('Passenger 2 full name').value).toBe('Mike King'); expect(field('Passenger 2 passport number').value).toBe('zz9')
  })
})

describe('generate twice / mode switch (critical regression)', () => {
  it('two Generates both carry both passengers and P2 stays intact', async () => {
    setup(); add(); name(2, 'Mike King'); setVal(field('Passenger 2 passport number'), 'q1'); setVal(field('Passenger 2 type'), 'Child'); setVal(field('Passenger 2 title'), 'DR')
    await generate()
    expect(field('Passenger 2 full name').value).toBe('Mike King'); expect(field('Passenger 2 passport number').value).toBe('q1')
    expect(field('Passenger 2 type').value).toBe('Child'); expect(field('Passenger 2 title').value).toBe('DR')
    await generate()
    expect(bodies).toHaveLength(2)
    for (const b of bodies) expect(b.passengers!.map(p => p.name)).toEqual(['gina fred', 'Mike King'])
    expect(bodies[1]).toEqual(bodies[0])
  })
  it('Generate after Live -> Manual -> Live keeps rows', async () => {
    setup(); add(); name(2, 'Mike King')
    click(/Manual Entry/); expect(field('Passenger 2 full name').value).toBe('Mike King')
    await generate()
    expect(bodies[0].mode).toBe('manual'); expect(bodies[0].passengers!.map(p => p.name)).toEqual(['gina fred', 'Mike King'])
    click(/Live Flight Search/); expect(field('Passenger 2 full name').value).toBe('Mike King')
  })
  it('linking a visa application (autofill) after adding rows keeps rows', async () => {
    const app = { id: 'app1', referenceNumber: 'V-1', firstName: 'Gina', lastName: 'Fred', destinationIso2: 'GB', status: 'x' }
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/visa-applications/search')) return { ok: true, status: 200, json: async () => ({ applications: [app] }) } as never
      if (String(url).includes('/api/admin/visa-applications/app1')) return { ok: true, status: 200, json: async () => ({ application: { firstName: 'Gina', lastName: 'Fred', passportNumber: 'LEAD1' } }) } as never
      if (String(url).includes('/dummy-ticket')) { bodies.push(JSON.parse(init!.body!)); return { ok: true, status: 200, json: async () => ({ passenger_count: 2 }) } as never }
      return { ok: true, status: 200, json: async () => ({}) } as never
    })
    jest.useFakeTimers()
    try {
      setup(); add(); name(2, 'Mike King')
      const searchInput = container.querySelector<HTMLInputElement>('input[placeholder^="Search by reference"]')!
      setVal(searchInput, 'gina')
      await act(async () => { jest.advanceTimersByTime(400) })
      await act(async () => { await Promise.resolve() })
      const pick = btn(/V-1/)
      await act(async () => { pick.click() })
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
    } finally { jest.useRealTimers() }
    expect(field('Passenger 2 full name').value).toBe('Mike King')
    await generate()
    expect(bodies[0].passengers!.map(p => p.name)).toEqual(['Gina Fred', 'Mike King'])
  })
})

describe('payload contract (pure)', () => {
  it("lead 'gina fred' + 'Mike King' -> 2 passengers, no id, no synthetic blank, lead passport on lead", () => {
    const rows = [createPassengerRow({ name: 'Mike King' }), createPassengerRow({ name: '   ' })]
    const lead = { name: 'gina  fred', title: 'MR', passport: 'l1', type: 'Adult' }
    const payload = buildPassengersPayload(lead, rows)!
    expect(payload).toHaveLength(2)
    expect(payload[0]).toEqual({ name: 'gina fred', type: 'Adult', title: 'MR', passport: 'L1' })
    expect(payload[1].name).toBe('Mike King')
    for (const p of payload) expect(p).not.toHaveProperty('id')
    expect(JSON.stringify(payload)).not.toMatch(/pax-/)
    expect(assertPayloadMatchesRows(lead, rows, payload)).toEqual({ ok: true, problems: [] })
  })
  it('diagnostics flag a mismatched / leaking payload without throwing', () => {
    const rows = [createPassengerRow({ name: 'Mike King' })]
    const bad = [{ name: 'gina fred' }, { name: 'Mike King', id: 'pax-1' }, { name: '' }]
    const d = assertPayloadMatchesRows({ name: 'gina fred' }, rows, bad as never)
    expect(d.ok).toBe(false); expect(d.problems.join('|')).toMatch(/id|blank|expected/)
    expect(assertPayloadMatchesRows({ name: 'x' }, [createPassengerRow()], undefined).ok).toBe(true)
  })
  it('row ids are unique and stable', () => {
    const a = createPassengerRow(), b = createPassengerRow()
    expect(a.id).not.toBe(b.id)
  })
})

describe('hardening', () => {
  const countLine = () => container.querySelector('[data-testid="pax-count-line"]')?.textContent ?? null
  it('labels are bound to their own control, ids unique per row', () => {
    setup(); add(2)
    const ids = new Set<string>()
    for (const n of [2, 3]) {
      for (const [lab, k] of [['Title', 'title'], ['Type', 'type'], ['Full name', 'name'], ['Passport (optional)', 'passport']] as const) {
        const l = Array.from(rowEl(n)!.querySelectorAll('label')).find(x => x.textContent === lab)!
        const ctl = document.getElementById(l.htmlFor)!
        expect(ctl).toBe(rowEl(n)!.querySelector(`[id$="-${k}"]`)); expect(l.htmlFor.endsWith('-' + k)).toBe(true)
        ids.add(l.htmlFor)
      }
    }
    expect(ids.size).toBe(8)
  })
  it('row ids are opaque and unique across many creations', () => {
    const s = new Set(Array.from({ length: 500 }, () => createPassengerRow().id))
    expect(s.size).toBe(500)
  })
  it('Add focuses the new name input; typing / removing does not steal focus', () => {
    setup(); add()
    expect(document.activeElement).toBe(field('Passenger 2 full name'))
    add(); expect(document.activeElement).toBe(field('Passenger 3 full name'))
    const lead = container.querySelector<HTMLInputElement>('input[placeholder^="Full name"]')!
    act(() => lead.focus()); setVal(lead, 'gina fred x')
    expect(document.activeElement).toBe(lead)
    click(/Remove passenger 3/); expect(document.activeElement).not.toBe(field('Passenger 2 full name'))
  })
  it('tag mentions passport when name missing', () => {
    setup(); add(); expect(rowEl(2)!.textContent).toContain('No name — will not be included')
    expect(rowEl(2)!.textContent).not.toContain('passport entered')
    setVal(field('Passenger 2 passport number'), 'x1')
    expect(rowEl(2)!.textContent).toContain('No name — will not be included (passport entered)')
  })
  it('persistent count line matches the payload and updates live', async () => {
    setup(); expect(countLine()).toBe('Will generate a ticket for 1 passenger')
    add(2); expect(countLine()).toBe('Will generate a ticket for 1 passenger (2 blank rows ignored)')
    name(2, 'Mike King'); expect(countLine()).toBe('Will generate a ticket for 2 passengers (1 blank row ignored)')
    name(3, 'Ada'); expect(countLine()).toBe('Will generate a ticket for 3 passengers')
    await generate(); expect(bodies[0].passengers).toHaveLength(3)
    click(/Hotel Voucher/); expect(countLine()).toBeNull()
  })
  it('post-generate "not included" note clears when rows change', async () => {
    setup(); add(2); name(2, 'Mike King')
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/dummy-ticket')) { bodies.push(JSON.parse(init!.body!)); return { ok: true, status: 200, json: async () => ({ passenger_count: 2, pdfUrl: 'https://x/y.pdf' }) } as never }
      return { ok: true, status: 200, json: async () => ({}) } as never
    })
    await generate()
    expect(container.textContent).toContain('1 passenger row had no name and was not included')
    name(3, 'Ada')
    expect(container.textContent).not.toContain('was not included')
  })
})
