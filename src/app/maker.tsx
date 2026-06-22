'use client'

import { Button, Checkbox, Container, Input, Label } from '@rubriclab/ui'
import { createParser, parseAsBoolean, useQueryState } from 'nuqs'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDarkMode } from '~/hooks/useDarkMode'
import { RUBRIC_BINARY } from '~/lib/constants'
import { cn } from '~/lib/utils'

const GRID_RESOLUTION = 99
const GRID_VALUES = [0, 1] as const
const MAX_GRID_SIZE = 24
const OVERRIDE_THRESHOLD = 3

const parseAsBooleanString = createParser({
	parse: (queryValue: string) => {
		const chars = queryValue.split('')
		const valid = chars.every(char => char in GRID_VALUES)
		if (!valid) return null
		return chars.map(char => Number(char))
	},
	serialize: value => value.join('')
})

export const GridImageCreator: FC = () => {
	const [showBorders, setShowBorders] = useQueryState('borders', parseAsBoolean.withDefault(true))
	const [grid, setGrid] = useQueryState(
		'grid',
		parseAsBooleanString.withDefault(RUBRIC_BINARY.split('').map(c => Number(c)))
	)

	const [isDrawing, setIsDrawing] = useState(false)
	const [drawMode, setDrawMode] = useState<boolean | null>(null)
	const [overrideAttempts, setOverrideAttempts] = useState(0)

	const darkMode = useDarkMode()
	const gridSize = useMemo(() => Math.sqrt(grid?.length), [grid])
	const lastToggledCellRef = useRef<number | null>(null)
	const gridRef = useRef<HTMLDivElement>(null)

	const handleSizeChange = (newSize: string): void => {
		if (!newSize || Number.isNaN(Number(newSize))) return
		if (Number(newSize) > MAX_GRID_SIZE) {
			setOverrideAttempts(prev => prev + 1)
			if (overrideAttempts < OVERRIDE_THRESHOLD) {
				toast.error(`Grid size cannot be greater than ${MAX_GRID_SIZE}`)
				return
			}
			toast.warning(`Entering crash territory: grid size ${newSize}`)
		}
		const newGrid = Array(Number(newSize) ** 2).fill(0)
		setGrid(newGrid)
		setOverrideAttempts(0)
	}

	const handleCellChange = useCallback(
		(index: number): void => {
			if (lastToggledCellRef.current !== index) {
				setGrid(prevGrid => {
					const newGrid = [...prevGrid]
					newGrid[index] = drawMode ? Number(drawMode) : Number(!newGrid[index])
					return newGrid
				})
				lastToggledCellRef.current = index
			}
		},
		[drawMode, setGrid]
	)

	const handlePointerDown = (index: number) => {
		setIsDrawing(true)
		setDrawMode(true)
		handleCellChange(index)
	}

	const handlePointerUp = () => {
		setIsDrawing(false)
		setDrawMode(null)
		lastToggledCellRef.current = null
	}

	const handlePointerMove = (index: number) => {
		if (isDrawing) handleCellChange(index)
	}

	useEffect(() => {
		const handleGlobalPointerUp = () => {
			setIsDrawing(false)
			setDrawMode(null)
			lastToggledCellRef.current = null
		}
		window.addEventListener('pointerup', handleGlobalPointerUp)
		return () => window.removeEventListener('pointerup', handleGlobalPointerUp)
	}, [])

	const generateSVG = useCallback(() => {
		const cellSize = GRID_RESOLUTION / gridSize
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
						}" height="${cellSize}" fill="${darkMode ? 'white' : 'black'}" />`
					)
					startX = null
					width = 0
				}
			}
		}

		const rectStr = rects.join('')

		return `<svg xmlns="https://www.w3.org/2000/svg" viewBox="0 0 ${GRID_RESOLUTION} ${GRID_RESOLUTION}">${rectStr}</svg>`
	}, [gridSize, grid, darkMode])

	const copyAsSVG = () => {
		navigator.clipboard.writeText(generateSVG())
		toast.success('SVG copied to clipboard')
	}

	const copyAsJSON = () => {
		const jsonData = JSON.stringify({ grid, size: gridSize })
		navigator.clipboard.writeText(jsonData)
		toast.success('JSON copied to clipboard')
	}

	const gridToPngBlob = useCallback(
		async (size = 400): Promise<Blob> => {
			const canvas = document.createElement('canvas')
			canvas.width = size
			canvas.height = size
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('Failed to get canvas context')

			const cellSize = size / gridSize
			const fillColor = darkMode ? '#ffffff' : '#000000'

			for (let y = 0; y < gridSize; y++) {
				for (let x = 0; x < gridSize; x++) {
					const index = y * gridSize + x
					if (grid[index]) {
						ctx.fillStyle = fillColor
						ctx.fillRect(
							Math.floor(x * cellSize),
							Math.floor(y * cellSize),
							Math.ceil(cellSize),
							Math.ceil(cellSize)
						)
					}
				}
			}

			return new Promise((resolve, reject) => {
				canvas.toBlob(
					blob => {
						if (blob) resolve(blob)
						else reject(new Error('Failed to create PNG blob'))
					},
					'image/png',
					1.0
				)
			})
		},
		[gridSize, grid, darkMode]
	)

	const copyAsPNG = useCallback(async () => {
		try {
			const blob = await gridToPngBlob()
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
			toast.success('PNG copied to clipboard')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to copy PNG to clipboard')
		}
	}, [gridToPngBlob])

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isCopyShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c'
			if (!isCopyShortcut) return
			const target = e.target as HTMLElement | null
			if (target && /^(input|textarea|select)$/i.test(target.tagName)) return
			e.preventDefault()
			void copyAsPNG()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [copyAsPNG])

	const downloadAsPNG = async () => {
		try {
			const blob = await gridToPngBlob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `grid-${gridSize}x${gridSize}.png`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			toast.success('PNG downloaded')
		} catch (error) {
			console.error({ error })
			toast.error('Failed to download PNG')
		}
	}

	const clearGrid = () => {
		setGrid(Array(gridSize * gridSize).fill(0))
		toast.success('Grid cleared')
	}

	return (
		<div className="mx-auto flex h-full w-fit flex-col items-start justify-center gap-4">
			<Container arrangement="row" align="center" gap="sm">
				<Label htmlFor="grid-size" className="shrink-0">
					Grid size
				</Label>
				<Input
					type="number"
					id="grid-size"
					value={Math.sqrt(grid.length)}
					onChange={e => {
						const val = e.target.value
						handleSizeChange(val)
					}}
				/>
			</Container>
			<Container arrangement="row" align="center">
				<Checkbox id="show-borders" value={showBorders} onChange={setShowBorders} />
				<Label htmlFor="show-borders">Show grid borders</Label>
			</Container>
			<div
				ref={gridRef}
				className={cn('grid w-full md:w-[400px]', {
					'border border-border': showBorders
				})}
				style={{
					aspectRatio: '1 / 1',
					gridTemplateColumns: `repeat(${gridSize}, 1fr)`
				}}
			>
				{grid.map((cell, index) => (
					<div
						key={index}
						className={cn('h-full cursor-pointer', cell ? 'bg-foreground' : 'bg-background', {
							'border border-border': showBorders
						})}
						onPointerDown={() => handlePointerDown(index)}
						onPointerMove={() => handlePointerMove(index)}
						onPointerUp={handlePointerUp}
					/>
				))}
			</div>
			<Container arrangement="row" gap="sm" className="flex-wrap">
				<Button label="Copy SVG" variant="primary" onClick={copyAsSVG} />
				<Button label="Copy PNG  ⌘C" variant="primary" onClick={copyAsPNG} />
				<Button label="Download PNG" variant="secondary" onClick={downloadAsPNG} />
				<Button label="Copy JSON" variant="secondary" onClick={copyAsJSON} />
				<div className="grow" />
				<Button label="Clear" variant="destructive" onClick={clearGrid} />
			</Container>
		</div>
	)
}
