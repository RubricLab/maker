import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { imageOf, imageUrl, openaiResponse } from './stubs'

const LEGACY_GRID = '1000000000000000000000000'
const SHOWN_GRID = '0111001010011100101001110'
const HIDDEN_GRID = '0000001110011100111000000'

const directory = mkdtempSync(join(tmpdir(), 'maker-board-'))
const databasePath = join(directory, 'board.sqlite')
const legacy = new Database(databasePath, { create: true })
legacy.exec(
	`CREATE TABLE creations (id INTEGER PRIMARY KEY AUTOINCREMENT, grid TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), creator_email TEXT) STRICT; INSERT INTO creations (grid) VALUES ('${LEGACY_GRID}');`
)
legacy.close()
const previousPath = process.env.DATABASE_PATH
process.env.DATABASE_PATH = databasePath
const { addCreation, listCreations, findCreation } = await import('../src/lib/board')
const { POST } = await import('../src/app/api/board/route')
const { GET: getSnake, POST: postSnake } = await import('../src/app/api/snake/route')
if (previousPath === undefined) delete process.env.DATABASE_PATH
else process.env.DATABASE_PATH = previousPath

// Stand in for the moderation API: one grid is offensive, and every image checked is recorded.
const hiddenImage = imageUrl(HIDDEN_GRID)
const moderated: string[] = []
const realFetch = globalThis.fetch
process.env.OPENAI_API_KEY = 'test'
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
	const image = imageOf(JSON.parse(init?.body as string))
	moderated.push(image)
	return Response.json(openaiResponse(image === hiddenImage))
}) as typeof fetch

afterAll(() => {
	globalThis.fetch = realFetch
	rmSync(directory, { force: true, recursive: true })
})

const publish = (grid: string) =>
	POST(new Request('http://localhost/api/board', { body: JSON.stringify({ grid }), method: 'POST' }))

test('migration adds the hidden flag and keeps legacy icons visible', () => {
	expect(findCreation(LEGACY_GRID)).not.toBeNull()
	expect(listCreations().map(creation => creation.grid)).toEqual([LEGACY_GRID])
})

test('hidden creations are saved but left off the board', () => {
	const hidden = addCreation('1100000000000000000000000', true)
	expect(hidden.created).toBe(true)
	expect(findCreation(hidden.creation.grid)).toEqual(hidden.creation)
	expect(listCreations().some(creation => creation.id === hidden.creation.id)).toBe(false)
	expect(addCreation(hidden.creation.grid, false).created).toBe(false)
	expect(listCreations().some(creation => creation.id === hidden.creation.id)).toBe(false)
})

test('API publishes anonymously and hides what moderation flags', async () => {
	const shown = await publish(SHOWN_GRID)
	expect(shown.status).toBe(201)
	const hidden = await publish(HIDDEN_GRID)
	expect(hidden.status).toBe(201)
	const { creation } = (await hidden.json()) as { creation: { grid: string; id: number } }
	expect(creation.grid).toBe(HIDDEN_GRID)
	expect(creation).not.toHaveProperty('hidden')
	const grids = listCreations().map(item => item.grid)
	expect(grids).toContain(SHOWN_GRID)
	expect(grids).not.toContain(HIDDEN_GRID)
	expect(moderated).toHaveLength(2)
})

test('API answers duplicates without moderating again', async () => {
	const duplicate = await publish(HIDDEN_GRID)
	expect(duplicate.status).toBe(200)
	expect(((await duplicate.json()) as { created: boolean }).created).toBe(false)
	expect(moderated).toHaveLength(2)
})

test('global Snake record persists and only increases', async () => {
	expect(await getSnake().json()).toEqual({ highScore: 0 })
	const submit = (score: unknown, origin = 'http://localhost') =>
		postSnake(
			new Request('http://localhost/api/snake', {
				body: JSON.stringify({ score }),
				headers: { Origin: origin },
				method: 'POST'
			})
		)
	expect((await submit(4)).status).toBe(200)
	expect(await getSnake().json()).toEqual({ highScore: 4 })
	expect(await (await submit(3)).json()).toEqual({ highScore: 4, newRecord: false })
	expect(await (await submit(7)).json()).toEqual({ highScore: 7, newRecord: true })
	expect((await submit(901)).status).toBe(400)
	expect((await submit(8, 'https://other.example')).status).toBe(403)
	expect(await getSnake().json()).toEqual({ highScore: 7 })
})

test('API rejects grids that are blank or an unsupported size', async () => {
	expect((await publish('0000000000000000000000000')).status).toBe(400)
	expect((await publish('111')).status).toBe(400)
})
