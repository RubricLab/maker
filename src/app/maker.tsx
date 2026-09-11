'use client'

import { ArrowRightIcon, ClipboardCopyIcon, DownloadIcon } from '@radix-ui/react-icons'
import { createParser, useQueryState } from 'nuqs'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDarkMode } from '~/hooks/useDarkMode'
import type { BoardCreation } from '~/lib/board'
import { GRID_SIZES, RUBRIC_BINARY } from '~/lib/constants'

const GRID_RESOLUTION = 99
const PNG_TARGET_SIZE = 400

type GridImageCreatorProps = {
	initialCreation: BoardCreation | null
	initialGrid?: string
}

const parseAsBooleanString = createParser({
	parse: (queryValue: string) => {
		if (!/^[01]+$/.test(queryValue)) return null
		const size = Math.sqrt(queryValue.length)
		if (!GRID_SIZES.some(gridSize => gridSize === size)) return null
		return queryValue.split('').map(char => Number(char))
	},
	serialize: value => value.join('')
})

const createGridPath = (grid: string): string => {
	const size = Math.sqrt(grid.length)
	let path = ''
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (grid[y * size + x] === '1') path += `M${x} ${y}h1v1H${x}z`
		}
	}
	return path
}

export const GridImageCreator: FC<GridImageCreatorProps> = ({
	initialCreation,
	initialGrid = RUBRIC_BINARY
}) => {
	const [grid, setGrid] = useQueryState(
		'grid',
		parseAsBooleanString.withDefault(initialGrid.split('').map(char => Number(char)))
	)
	const [transparentBackground, setTransparentBackground] = useState(true)
	const [board, setBoard] = useState<BoardCreation[]>([])
	const [boardLoading, setBoardLoading] = useState(true)
	const [addingToBoard, setAddingToBoard] = useState(false)
	const [addedGrid, setAddedGrid] = useState<string | null>(null)
	const [poppingCreation, setPoppingCreation] = useState({ id: 0, nonce: 0 })

	const darkMode = useDarkMode()
	const gridSize = useMemo(() => Math.sqrt(grid.length), [grid])
	const serializedGrid = useMemo(() => grid.join(''), [grid])
	const selectedCreation =
		board.find(creation => creation.grid === serializedGrid) ??
		(initialCreation?.grid === serializedGrid ? initialCreation : null)
	const smallerGridSize = [...GRID_SIZES].reverse().find(size => size < gridSize)
	const largerGridSize = GRID_SIZES.find(size => size > gridSize)
	const isBlank = !grid.some(Boolean)
	const isDrawingRef = useRef(false)
	const drawValueRef = useRef(1)
	const lastPaintedCellRef = useRef<number | null>(null)
	const faviconRef = useRef<HTMLLinkElement | null>(null)

	useEffect(() => {
		let cancelled = false
		const loadBoard = async (): Promise<void> => {
			try {
				const response = await fetch('/api/board', { cache: 'no-store' })
				if (!response.ok) throw new Error('Failed to load board')
				const payload = (await response.json()) as { creations: BoardCreation[] }
				if (!cancelled) setBoard(payload.creations)
			} catch (error) {
				console.error({ error })
			} finally {
				if (!cancelled) setBoardLoading(false)
			}
		}
		void loadBoard()
		return () => {
			cancelled = true
		}
	}, [])

	const handleSizeChange = (newSize: number | undefined): void => {
		if (!newSize) return
		setGrid(Array(newSize ** 2).fill(0))
	}

	const paintCell = useCallback(
		(index: number, value: number): void => {
			if (lastPaintedCellRef.current === index) return

			setGrid(previousGrid => {
				if (previousGrid[index] === value) return previousGrid
				const nextGrid = [...previousGrid]
				nextGrid[index] = value
				return nextGrid
			})
			lastPaintedCellRef.current = index
		},
		[setGrid]
	)

	const handlePointerDown = (index: number): void => {
		const nextValue = grid[index] ? 0 : 1
		isDrawingRef.current = true
		drawValueRef.current = nextValue
		paintCell(index, nextValue)
	}

	const handlePointerMove = (index: number): void => {
		if (isDrawingRef.current) paintCell(index, drawValueRef.current)
	}

	const stopDrawing = useCallback((): void => {
		isDrawingRef.current = false
		lastPaintedCellRef.current = null
	}, [])

	useEffect(() => {
		window.addEventListener('pointerup', stopDrawing)
		window.addEventListener('pointercancel', stopDrawing)
		return () => {
			window.removeEventListener('pointerup', stopDrawing)
			window.removeEventListener('pointercancel', stopDrawing)
		}
	}, [stopDrawing])

	const generateSVG = useCallback(
		(includeBackground = false) => {
			const cellSize = GRID_RESOLUTION / gridSize
			const foreground = darkMode ? 'white' : 'black'
			const background = darkMode ? 'black' : 'white'
			const rects: string[] = []

			for (let y = 0; y < gridSize; y++) {
				let startX: number | null = null
				let width = 0

				for (let x = 0; x <= gridSize; x++) {
					const index = y * gridSize + x
					const cell = x < gridSize ? grid[index] : false

					if (cell && startX === null) {
						startX = x
						width = 1
					} else if (cell) {
						width++
					}

					if ((!cell || x === gridSize) && startX !== null) {
						rects.push(
							`<rect x="${startX * cellSize}" y="${y * cellSize}" width="${
								width * cellSize
							}" height="${cellSize}" fill="${foreground}" />`
						)
						startX = null
						width = 0
					}
				}
			}

			const backgroundRect = includeBackground
				? `<rect width="${GRID_RESOLUTION}" height="${GRID_RESOLUTION}" fill="${background}" />`
				: ''

			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_RESOLUTION} ${GRID_RESOLUTION}" shape-rendering="crispEdges">${backgroundRect}${rects.join('')}</svg>`
		},
		[darkMode, grid, gridSize]
	)

	useEffect(() => {
		const existingIcon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
		const icon = existingIcon ?? document.createElement('link')
		const previousHref = icon.getAttribute('href')

		if (!existingIcon) {
			icon.rel = 'icon'
			icon.type = 'image/svg+xml'
			document.head.appendChild(icon)
		}
		faviconRef.current = icon

		return () => {
			faviconRef.current = null
			if (!existingIcon) icon.remove()
			else if (previousHref) icon.href = previousHref
			else icon.removeAttribute('href')
		}
	}, [])

	useEffect(() => {
		if (!faviconRef.current) return
		faviconRef.current.href = `data:image/svg+xml,${encodeURIComponent(generateSVG(true))}`
	}, [generateSVG])

	const copyAsSVG = async (): Promise<void> => {
		try {
			await navigator.clipboard.writeText(generateSVG(!transparentBackground))
			toast.success('SVG copied')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to copy SVG')
		}
	}

	const downloadAsSVG = (): void => {
		try {
			const blob = new Blob([generateSVG(!transparentBackground)], { type: 'image/svg+xml' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `grid-${gridSize}x${gridSize}.svg`
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(url)
			toast.success('SVG downloaded')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to download SVG')
		}
	}

	const gridToPngBlob = useCallback(async (): Promise<Blob> => {
		const cellSize = Math.max(1, Math.round(PNG_TARGET_SIZE / gridSize))
		const imageSize = gridSize * cellSize
		const canvas = document.createElement('canvas')
		canvas.width = imageSize
		canvas.height = imageSize
		const context = canvas.getContext('2d')
		if (!context) throw new Error('Failed to get canvas context')

		context.imageSmoothingEnabled = false
		const foreground = darkMode ? '#ffffff' : '#000000'
		const background = darkMode ? '#000000' : '#ffffff'

		if (!transparentBackground) {
			context.fillStyle = background
			context.fillRect(0, 0, imageSize, imageSize)
		}

		context.fillStyle = foreground
		for (let y = 0; y < gridSize; y++) {
			for (let x = 0; x < gridSize; x++) {
				const index = y * gridSize + x
				if (grid[index]) context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
			}
		}

		return new Promise((resolve, reject) => {
			canvas.toBlob(blob => {
				if (blob) resolve(blob)
				else reject(new Error('Failed to create PNG blob'))
			}, 'image/png')
		})
	}, [darkMode, grid, gridSize, transparentBackground])

	const copyAsPNG = useCallback(async (): Promise<void> => {
		try {
			const blob = await gridToPngBlob()
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
			toast.success('PNG copied')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to copy PNG')
		}
	}, [gridToPngBlob])

	const downloadAsPNG = useCallback(async (): Promise<void> => {
		try {
			const blob = await gridToPngBlob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `grid-${gridSize}x${gridSize}.png`
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(url)
			toast.success('PNG downloaded')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to download PNG')
		}
	}, [gridSize, gridToPngBlob])

	const addToBoard = async (): Promise<void> => {
		if (isBlank || addingToBoard) return
		setAddingToBoard(true)
		try {
			const response = await fetch('/api/board', {
				body: JSON.stringify({ grid: serializedGrid }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST'
			})
			const payload = (await response.json()) as {
				created?: boolean
				creation?: BoardCreation
				error?: string
			}
			if (!response.ok || !payload.creation) throw new Error(payload.error || 'Failed to add creation')

			const creation = payload.creation
			setBoard(previous => [creation, ...previous.filter(item => item.id !== creation.id)])
			setAddedGrid(serializedGrid)
			setPoppingCreation(previous => ({ id: creation.id, nonce: previous.nonce + 1 }))
			toast.success(payload.created ? 'Added to board' : 'Already on the board')
		} catch (error) {
			console.error({ error })
			toast.error(error instanceof Error ? error.message : 'Failed to add creation')
		} finally {
			setAddingToBoard(false)
		}
	}

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (!(event.metaKey || event.ctrlKey)) return

			const key = event.key.toLowerCase()
			if (key === 's') {
				event.preventDefault()
				void downloadAsPNG()
				return
			}

			if (key !== 'c') return
			const target = event.target as HTMLElement | null
			if (target && /^(input|textarea|select)$/i.test(target.tagName)) return
			event.preventDefault()
			void copyAsPNG()
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [copyAsPNG, downloadAsPNG])

	const clearGrid = (): void => {
		setGrid(Array(gridSize ** 2).fill(0))
	}

	return (
		<main className="maker">
			<div className="creator">
				<div className="canvas-heading">
					{selectedCreation?.createdBy ? (
						<p className="canvas-creator">Created by {selectedCreation.createdBy}</p>
					) : null}
					<button
						className="action-button secondary-action desktop-board-action"
						type="button"
						onClick={addToBoard}
						disabled={isBlank || addingToBoard || addedGrid === serializedGrid}
					>
						<span>
							{addingToBoard ? 'Adding…' : addedGrid === serializedGrid ? 'On board' : 'Add to board'}
						</span>
						<ArrowRightIcon aria-hidden="true" />
					</button>
				</div>

				<div className="editor">
					<div className="canvas">
						<div className="axis x-axis" aria-hidden="true">
							{Array.from({ length: gridSize + 1 }, (_, index) => (
								<span className="axis-tick" key={index}>
									<span className="axis-label">{index}</span>
								</span>
							))}
						</div>
						<div className="axis y-axis" aria-hidden="true">
							{Array.from({ length: gridSize + 1 }, (_, index) => (
								<span className="axis-tick" key={index}>
									<span className="axis-label">{index}</span>
								</span>
							))}
						</div>
						<div
							className="pixel-grid"
							data-transparent={transparentBackground}
							style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
						>
							{grid.map((cell, index) => (
								<button
									key={index}
									className="pixel-cell"
									data-active={cell === 1}
									type="button"
									aria-label={`${cell ? 'Erase' : 'Fill'} row ${Math.floor(index / gridSize) + 1}, column ${(index % gridSize) + 1}`}
									aria-pressed={cell === 1}
									onClick={event => {
										if (event.detail !== 0) return
										lastPaintedCellRef.current = null
										paintCell(index, cell ? 0 : 1)
										lastPaintedCellRef.current = null
									}}
									onPointerDown={event => {
										if (event.button !== 0) return
										event.preventDefault()
										handlePointerDown(index)
									}}
									onPointerEnter={() => handlePointerMove(index)}
								/>
							))}
						</div>
					</div>

					<div className="editor-meta">
						<span className="editor-help">
							Click and drag to paint. Start on a filled pixel to erase.
						</span>
						<label className="background-toggle">
							<span>Transparent</span>
							<input
								type="checkbox"
								checked={transparentBackground}
								onChange={event => setTransparentBackground(event.target.checked)}
							/>
							<span className="switch-track" aria-hidden="true" />
						</label>
					</div>
				</div>

				<div className="sidebar">
					<section className="size-section" aria-labelledby="size-title">
						<h2 id="size-title" className="section-label">
							Grid size
						</h2>
						<div className="size-stepper">
							<button
								className="size-button size-decrease"
								type="button"
								onClick={() => handleSizeChange(smallerGridSize)}
								disabled={!smallerGridSize}
								aria-label="Make grid smaller"
							>
								<span aria-hidden="true">−</span>
							</button>
							<output className="size-value" aria-live="polite">
								{gridSize}
								<span>×</span>
								{gridSize}
							</output>
							<button
								className="size-button size-increase"
								type="button"
								onClick={() => handleSizeChange(largerGridSize)}
								disabled={!largerGridSize}
								aria-label="Make grid larger"
							>
								<span aria-hidden="true">+</span>
							</button>
						</div>
					</section>

					<section className="actions-section" aria-labelledby="actions-title">
						<h2 id="actions-title" className="section-label">
							Actions
						</h2>

						<div className="export-actions">
							<button className="action-button primary-action" type="button" onClick={copyAsPNG}>
								<span className="action-label">
									<ClipboardCopyIcon aria-hidden="true" />
									Copy PNG
								</span>
								<kbd>⌘C</kbd>
							</button>
							<button className="action-button secondary-action" type="button" onClick={downloadAsPNG}>
								<span className="action-label">
									<DownloadIcon aria-hidden="true" />
									Download PNG
								</span>
								<kbd>⌘S</kbd>
							</button>
							<button className="action-button secondary-action" type="button" onClick={copyAsSVG}>
								<span className="action-label">
									<ClipboardCopyIcon aria-hidden="true" />
									Copy SVG
								</span>
							</button>
							<button className="action-button secondary-action" type="button" onClick={downloadAsSVG}>
								<span className="action-label">
									<DownloadIcon aria-hidden="true" />
									Download SVG
								</span>
							</button>
							<button
								className="action-button secondary-action mobile-board-action"
								type="button"
								onClick={addToBoard}
								disabled={isBlank || addingToBoard || addedGrid === serializedGrid}
							>
								<span>
									{addingToBoard ? 'Adding…' : addedGrid === serializedGrid ? 'On board' : 'Add to board'}
								</span>
								<ArrowRightIcon aria-hidden="true" />
							</button>
							<button
								className="action-button clear-action"
								type="button"
								onClick={clearGrid}
								disabled={isBlank}
							>
								Clear
							</button>
						</div>
					</section>
				</div>
			</div>

			<section className="board" aria-labelledby="board-title">
				<div className="board-heading">
					<h2 id="board-title">Board</h2>
					<a href="/auth/passkeys">Account</a>
				</div>
				{boardLoading ? <p className="board-status">Loading…</p> : null}
				{!boardLoading && board.length === 0 ? (
					<p className="board-status">Nothing here yet. Add the first one.</p>
				) : null}
				<div className="board-grid">
					{board.map(creation => {
						const size = Math.sqrt(creation.grid.length)
						const isPopping = poppingCreation.id === creation.id
						return (
							<a
								key={isPopping ? `${creation.id}-${poppingCreation.nonce}` : creation.id}
								className="board-icon"
								data-popping={isPopping}
								data-selected={creation.grid === serializedGrid}
								href={`/?grid=${creation.grid}`}
								onFocus={() => setGrid(creation.grid.split('').map(Number))}
								onClick={event => {
									if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
									event.preventDefault()
									setGrid(creation.grid.split('').map(Number))
								}}
								title={creation.createdBy ? `Created by ${creation.createdBy}` : `${size}×${size}`}
							>
								<span className="board-preview">
									<svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" shapeRendering="crispEdges">
										<path d={createGridPath(creation.grid)} />
									</svg>
								</span>
								{creation.createdBy ? (
									<span className="board-creator">
										Created by <span className="board-creator-email">{creation.createdBy}</span>
									</span>
								) : null}
								<span className="sr-only">
									Open {size} by {size} creation
								</span>
							</a>
						)
					})}
				</div>
			</section>
		</main>
	)
}
