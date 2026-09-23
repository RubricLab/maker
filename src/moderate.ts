// Re-checks every icon and updates its hidden flag. Run once after deploying moderation
// (older icons default to visible) or after an outage. Uses DATABASE_URL like the app.
import { listAllCreations, setHidden, sql } from './lib/board'
import { shouldHide } from './lib/moderation'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const creations = await listAllCreations()
let changed = 0
for (const creation of creations) {
	const hidden = await shouldHide(creation.grid)
	if (hidden === creation.hidden) continue
	await setHidden(creation.id, hidden)
	changed++
	console.log(`${hidden ? 'Hid' : 'Showed'} #${creation.id} ${creation.grid}`)
}
console.log(`Checked ${creations.length} creations, changed ${changed}`)
await sql.end()
