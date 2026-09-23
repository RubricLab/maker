// Idempotent import from the old SQLite volume. Run at startup and once after cutover
// to catch writes made by the old deployment while Railway was switching instances.
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { initializeBoard, sql } from './lib/board'

const path = process.env.DATABASE_PATH ?? '/data/board-final.sqlite'
await initializeBoard()
if (!existsSync(path)) {
	console.log('No legacy SQLite database; Postgres is ready')
} else {
	const sqlite = new Database(path, { readonly: true })
	try {
		const creations = sqlite
			.query<{ id: number; grid: string; created_at: string; hidden: number }, []>(
				'SELECT id, grid, created_at, hidden FROM creations ORDER BY id'
			)
			.all()
		const score =
			sqlite.query<{ score: number }, []>('SELECT score FROM snake_score WHERE id = 1').get()?.score ??
			0
		await sql.begin(async tx => {
			for (const creation of creations) {
				await tx`INSERT INTO creations (id, grid, created_at, hidden) VALUES (${creation.id}, ${creation.grid}, ${creation.created_at}, ${creation.hidden}) ON CONFLICT (id) DO NOTHING`
			}
			await tx`UPDATE snake_score SET score = GREATEST(score, ${score}) WHERE id = 1`
			await tx`SELECT setval(pg_get_serial_sequence('creations', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM creations), 1), (SELECT COUNT(*) > 0 FROM creations))`
		})
		console.log(`Imported ${creations.length} legacy creations and score ${score}`)
	} finally {
		sqlite.close()
	}
}
await sql.end()
