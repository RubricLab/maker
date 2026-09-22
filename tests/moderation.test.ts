import { afterAll, beforeEach, expect, test } from 'bun:test'
import { offensiveness, shouldHide } from '../src/lib/moderation'
import { HARMLESS, OFFENSIVE } from '../src/lib/references'
import { jevResponse } from './stubs'

const GRID = '1111010001111101010010010'
const realFetch = globalThis.fetch
const originalKey = process.env.TYPESAFE_API_KEY
const stub = { p: 0.5, status: 200 }
const requests: { state: { drawing: string[]; [key: string]: unknown } }[] = []
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
	requests.push(JSON.parse(init?.body as string))
	return Response.json(stub.status === 200 ? jevResponse(stub.p) : { error: 'bad' }, {
		status: stub.status
	})
}) as typeof fetch

beforeEach(() => {
	process.env.TYPESAFE_API_KEY = 'test'
	Object.assign(stub, { p: 0.5, status: 200 })
	requests.length = 0
})

afterAll(() => {
	globalThis.fetch = realFetch
	if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY
	else process.env.TYPESAFE_API_KEY = originalKey
})

test('references are square pictures and the symmetric ones repeat under rotation', () => {
	const rotate = (rows: string[]) =>
		rows.map((_, x) =>
			rows
				.map(row => row[x])
				.reverse()
				.join('')
		)
	for (const rows of [...Object.values(OFFENSIVE).flat(), ...Object.values(HARMLESS)]) {
		expect(rows.every(row => row.length === rows.length && /^[#.]+$/.test(row))).toBe(true)
		expect(rows.some(row => row.includes('#'))).toBe(true)
	}
	const odd = Object.values(OFFENSIVE)[0]?.[3] as string[]
	expect(rotate(odd)).toEqual(odd)
})

test('sends the explained grid first, then the drawing and references, for four rotations', async () => {
	await offensiveness(GRID)
	expect(requests).toHaveLength(4)
	const { state } = requests[0] as (typeof requests)[number]
	expect(Object.keys(state)).toEqual([
		'instructions',
		'drawing',
		'offensive_references',
		'harmless_references'
	])
	expect(state.instructions).toContain('5 by 5 grid')
	expect(state.drawing).toEqual(['####.', '#...#', '####.', '#.#..', '#..#.'])
	expect(requests.map(request => request.state.drawing[0])).toEqual([
		'####.',
		'#####',
		'.#..#',
		'.#...'
	])
})

test('hides at the threshold and shows below it', async () => {
	stub.p = 0.45
	expect(await shouldHide(GRID)).toBe(true)
	stub.p = 0.44
	expect(await shouldHide(GRID)).toBe(false)
})

test('hides whatever cannot be decided', async () => {
	stub.status = 400
	expect(await shouldHide(GRID)).toBe(true)
	delete process.env.TYPESAFE_API_KEY
	requests.length = 0
	expect(await shouldHide(GRID)).toBe(true)
	expect(requests).toHaveLength(0)
})
