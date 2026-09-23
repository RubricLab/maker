'use client'

import { Cross1Icon, PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { useEffect, useRef, useState } from 'react'

export type Game = 'snake' | 'life'

export function SnakeIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M2 3h5v3H4v3h8v3H9"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="square"
				strokeLinejoin="round"
			/>
			<circle cx="2" cy="3" r="1" fill="currentColor" />
		</svg>
	)
}

function TrophyIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M4 2h8v4a4 4 0 0 1-8 0V2ZM4 3H2v2a2 2 0 0 0 2 2m8-4h2v2a2 2 0 0 1-2 2M8 10v3m-3 1h6"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

export function nextGeneration(cells: number[], size: number): number[] {
	return cells.map((alive, index) => {
		const x = index % size
		const y = Math.floor(index / size)
		let neighbours = 0
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				if ((!dx && !dy) || x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue
				neighbours += cells[(y + dy) * size + x + dx] ?? 0
			}
		return neighbours === 3 || (alive && neighbours === 2) ? 1 : 0
	})
}

export function expandLifeGrid(initial: number[]): number[] {
	const size = Math.sqrt(initial.length)
	const expandedSize = size * 5
	const offset = size * 2
	const expanded = Array<number>(expandedSize ** 2).fill(0)
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			expanded[(y + offset) * expandedSize + x + offset] = initial[y * size + x] ?? 0
		}
	return expanded
}

const DIRECTIONS: Record<string, [number, number]> = {
	ArrowDown: [0, 1],
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	a: [-1, 0],
	d: [1, 0],
	s: [0, 1],
	w: [0, -1]
}

type SnakeState = {
	body: number[]
	direction: [number, number]
	next: [number, number]
	food: number
	score: number
	ended: boolean
}

function randomFree(occupied: Set<number>, total: number): number {
	const free = Array.from({ length: total }, (_, i) => i).filter(i => !occupied.has(i))
	return free[Math.floor(Math.random() * free.length)] ?? -1
}

