export const resizeGrid = (grid: number[], newSize: number): number[] => {
	const oldSize = Math.sqrt(grid.length)
	const offset = Math.trunc((newSize - oldSize) / 2)
	const resized = Array<number>(newSize * newSize).fill(0)
	for (let y = 0; y < oldSize; y++) {
		for (let x = 0; x < oldSize; x++) {
			const nextX = x + offset
			const nextY = y + offset
			if (nextX >= 0 && nextX < newSize && nextY >= 0 && nextY < newSize) {
				resized[nextY * newSize + nextX] = grid[y * oldSize + x] ?? 0
			}
		}
	}
	return resized
}
