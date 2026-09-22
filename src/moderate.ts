// Re-checks every icon and updates its hidden flag. Run once after deploying moderation
// (older icons default to visible) or after an outage. Uses DATABASE_PATH like the app.
import { listAllCreations, setHidden } from './lib/board'
import { shouldHide } from './lib/moderation'

if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is required')

const creations = listAllCreations()
let changed = 0
for (const creation of creations) {
	const hidden = await shouldHide(creation.grid)
	if (hidden === creation.hidden) continue
	setHidden(creation.id, hidden)
	changed++
	console.log(`${hidden ? 'Hid' : 'Showed'} #${creation.id} ${creation.grid}`)
}
console.log(`Checked ${creations.length} creations, changed ${changed}`)
