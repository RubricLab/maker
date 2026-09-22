import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'maker-board-'))
const databasePath = join(directory, 'board.sqlite')
const legacy = new Database(databasePath, { create: true })
legacy.exec(
	`CREATE TABLE creations (id INTEGER PRIMARY KEY AUTOINCREMENT, grid TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) STRICT; INSERT INTO creations (grid) VALUES ('100000000');`
)
legacy.close()
const previousPath = process.env.DATABASE_PATH
process.env.DATABASE_PATH = databasePath
const { addCreation, listCreations, findCreation } = await import('../src/lib/board')
const { POST } = await import('../src/app/api/board/route')
if (previousPath === undefined) delete process.env.DATABASE_PATH
else process.env.DATABASE_PATH = previousPath

afterAll(() => rmSync(directory, { force: true, recursive: true }))

test('migration preserves legacy icons without inventing attribution', () => {
	const legacy = findCreation('100000000')!
	expect(legacy.createdBy).toBeNull()
	const duplicate = addCreation(legacy.grid, 'alice@example.com')
	expect(duplicate.created).toBe(false)
	expect(duplicate.creation.createdBy).toBeNull()
})

test('stores publisher email and preserves the original credit on duplicates', () => {
	const first = addCreation('110000000', 'alice@example.com')
	expect(first.created).toBe(true)
	expect(first.creation.createdBy).toBe('alice@example.com')
	const second = addCreation('110000000', 'bob@example.com')
	expect(second.created).toBe(false)
	expect(second.creation.createdBy).toBe('alice@example.com')
	expect(listCreations().find(item => item.id === first.creation.id)?.createdBy).toBe(
		'alice@example.com'
	)
})

test('API rejects anonymous publishing and ignores author fields in the body', async () => {
	const body = JSON.stringify({ createdBy: 'forged@example.com', grid: '1110000000000000000000000' })
	const anonymous = await POST(new Request('http://localhost/api/board', { body, method: 'POST' }))
	expect(anonymous.status).toBe(401)
	const published = await POST(
		new Request('http://localhost/api/board', {
			body,
			headers: { 'x-maker-user-email': 'verified@example.com' },
			method: 'POST'
		})
	)
	const result = await published.json()
	expect(published.status).toBe(201)
	expect(result.creation.createdBy).toBe('verified@example.com')
})
