// Checks the classifier against the calibration drawings in tests/drawings.ts using the real API.
// Needs OPENAI_API_KEY; EFFORT=medium compares reasoning effort. Prints every verdict and the mistakes.
import { verdict } from '../src/lib/moderation'
import { cellsOf, DRAWINGS } from './drawings'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')
const effort = (process.env.EFFORT ?? 'low') as 'low' | 'medium'
type Result = { depicts: string; hide: boolean | null; id: string; ms: number; wanted: boolean }
const results: Result[] = []
for (let index = 0; index < DRAWINGS.length; index += 6) {
	results.push(
		...(await Promise.all(
			DRAWINGS.slice(index, index + 6).map(async (drawing): Promise<Result> => {
				const started = performance.now()
				try {
					const { depicts, hide } = await verdict(cellsOf(drawing), effort)
					return { depicts, hide, id: drawing.id, ms: performance.now() - started, wanted: drawing.hide }
				} catch (error) {
					return {
						depicts: String(error).slice(0, 80),
						hide: null,
						id: drawing.id,
						ms: performance.now() - started,
						wanted: drawing.hide
					}
				}
			})
		))
	)
}
for (const { depicts, hide, id, ms, wanted } of results) {
	const wrong = hide !== wanted
	const decision = hide === null ? 'error' : hide ? 'hide ' : 'show '
	console.log(
		`${wanted ? '!' : ' '} ${id}  ${decision} ${String(Math.round(ms)).padStart(5)}ms  ${depicts.slice(0, 70)}${wrong ? '  <-- wrong' : ''}`
	)
}
const offensive = results.filter(result => result.wanted)
const harmless = results.filter(result => !result.wanted)
const missed = offensive.filter(result => result.hide !== true).length
const hidden = harmless.filter(result => result.hide !== false).length
const latencies = results.map(result => result.ms).sort((a, b) => a - b)
const median = Math.round(latencies[Math.floor(latencies.length / 2)] ?? 0)
console.log(
	`\n${results.length} drawings at effort ${effort}: ${missed} of ${offensive.length} offensive shown, ${hidden} of ${harmless.length} harmless hidden or errored; median ${median}ms, max ${Math.round(latencies[latencies.length - 1] ?? 0)}ms.`
)
