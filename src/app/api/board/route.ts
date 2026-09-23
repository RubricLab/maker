import { NextResponse } from 'next/server'
import { addCreation, findCreation, listCreations, nearHidden } from '~/lib/board'
import { shouldHide } from '~/lib/moderation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_GRID_SIZES = new Set([5, 7, 9, 12, 15, 18, 21, 30])
const recentRequests = new Map<string, number[]>()
const RATE_LIMIT = 12
const RATE_WINDOW_MS = 60_000

const isValidGrid = (grid: unknown): grid is string => {
	if (typeof grid !== 'string' || !/^[01]+$/.test(grid) || !grid.includes('1')) return false
	const size = Math.sqrt(grid.length)
	return ALLOWED_GRID_SIZES.has(size)
}

const requestIp = (request: Request): string =>
	request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

const isRateLimited = (request: Request): boolean => {
	const ip = requestIp(request)
	const cutoff = Date.now() - RATE_WINDOW_MS
	const requests = (recentRequests.get(ip) ?? []).filter(timestamp => timestamp > cutoff)
	if (requests.length >= RATE_LIMIT) {
		recentRequests.set(ip, requests)
		return true
	}
	requests.push(Date.now())
	recentRequests.set(ip, requests)
	return false
}

export async function GET() {
	const creations = await listCreations()
	return NextResponse.json({ creations }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
	if (isRateLimited(request)) {
		return NextResponse.json({ error: 'Try again in a minute.' }, { status: 429 })
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
	}

	const grid = (body as { grid?: unknown } | null)?.grid
	if (!isValidGrid(grid)) {
		return NextResponse.json({ error: 'Draw something before adding it.' }, { status: 400 })
	}

	// Moderation is only paid for once per distinct grid; the publisher never learns the verdict.
	const existing = await findCreation(grid)
	const result = existing
		? { created: false, creation: existing }
		: await addCreation(grid, (await nearHidden(grid)) || (await shouldHide(grid)))
	return NextResponse.json(result, {
		headers: { 'Cache-Control': 'no-store' },
		status: result.created ? 201 : 200
	})
}
