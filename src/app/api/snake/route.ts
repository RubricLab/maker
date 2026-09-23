import { NextResponse } from 'next/server'
import { recordSnakeScore, snakeHighScore } from '~/lib/board'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
	const highScore = await snakeHighScore()
	return NextResponse.json({ highScore }, { headers })
}

export async function POST(request: Request) {
	if (request.headers.get('origin') !== new URL(request.url).origin)
		return NextResponse.json({ error: 'Invalid origin.' }, { headers, status: 403 })
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: 'Invalid request.' }, { headers, status: 400 })
	}
	const score = (body as { score?: unknown } | null)?.score
	if (!Number.isInteger(score) || typeof score !== 'number' || score < 0 || score > 900)
		return NextResponse.json({ error: 'Invalid score.' }, { headers, status: 400 })
	const result = await recordSnakeScore(score)
	return NextResponse.json(result, { headers })
}
