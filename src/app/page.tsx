import type { Metadata } from 'next/types'
import { Suspense } from 'react'
import { findCreation } from '~/lib/board'
import { RUBRIC_BINARY } from '~/lib/constants'
import { GridImageCreator } from './maker'

type Props = { searchParams: Promise<{ grid?: string }> }

const createRandomGrid = (): string =>
	Array.from({ length: 25 }, () => (Math.random() < 0.5 ? '0' : '1')).join('')

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
	const initialCreation = findCreation(initialGrid)

	return (
		<Suspense fallback={<div className="maker">Loading…</div>}>
			<GridImageCreator initialCreation={initialCreation} initialGrid={initialGrid} />
		</Suspense>
	)
}
