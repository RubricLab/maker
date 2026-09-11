import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type BoardCreation = {
	createdBy: string | null
	createdAt: string
	grid: string
	id: number
}

type BoardRow = {
	creator_email: string | null
	created_at: string
	grid: string
	id: number
}

const databasePath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'maker.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

const database = new Database(databasePath, { create: true })
database.exec('PRAGMA busy_timeout = 5000')
// Concurrent Next.js workers can race to enable WAL on a fresh database.
// SQLite does not always invoke busy_timeout for this journal-mode transition.
for (let attempt = 0; ; attempt++) {
	try {
		database.exec('PRAGMA journal_mode = WAL')
		break
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!('code' in error) ||
			error.code !== 'SQLITE_BUSY' ||
			attempt >= 19
		)
			throw error
		Bun.sleepSync(50)
	}
}
database.exec(`
	CREATE TABLE IF NOT EXISTS creations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		grid TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	) STRICT;
`)

// Existing icons have no recorded author. Never assign them to the next publisher.
database
	.transaction(() => {
		const columns = database.query<{ name: string }, []>('PRAGMA table_info(creations)').all()
		if (!columns.some(column => column.name === 'creator_email')) {
			database.exec('ALTER TABLE creations ADD COLUMN creator_email TEXT')
		}
	})
	.immediate()

const serialize = (row: BoardRow): BoardCreation => ({
	createdAt: row.created_at,
	createdBy: row.creator_email,
	grid: row.grid,
	id: row.id
})

export const listCreations = (limit = 90): BoardCreation[] => {
	const rows = database
		.query('SELECT id, grid, created_at, creator_email FROM creations ORDER BY id DESC LIMIT ?')
		.all(limit) as BoardRow[]
	return rows.map(serialize)
}

export const findCreation = (grid: string): BoardCreation | null => {
	const row = database
		.query<BoardRow, [string]>(
			'SELECT id, grid, created_at, creator_email FROM creations WHERE grid = ?'
		)
		.get(grid)
	return row ? serialize(row) : null
}

export const addCreation = (
	grid: string,
	email: string
): { created: boolean; creation: BoardCreation } => {
	if (!email) throw new Error('Publisher email is required')
	const result = database
		.query('INSERT OR IGNORE INTO creations (grid, creator_email) VALUES (?, ?)')
		.run(grid, email)
	const creation = findCreation(grid)
	if (!creation) throw new Error('Failed to save creation')
	return { created: result.changes > 0, creation }
}
