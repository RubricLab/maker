// Run after bun --bun run build. Uses an isolated database and a stub Jev, never the live board.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { filledCells, jevResponse } from './stubs'

const SHOWN_GRID = '0111001010011100101001110'
const HIDDEN_GRID = '0000001110011100111000000'

const hiddenCells = HIDDEN_GRID.split('1').length - 1
let moderations = 0
// Stands in for Jev: the hidden grid is clearly offensive, the shown one clearly fine.
const moderation = Bun.serve({
	async fetch(request) {
		moderations++
		const cells = filledCells((await request.json()) as { state: { drawing: string[] } })
		return Response.json(jevResponse(cells === hiddenCells ? 0.9 : 0.1))
	},
	hostname: '127.0.0.1',
	port: 0
})
const directory = mkdtempSync(join(tmpdir(), 'maker-board-browser-'))
const reserved = Bun.serve({ fetch: () => new Response(''), hostname: '127.0.0.1', port: 0 })
const port = reserved.port
reserved.stop(true)
const origin = `http://127.0.0.1:${port}`
const app = Bun.spawn({
	cmd: [
		process.execPath,
		'--bun',
		'node_modules/next/dist/bin/next',
		'start',
		'--hostname',
		'127.0.0.1',
		'--port',
		String(port)
	],
	env: {
		...process.env,
		DATABASE_PATH: join(directory, 'board.sqlite'),
		NEXT_TELEMETRY_DISABLED: '1',
		TYPESAFE_API_KEY: 'test',
		TYPESAFE_BASE_URL: `http://127.0.0.1:${moderation.port}`
	},
	stderr: 'inherit',
	stdout: 'ignore'
})
const browser = await chromium.launch({ headless: true })
try {
	let ready = false
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const response = await fetch(origin, { signal: AbortSignal.timeout(1000) })
			if (response.ok) {
				ready = true
				break
			}
		} catch {}
		await Bun.sleep(100)
	}
	assert(ready, 'Next.js did not start')
	const context = await browser.newContext({ viewport: { height: 844, width: 390 } })
	const page = await context.newPage()
	page.setDefaultTimeout(10_000)
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))

	await page.goto(`${origin}/?grid=${SHOWN_GRID}`)
	await page.locator('.mobile-board-action').click()
	await page.locator('.board-icon[data-selected="true"]').waitFor()
	await page.goto(`${origin}/?grid=${HIDDEN_GRID}`)
	await page.locator('.mobile-board-action').click()
	await page.locator('.board-icon[data-selected="true"]').waitFor()
	assert.equal(await page.locator('.board-icon').count(), 2)
	await page.reload()
	assert.equal(await page.locator('.board-icon').count(), 1)
	assert.equal(await page.locator('.board-icon').getAttribute('href'), `/?grid=${SHOWN_GRID}`)
	assert.equal(await page.locator('.board-icon[data-selected="true"]').count(), 0)
	await page.locator('.board-icon').click()
	await page.locator('.board-icon[data-selected="true"]').waitFor()
	await page.waitForURL(`${origin}/?grid=${SHOWN_GRID}`)

	const board = (await (await fetch(`${origin}/api/board`)).json()) as {
		creations: { grid: string }[]
	}
	assert.deepEqual(
		board.creations.map(creation => creation.grid),
		[SHOWN_GRID]
	)
	const duplicate = await context.request.post(`${origin}/api/board`, {
		data: { grid: HIDDEN_GRID }
	})
	assert.equal(duplicate.status(), 200)
	assert.equal(((await duplicate.json()) as { created: boolean }).created, false)
	assert.equal(moderations, 8)

	assert(await page.locator('.mobile-game-actions button').first().isDisabled())
	await page.locator('.mobile-game-actions button').last().click()
	await page.getByRole('dialog', { name: 'Game of Life' }).waitFor()
	assert.equal(await page.locator('.game-cell').count(), 25)
	await page.getByRole('button', { name: 'Pause' }).click()
	await page.getByRole('button', { exact: true, name: 'Play' }).waitFor()
	await page.getByRole('button', { name: 'Close game' }).click()
	for (let i = 0; i < 7; i++) await page.locator('.size-increase').click()
	assert.equal(await page.locator('.pixel-cell').count(), 900)
	await page.locator('.mobile-game-actions button').first().click()
	await page.getByRole('dialog', { name: 'Snake' }).waitFor()
	await page.keyboard.press('ArrowDown')
	await page.getByRole('button', { name: 'Close game' }).click()
	await page.setViewportSize({ height: 1000, width: 1440 })
	await page.screenshot({ fullPage: true, path: join(tmpdir(), 'maker-board-desktop.png') })
	await page.setViewportSize({ height: 844, width: 390 })
	await page.screenshot({ fullPage: true, path: join(tmpdir(), 'maker-board-mobile.png') })
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
	assert.equal(overflow, false)
	assert.deepEqual(errors, [])
	console.log('Anonymous publish, hidden creation, reload, duplicates, and mobile layout: OK')
} finally {
	await browser.close()
	moderation.stop(true)
	app.kill('SIGKILL')
	await app.exited
	rmSync(directory, { force: true, recursive: true })
}