export function GameOverlay({
	game,
	initial,
	onClose
}: {
	game: Game
	initial: number[]
	onClose: () => void
}) {
	const size = Math.sqrt(initial.length)
	const lifeSize = size * 5
	const [cells, setCells] = useState(() =>
		game === 'life' ? expandLifeGrid(initial) : [...initial]
	)
	const [playing, setPlaying] = useState(true)
	const [ready, setReady] = useState(game !== 'life')
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const [speed, setSpeed] = useState(45)
	const walls = useRef(new Set(initial.flatMap((cell, index) => (cell ? [index] : []))))
	const snake = useRef<SnakeState | null>(null)
	const [snakeView, setSnakeView] = useState<SnakeState | null>(null)
	const [highScore, setHighScore] = useState<number | null>(null)
	const [newRecord, setNewRecord] = useState(false)
	const touch = useRef<[number, number] | null>(null)

	useEffect(() => {
		if (game !== 'snake') return
		const safeStarts = Array.from({ length: initial.length }, (_, index) => index).filter(
			index => index % size < size - 1 && !walls.current.has(index) && !walls.current.has(index + 1)
		)
		const start = safeStarts[Math.floor(Math.random() * safeStarts.length)] ?? -1
		const state: SnakeState = {
			body: start < 0 ? [] : [start],
			direction: [1, 0],
			ended: start < 0,
			food: -1,
			next: [1, 0],
			score: 0
		}
		state.food = randomFree(new Set([...walls.current, ...state.body]), initial.length)
		snake.current = state
		setSnakeView(state)
	}, [game, initial.length, size])

	useEffect(() => {
		if (game !== 'snake') return
		void fetch('/api/snake')
			.then(response => response.json())
			.then((result: { highScore: number }) =>
				setHighScore(current => Math.max(current ?? 0, result.highScore))
			)
			.catch(() => {})
	}, [game])

	useEffect(() => {
		if (game !== 'snake' || !snakeView?.ended) return
		void fetch('/api/snake', {
			body: JSON.stringify({ score: snakeView.score }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST'
		})
			.then(response => {
				if (!response.ok) throw new Error('Could not save score')
				return response.json() as Promise<{ highScore: number; newRecord: boolean }>
			})
			.then(result => {
				setHighScore(result.highScore)
				setNewRecord(result.newRecord)
			})
			.catch(() => {})
	}, [game, snakeView?.ended, snakeView?.score])

	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
				return
			}
			if (
				event.key === ' ' &&
				event.target instanceof HTMLElement &&
				!/^(INPUT|BUTTON)$/.test(event.target.tagName)
			) {
				event.preventDefault()
				setPlaying(value => !value)
			}
			if (game !== 'snake') return
			const direction = DIRECTIONS[event.key]
			if (!direction) return
			event.preventDefault()
			const state = snake.current
			if (state && (direction[0] !== -state.direction[0] || direction[1] !== -state.direction[1]))
				state.next = direction
		}
		window.addEventListener('keydown', key)
		return () => window.removeEventListener('keydown', key)
	}, [game, onClose])

	useEffect(() => {
		if (game !== 'life') return
		const timer = setTimeout(() => setReady(true), 2000)
		return () => clearTimeout(timer)
	}, [game])

	useEffect(() => {
		if (game !== 'life') return
		const canvas = canvasRef.current
		const context = canvas?.getContext('2d')
		if (!canvas || !context) return
		context.clearRect(0, 0, lifeSize, lifeSize)
		context.fillStyle = getComputedStyle(canvas).color
		for (let index = 0; index < cells.length; index++) {
			if (cells[index]) context.fillRect(index % lifeSize, Math.floor(index / lifeSize), 1, 1)
		}
	}, [cells, game, lifeSize])

	useEffect(() => {
		if (!playing || !ready) return
		// A linear slider maps to an exponential interval, from 1000ms down to 40ms.
		const delay = game === 'snake' ? 185 : 1000 * 0.04 ** (speed / 100)
		const timer = setInterval(() => {
			if (game === 'life') {
				setCells(previous => nextGeneration(previous, lifeSize))
				return
			}
			const state = snake.current
			if (!state || state.ended || !state.body.length) return
			const [dx, dy] = state.next
			const head = state.body[0] ?? 0
			const x = (head % size) + dx
			const y = Math.floor(head / size) + dy
			const next = y * size + x
			const eats = next === state.food
			if (
				x < 0 ||
				x >= size ||
				y < 0 ||
				y >= size ||
				walls.current.has(next) ||
				state.body.slice(0, eats ? undefined : -1).includes(next)
			) {
				const ended = { ...state, ended: true }
				snake.current = ended
				setSnakeView(ended)
				return
			}
			const body = [next, ...state.body.slice(0, eats ? undefined : -1)]
			const food = eats ? randomFree(new Set([...walls.current, ...body]), initial.length) : state.food
			const updated = {
				body,
				direction: state.next,
				ended: food < 0,
				food,
				next: state.next,
				score: state.score + Number(eats)
			}
			snake.current = updated
			setSnakeView(updated)
		}, delay)
		return () => clearInterval(timer)
	}, [game, initial.length, lifeSize, playing, ready, size, speed])

	useEffect(() => {
		if (game !== 'life') return
		const before = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = before
		}
	}, [game])

	return (
		<div
			className={game === 'life' ? 'game-overlay' : 'snake-inline'}
			role="dialog"
			aria-modal={game === 'life'}
			aria-label={game === 'life' ? 'Game of Life' : 'Snake'}
		>
			<div className="game-controls">
				{game === 'snake' && (
					<span className="game-score">
						Score {snakeView?.score ?? 0}
						{snakeView?.ended && (
							<>
								{' '}
								· Game over · Best {highScore ?? '…'} {newRecord && <TrophyIcon />}
							</>
						)}
					</span>
				)}
				{game === 'life' && (
					<label className="game-speed">
						Speed{' '}
						<input
							type="range"
							min="0"
							max="100"
							value={speed}
							onChange={event => setSpeed(Number(event.target.value))}
							aria-label="Game speed"
						/>
					</label>
				)}
				<button
					type="button"
					onClick={() => setPlaying(value => !value)}
					aria-label={playing ? 'Pause' : 'Play'}
				>
					{playing ? <PauseIcon /> : <PlayIcon />}
				</button>
				<button type="button" onClick={onClose} aria-label="Close game">
					<Cross1Icon />
				</button>
			</div>
			{game === 'life' ? (
				<canvas
					ref={canvasRef}
					className="game-grid game-life"
					width={lifeSize}
					height={lifeSize}
					aria-label="Game of Life canvas"
				/>
			) : (
				<div
					className="game-grid"
					style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
					onTouchStart={event => {
						const point = event.touches[0]
						if (point) touch.current = [point.clientX, point.clientY]
					}}
					onTouchEnd={event => {
						const point = event.changedTouches[0]
						if (game !== 'snake' || !touch.current || !point) return
						const dx = point.clientX - touch.current[0]
						const dy = point.clientY - touch.current[1]
						if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
						const direction: [number, number] =
							Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]
						const state = snake.current
						if (state && (direction[0] !== -state.direction[0] || direction[1] !== -state.direction[1]))
							state.next = direction
						touch.current = null
					}}
				>
					{cells.map((_, index) => (
						<span
							key={index}
							className="game-cell"
							data-active={walls.current.has(index) || !!snakeView?.body.includes(index)}
							data-food={snakeView?.food === index}
							data-head={snakeView?.body[0] === index}
						/>
					))}
				</div>
			)}
		</div>
	)
}
