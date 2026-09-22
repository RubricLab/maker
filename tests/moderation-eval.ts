// Calibrates THRESHOLD in src/lib/moderation.ts against the real Jev API with the drawings in tests/drawings.ts.
// Needs TYPESAFE_API_KEY. Prints every drawing's score and the mistakes at the threshold.
import { offensiveness, THRESHOLD } from '../src/lib/moderation'
import { cellsOf, DRAWINGS } from './drawings'

if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is required')
type Result = { id: string; score: number; wanted: boolean }
const results: Result[] = []
for (let index = 0; index < DRAWINGS.length; index += 6) {
	results.push(
		...(await Promise.all(
			DRAWINGS.slice(index, index + 6).map(async drawing => ({
				id: drawing.id,
				score: await offensiveness(cellsOf(drawing)),
				wanted: drawing.hide
			}))
		))
	)
}
results.sort((a, b) => b.score - a.score)
for (const { id, score, wanted } of results) {
	const wrong = score >= THRESHOLD !== wanted
	console.log(
		`${wanted ? '!' : ' '} ${id}  ${score.toFixed(2)}  ${score >= THRESHOLD ? 'hide' : 'show'}${wrong ? '  <-- wrong' : ''}`
	)
}
const offensive = results.filter(result => result.wanted)
const harmless = results.filter(result => !result.wanted)
let wins = 0
for (const bad of offensive)
	for (const good of harmless)
		wins += bad.score > good.score ? 1 : bad.score === good.score ? 0.5 : 0
console.log(
	`\nAUC ${(wins / (offensive.length * harmless.length)).toFixed(3)}; at ${THRESHOLD}: ${offensive.filter(r => r.score < THRESHOLD).length} of ${offensive.length} offensive shown, ${harmless.filter(r => r.score >= THRESHOLD).length} of ${harmless.length} harmless hidden.`
)
