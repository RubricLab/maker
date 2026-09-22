import type { Metadata } from 'next/types'
import { listCreations } from '~/lib/board'
import { RUBRIC_BINARY } from '~/lib/constants'
import { GridImageCreator } from './maker'

type Props = { searchParams: Promise<{ grid?: string }> }

const createRandomGrid = (): string => {
	const size = 5
	return Array.from({ length: size ** 2 }, (_, index) => {
		const row = Math.floor(index / size)
		const column = index % size
		if (row === 0 || column === 0 || row === size - 1 || column === size - 1) return '0'
		return Math.random() < 0.5 ? '0' : '1'
	}).join('')
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const searchParams = await props.searchParams
	const { grid = RUBRIC_BINARY } = searchParams

	const title = 'Maker by Rubric'

	return {
		openGraph: {
			images: [`/api/og?grid=${encodeURIComponent(grid)}`],
			title
		},
		title,
		twitter: {
			card: 'summary_large_image',
			images: [`/api/og?grid=${encodeURIComponent(grid)}`],
			title
		}
	}
}

export default async function Page(props: Props) {
	const searchParams = await props.searchParams
	const initialGrid = searchParams.grid?.match(/^[01]+$/) ? searchParams.grid : createRandomGrid()

	return <GridImageCreator initialBoard={listCreations()} initialGrid={initialGrid} />
}
