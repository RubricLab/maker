import { afterAll, beforeEach, expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { shouldHide, verdict } from '../src/lib/moderation'
import { renderGridPng } from '../src/lib/png'
import { imageOf, imageUrl, openaiResponse } from './stubs'

const GRID = '1111010001111101010010010'
const realFetch = globalThis.fetch
const originalKey = process.env.OPENAI_API_KEY
const stub = { hide: false, refusal: false, status: 200 }
const requests: Record<string, unknown>[] = []
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
	requests.push(JSON.parse(init?.body as string))
	return Response.json(
		stub.status === 200 ? openaiResponse(stub.hide, stub.refusal) : { error: { message: 'bad' } },
		{ status: stub.status }
	)
}) as typeof fetch

beforeEach(() => {
	process.env.OPENAI_API_KEY = 'test'
	Object.assign(stub, { hide: false, refusal: false, status: 200 })
	requests.length = 0
})

afterAll(() => {
	globalThis.fetch = realFetch
	if (originalKey === undefined) delete process.env.OPENAI_API_KEY
	else process.env.OPENAI_API_KEY = originalKey
})

test('renders a grid as a valid grayscale PNG', () => {
	const png = renderGridPng(GRID)
	const view = new DataView(png.buffer, png.byteOffset)
	expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
	expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR')
	const width = view.getUint32(16)
	expect(width).toBe(476) // 5 cells plus a one-cell margin, 68px each.
	expect(view.getUint32(20)).toBe(width)
	expect([...png.subarray(24, 29)]).toEqual([8, 0, 0, 0, 0])
	const idatLength = view.getUint32(33)
	expect(new TextDecoder().decode(png.subarray(37, 41))).toBe('IDAT')
	const pixels = inflateSync(png.subarray(41, 41 + idatLength))
	expect(pixels.length).toBe((width + 1) * width)
	const pixel = (x: number, y: number) => pixels[y * (width + 1) + 1 + x]
	expect(pixel(0, 0)).toBe(255) // Margin.
	expect(pixel(68, 68)).toBe(0) // Cell (0, 0) is filled.
	expect(pixel(68 * 5, 68)).toBe(255) // Cell (4, 0) is empty.
	expect(pixel(68, 68 * 2)).toBe(0) // Cell (0, 1) is filled.
})

test('sends the rendered grid and asks for a strict structured verdict', async () => {
	expect(await verdict(GRID)).toEqual({ depicts: 'test', hide: false })
	expect(requests).toHaveLength(1)
	const request = requests[0] as {
		input: { content: { image_url?: string; type: string }[] }[]
		model: string
		reasoning: { effort: string }
		text: { format: { strict: boolean; type: string } }
	}
	expect(request.model).toBe('gpt-6-sol')
	expect(request.reasoning).toEqual({ effort: 'low' })
	expect(request.text.format).toMatchObject({ strict: true, type: 'json_schema' })
	expect(imageOf(request)).toBe(imageUrl(GRID))
})

test('hides on a hide verdict and shows otherwise', async () => {
	stub.hide = true
	expect(await shouldHide(GRID)).toBe(true)
	stub.hide = false
	expect(await shouldHide(GRID)).toBe(false)
})

test('hides whatever cannot be decided', async () => {
	stub.status = 400
	expect(await shouldHide(GRID)).toBe(true)
	stub.status = 200
	stub.refusal = true
	expect(await shouldHide(GRID)).toBe(true)
	delete process.env.OPENAI_API_KEY
	requests.length = 0
	expect(await shouldHide(GRID)).toBe(true)
	expect(requests).toHaveLength(0)
})
