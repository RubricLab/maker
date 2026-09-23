// Hides any visible icon that moderation now flags. Run after deploying a stricter check or after an outage.
// Never unhides: verdicts vary from run to run, and a hidden icon costs its author nothing.
import { listAllCreations, nearHidden, setHidden, sql } from './lib/board'
import { shouldHide } from './lib/moderation'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')

const visible = (await listAllCreations()).filter(creation => !creation.hidden)
let hidden = 0
for (const creation of visible) {
	if (!(await nearHidden(creation.grid)) && !(await shouldHide(creation.grid))) continue
	await setHidden(creation.id, true)
	hidden++
	console.log(`Hid #${creation.id} ${creation.grid}`)
}
console.log(`Checked ${visible.length} visible creations, hid ${hidden}`)
await sql.end()
