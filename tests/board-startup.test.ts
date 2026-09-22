import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('concurrent workers initialize a fresh board database', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'maker-startup-'))
	const modulePath = new URL('../src/lib/board.ts', import.meta.url).pathname
	try {
		for (let round = 0; round < 3; round++) {
			const workers = Array.from({ length: 8 }, () =>
				Bun.spawn({
					cmd: [process.execPath, '-e', `import ${JSON.stringify(modulePath)}`],
					env: { ...process.env, DATABASE_PATH: join(directory, `${round}.sqlite`) },
					stderr: 'inherit',
					stdout: 'ignore'
				})
			)
			const exits = await Promise.all(workers.map(worker => worker.exited))
			expect(exits.every(code => code === 0)).toBe(true)
		}
	} finally {
		rmSync(directory, { force: true, recursive: true })
	}
}, 20_000)
