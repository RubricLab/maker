import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { imageOf, imageUrl, openaiResponse } from './stubs'

const LEGACY_GRID = '1000000000000000000000000'
const SHOWN_GRID = '0111001010011100101001110'
const HIDDEN_GRID = '0000001110011100111000000'

// This suite uses a disposable local Postgres database, never Railway production.
const url = process.env.DATABASE_URL ?? 'postgres://localhost:55432/maker_test'
if (!/^postgres(?:ql)?:\/\/[^/]*@?localhost:55432\/maker_test$/.test(url))
	throw new Error('Board tests require local maker_test on port 55432')
process.env.DATABASE_URL = url
const admin = postgres(url)
await admin`DROP TABLE IF EXISTS creations, snake_score`
await admin.end()

const directory = mkdtempSync(join(tmpdir(), 'maker-board-'))
const databasePath = join(directory, 'board.sqlite')
const legacy = new Database(databasePath, { create: true })
legacy.exec(`
	CREATE TABLE creations (id INTEGER PRIMARY KEY AUTOINCREMENT, grid TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		hidden INTEGER NOT NULL DEFAULT 0) STRICT;
	INSERT INTO creations (grid) VALUES ('${LEGACY_GRID}');
	CREATE TABLE snake_score (id INTEGER PRIMARY KEY, score INTEGER NOT NULL) STRICT;
	INSERT INTO snake_score VALUES (1, 2);
`)
legacy.close()
const { addCreation, listCreations, findCreation, sql } = await import('../src/lib/board')
const { POST, DELETE: unpublish } = await import('../src/app/api/board/route')
const { GET: getSnake, POST: postSnake } = await import('../src/app/api/snake/route')

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

afterAll(async () => {
	globalThis.fetch = realFetch
	await sql.end()
	rmSync(directory, { force: true, recursive: true })
})

const publish = (grid: string) =>
	POST(new Request('http://localhost/api/board', { body: JSON.stringify({ grid }), method: 'POST' }))
const undoPublish = (id: unknown, undoToken: unknown) =>
	unpublish(
		new Request('http://localhost/api/board', {
			body: JSON.stringify({ id, undoToken }),
			method: 'DELETE'
		})
	)
const submit = (score: unknown, origin = 'http://localhost') =>
	postSnake(
		new Request('http://localhost/api/snake', {
			body: JSON.stringify({ score }),
			headers: { Origin: origin },
			method: 'POST'
		})
	)

test('imports SQLite icons, timestamps, and Snake score idempotently', async () => {
	for (let i = 0; i < 2; i++) {
		const child = Bun.spawn({
			cmd: [process.execPath, 'src/migrate.ts'],
			env: { ...Bun.env, DATABASE_PATH: databasePath, DATABASE_URL: url },
			stderr: 'inherit',
			stdout: 'ignore'
		})
		expect(await child.exited).toBe(0)
	}
	expect((await findCreation(LEGACY_GRID))?.id).toBe(1)
	expect((await listCreations()).map(creation => creation.grid)).toEqual([LEGACY_GRID])
	expect(await (await getSnake()).json()).toEqual({ highScore: 2 })
	const added = await addCreation('1100000000000000000000000', true)
	expect(added.creation.id).toBe(2)
})

test('hidden creations are saved but left off the board', async () => {
	const hidden = await findCreation('1100000000000000000000000')
	expect(hidden).not.toBeNull()
	expect((await listCreations()).some(creation => creation.id === hidden?.id)).toBe(false)
	expect((await addCreation(hidden?.grid ?? '', false)).created).toBe(false)
	expect((await listCreations()).some(creation => creation.id === hidden?.id)).toBe(false)
})

test('API publishes anonymously and hides what moderation flags', async () => {
	const shown = await publish(SHOWN_GRID)
	expect(shown.status).toBe(201)
	const hidden = await publish(HIDDEN_GRID)
	expect(hidden.status).toBe(201)
	const { creation } = (await hidden.json()) as { creation: { grid: string; id: number } }
	expect(creation.grid).toBe(HIDDEN_GRID)
	expect(creation).not.toHaveProperty('hidden')
	const grids = (await listCreations()).map(item => item.grid)
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

test('API hides near-copies of a hidden icon without asking the model', async () => {
	const variant = `1${HIDDEN_GRID.slice(1)}`
	const near = await publish(variant)
	expect(near.status).toBe(201)
	expect((await listCreations()).map(item => item.grid)).not.toContain(variant)
	expect(moderated).toHaveLength(2)
	const far = `1${SHOWN_GRID.slice(1)}`
	expect((await publish(far)).status).toBe(201)
	expect((await listCreations()).map(item => item.grid)).toContain(far)
	expect(moderated).toHaveLength(3)
})

test('only the publisher can undo a post; republishing keeps its moderation verdict', async () => {
	const grid = '1111111111111111111111111'
	const published = (await (await publish(grid)).json()) as {
		creation: { id: number }
		undoToken: string
	}
	expect(published.undoToken).toBeString()
	expect((await undoPublish(published.creation.id, crypto.randomUUID())).status).toBe(403)
	expect((await listCreations()).some(item => item.grid === grid)).toBe(true)
	expect((await undoPublish(published.creation.id, published.undoToken)).status).toBe(200)
	expect((await undoPublish(published.creation.id, published.undoToken)).status).toBe(403)
	expect((await listCreations()).some(item => item.grid === grid)).toBe(false)
	const count = moderated.length
	const republished = (await (await publish(grid)).json()) as {
		created: boolean
		undoToken: string
	}
	expect(republished.created).toBe(true)
	expect(republished.undoToken).not.toBe(published.undoToken)
	expect(moderated).toHaveLength(count)
	expect((await listCreations()).some(item => item.grid === grid)).toBe(true)

	const hiddenGrid = `1${HIDDEN_GRID.slice(1, -1)}1`
	const hidden = (await (await publish(hiddenGrid)).json()) as {
		creation: { id: number }
		undoToken: string
	}
	expect((await undoPublish(hidden.creation.id, hidden.undoToken)).status).toBe(200)
	expect(((await (await publish(hiddenGrid)).json()) as { created: boolean }).created).toBe(false)
	expect((await listCreations()).some(item => item.grid === hiddenGrid)).toBe(false)
	expect(moderated).toHaveLength(count)
})

test('global Snake record persists and only increases', async () => {
	expect(await (await getSnake()).json()).toEqual({ highScore: 2 })
	expect((await submit(4)).status).toBe(200)
	expect(await (await getSnake()).json()).toEqual({ highScore: 4 })
	expect(await (await submit(3)).json()).toEqual({ highScore: 4, newRecord: false })
	expect(await (await submit(7)).json()).toEqual({ highScore: 7, newRecord: true })
	expect((await submit(901)).status).toBe(400)
	expect((await submit(8, 'https://other.example')).status).toBe(403)
	expect(await (await getSnake()).json()).toEqual({ highScore: 7 })
})

test('API rejects grids that are blank or an unsupported size', async () => {
	expect((await publish('0000000000000000000000000')).status).toBe(400)
	expect((await publish('111')).status).toBe(400)
})
