import '../index.css'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from 'sonner'

export const metadata = {
	description: 'Draw NxN pixel graphics.',
	metadataBase: new URL('https://maker.rubric.sh'),
	title: 'Maker'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<NuqsAdapter>{children}</NuqsAdapter>
				<Toaster />
			</body>
		</html>
	)
}
