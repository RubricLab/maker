import { expect, test } from 'bun:test'
import { nextGeneration } from '../src/app/games'

test('Game of Life evolves the current pixels and keeps dead edges', () => {
	const initial = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
	const next = nextGeneration(initial, 5)
	expect(next).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
	expect(nextGeneration(next, 5)).toEqual(initial)
})
