import { expect, test } from 'bun:test'
import { resizeGrid } from '../src/lib/resize-grid'

const cells = (size: number, points: [number, number][]) => {
	const grid = Array<number>(size * size).fill(0)
	for (const [x, y] of points) grid[y * size + x] = 1
	return grid
}

test('growing a grid keeps the drawing centered', () => {
	expect(
		resizeGrid(
			cells(5, [
				[0, 0],
				[2, 2],
				[4, 4]
			]),
			7
		)
	).toEqual(
		cells(7, [
			[1, 1],
			[3, 3],
			[5, 5]
		])
	)
	expect(resizeGrid(cells(9, [[4, 4]]), 12)).toEqual(cells(12, [[5, 5]]))
})

test('shrinking clips the edges around the center and undo can restore the original', () => {
	const original = cells(7, [
		[0, 0],
		[1, 1],
		[3, 3],
		[5, 5],
		[6, 6]
	])
	expect(resizeGrid(original, 5)).toEqual(
		cells(5, [
			[0, 0],
			[2, 2],
			[4, 4]
		])
	)
	expect(resizeGrid(cells(12, [[5, 5]]), 9)).toEqual(cells(9, [[4, 4]]))
})
