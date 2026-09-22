import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type BoardCreation = {
	createdAt: string
	grid: string
	id: number
}

type BoardRow = {
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
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		hidden INTEGER NOT NULL DEFAULT 0
	) STRICT;
`)

// Icons published before moderation stay visible until \`bun run moderate\` checks them.
database
	.transaction(() => {
		const columns = database.query<{ name: string }, []>('PRAGMA table_info(creations)').all()
		if (!columns.some(column => column.name === 'hidden')) {
			database.exec('ALTER TABLE creations ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0')
		}
	})
	.immediate()

const serialize = (row: BoardRow): BoardCreation => ({
	createdAt: row.created_at,
	grid: row.grid,
	id: row.id
})

export const listCreations = (limit = 90): BoardCreation[] => {
	const rows = database
		.query('SELECT id, grid, created_at FROM creations WHERE hidden = 0 ORDER BY id DESC LIMIT ?')
		.all(limit) as BoardRow[]
	return rows.map(serialize)
}

export const findCreation = (grid: string): BoardCreation | null => {
	const row = database
		.query<BoardRow, [string]>('SELECT id, grid, created_at FROM creations WHERE grid = ?')
		.get(grid)
	return row ? serialize(row) : null
}

export const addCreation = (
	grid: string,
	hidden: boolean
): { created: boolean; creation: BoardCreation } => {
	const result = database
		.query('INSERT OR IGNORE INTO creations (grid, hidden) VALUES (?, ?)')
		.run(grid, hidden ? 1 : 0)
	const creation = findCreation(grid)
	if (!creation) throw new Error('Failed to save creation')
	return { created: result.changes > 0, creation }
}

export const listAllCreations = (): (BoardCreation & { hidden: boolean })[] => {
	const rows = database
		.query('SELECT id, grid, created_at, hidden FROM creations ORDER BY id')
		.all() as (BoardRow & { hidden: number })[]
	return rows.map(row => ({ ...serialize(row), hidden: row.hidden === 1 }))
}

export const setHidden = (id: number, hidden: boolean): void => {
	database.query('UPDATE creations SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id)
}
