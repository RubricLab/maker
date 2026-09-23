import { expect, test } from 'bun:test'
import { expandLifeGrid, nextGeneration } from '../src/app/games'

test('Game of Life centers the drawing in a canvas five times wider', () => {
	const expanded = expandLifeGrid([1, 0, 0, 1])
	expect(expanded).toHaveLength(100)
	expect(expanded[44]).toBe(1)
	expect(expanded[55]).toBe(1)
	expect(expanded.reduce((sum, cell) => sum + cell, 0)).toBe(2)
})

test('Game of Life evolves the current pixels and keeps dead edges', () => {
	const initial = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
	const next = nextGeneration(initial, 5)
	expect(next).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
	expect(nextGeneration(next, 5)).toEqual(initial)
})
