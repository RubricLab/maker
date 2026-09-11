import { NextResponse } from 'next/server'
import { addCreation, listCreations } from '~/lib/board'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_GRID_SIZES = new Set([3, 5, 7, 9, 12, 15, 18, 21, 30])
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

export function GET() {
	return NextResponse.json(
		{ creations: listCreations() },
		{ headers: { 'Cache-Control': 'no-store' } }
	)
}

export async function POST(request: Request) {
	// The loopback-only app trusts this header only from the auth proxy, which overwrites it.
	const email = request.headers.get('x-maker-user-email')
	if (!email) return NextResponse.json({ error: 'Sign in to publish an icon.' }, { status: 401 })
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

	const result = addCreation(grid, email)
	return NextResponse.json(result, {
		headers: { 'Cache-Control': 'no-store' },
		status: result.created ? 201 : 200
	})
}
