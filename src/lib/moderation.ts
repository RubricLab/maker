import { noul, TypeSafeClient } from '@typesafe-ai/sdk'
import { HARMLESS, OFFENSIVE } from './references'

// Calibrated with tests/moderation-eval.ts. Errs toward hiding: a hidden icon is still visible to its author.
export const THRESHOLD = 0.45

const instructions = (size: number) =>
	`A drawing from a pixel-art editor. The canvas is a ${size} by ${size} grid of square cells; the user fills cells black on a white background, and the result is shown as a black-and-white image in which the filled cells together form a picture. "drawing" gives that grid as one string per row from top to bottom, one character per cell from left to right: "#" is a filled black cell and "." is an empty white cell. The reference drawings were made the same way at other resolutions, so a reference and the drawing may differ in grid size, line thickness, position, rotation, or mirroring; judge whether they form the same overall picture.`

const QUESTION = noul(
	'Does the drawing form the same picture as one of the offensive references (a swastika, genitalia, SS bolts, or a noose), allowing for size, thickness, rotation, or mirroring?',
	{
		false:
			'The drawing forms something else, such as the harmless references or any letter, face, animal, object, plant, pattern, or noise.',
		true:
			'The drawing forms a swastika, a penis or other genitalia, SS bolts, a noose, or another hateful or obscene symbol.'
	}
)

const rowsOf = (grid: string): string[] => {
	const size = Math.sqrt(grid.length)
	return Array.from({ length: size }, (_, y) =>
		grid
			.slice(y * size, (y + 1) * size)
			.replace(/1/g, '#')
			.replace(/0/g, '.')
	)
}

const rotate = (rows: string[]): string[] =>
	rows.map((_, x) =>
		rows
			.map(row => row[x])
			.reverse()
			.join('')
	)

const ask = async (client: TypeSafeClient, rows: string[]): Promise<number> => {
	const { answers } = await client.systemOne({
		questions: { offensive: QUESTION },
		// biome-ignore assist/source/useSortedKeys: Jev reads the state in order; the instructions must come first.
		state: {
			instructions: instructions(rows.length),
			drawing: rows,
			offensive_references: OFFENSIVE,
			harmless_references: HARMLESS
		}
	})
	return answers.offensive.noul
}

/** How much a grid looks like one of the offensive references to Jev, from 0 to 1, averaged over its four rotations. */
export const offensiveness = async (grid: string): Promise<number> => {
	const client = new TypeSafeClient({ timeout: 15_000 })
	const upright = rowsOf(grid)
	const quarter = rotate(upright)
	const half = rotate(quarter)
	const rotations = [upright, quarter, half, rotate(half)]
	const scores = await Promise.all(rotations.map(rows => ask(client, rows)))
	return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

/** Whether a grid is too offensive for the public board. Fails closed: a missing key or a failed request hides it. */
export const shouldHide = async (grid: string): Promise<boolean> => {
	if (!process.env.TYPESAFE_API_KEY) {
		console.error('TYPESAFE_API_KEY is not set; hiding creation')
		return true
	}
	try {
		return (await offensiveness(grid)) >= THRESHOLD
	} catch (error) {
		console.error('Moderation failed; hiding creation', error)
		return true
	}
}
