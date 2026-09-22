import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { filledCells, jevResponse } from './stubs'

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
if (previousPath === undefined) delete process.env.DATABASE_PATH
else process.env.DATABASE_PATH = previousPath

// Stand in for Jev: one grid is offensive, and every request is counted.
const hiddenCells = HIDDEN_GRID.split('1').length - 1
const moderated: number[] = []
const realFetch = globalThis.fetch
process.env.TYPESAFE_API_KEY = 'test'
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
	const cells = filledCells(JSON.parse(init?.body as string))
	moderated.push(cells)
	return Response.json(jevResponse(cells === hiddenCells ? 0.9 : 0.1))
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
	expect(moderated).toHaveLength(8)
})

test('API answers duplicates without moderating again', async () => {
	const duplicate = await publish(HIDDEN_GRID)
	expect(duplicate.status).toBe(200)
	expect(((await duplicate.json()) as { created: boolean }).created).toBe(false)
	expect(moderated).toHaveLength(8)
})

test('API rejects grids that are blank or an unsupported size', async () => {
	expect((await publish('0000000000000000000000000')).status).toBe(400)
	expect((await publish('111')).status).toBe(400)
})
