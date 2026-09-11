// Run after bun --bun run build. Uses isolated databases, never the live board.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, chromium } from 'playwright'
import { createAuthHandler } from '../src/auth'

const directory = mkdtempSync(join(tmpdir(), 'maker-board-browser-'))
const reserved = Bun.serve({ fetch: () => new Response(''), hostname: '127.0.0.1', port: 0 })
const port = reserved.port
reserved.stop(true)
const upstreamOrigin = `http://127.0.0.1:${port}`
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
		NEXT_TELEMETRY_DISABLED: '1'
	},
	stderr: 'inherit',
	stdout: 'ignore'
})
let handler: ReturnType<typeof createAuthHandler>
const server = Bun.serve({ fetch: request => handler(request), hostname: '127.0.0.1', port: 0 })
const origin = `http://localhost:${server.port}`
const links = new Map<string, string>()
handler = createAuthHandler({
	databasePath: join(directory, 'auth.sqlite'),
	publicOrigin: origin,
	async sendLink(email, url) {
		links.set(email, url)
	},
	upstreamOrigin
})
const browser = await chromium.launch({ headless: true })
try {
	let ready = false
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const response = await fetch(upstreamOrigin, { signal: AbortSignal.timeout(1000) })
			if (response.ok) {
				ready = true
				break
			}
		} catch {}
		await Bun.sleep(100)
	}
	assert(ready, 'Next.js did not start')
	async function signIn(context: BrowserContext, email: string) {
		const page = await context.newPage()
		page.setDefaultTimeout(10_000)
		await page.goto(`${origin}/login`)
		await page.getByLabel('Email', { exact: true }).fill(email)
		await page.getByRole('button', { name: 'Send sign-in link' }).click()
		await page.getByRole('status').waitFor()
		await page.goto(links.get(email)!)
		await page.getByRole('button', { name: 'Sign in to Maker' }).click()
		await page.waitForURL(`${origin}/`)
		return page
	}
	const context = await browser.newContext({ viewport: { height: 844, width: 390 } })
	const page = await signIn(context, 'alice@example.com')
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	const grid = '101010101'
	await page.goto(`${origin}/?grid=${grid}`)
	await page.locator('.mobile-board-action').click()
	await page.locator('.board-creator', { hasText: 'Created by alice@example.com' }).waitFor()
	await page.locator('.canvas-creator', { hasText: 'Created by alice@example.com' }).waitFor()
	const pillSize = await page
		.locator('.board-creator')
		.evaluate(element => getComputedStyle(element).fontSize)
	const headingSize = await page
		.locator('.canvas-creator')
		.evaluate(element => getComputedStyle(element).fontSize)
	assert.equal(pillSize, '12px')
	assert.equal(headingSize, '16px')
	await page.getByRole('button', { exact: true, name: 'Clear' }).click()
	assert.equal(await page.locator('.canvas-creator').count(), 0)
	await page.locator('.board-icon').focus()
	await page.locator('.canvas-creator', { hasText: 'Created by alice@example.com' }).waitFor()
	await page.reload()
	await page.locator('.canvas-creator', { hasText: 'Created by alice@example.com' }).waitFor()

	const bobContext = await browser.newContext()
	await signIn(bobContext, 'bob@example.com')
	const bobGrid = '111101111'
	const published = await bobContext.request.post(`${origin}/api/board`, {
		data: { createdBy: 'forged@example.com', grid: bobGrid },
		headers: { Origin: origin, 'x-maker-user-email': 'forged@example.com' }
	})
	const payload = await published.json()
	assert.equal(payload.creation.createdBy, 'bob@example.com')
	const duplicate = await bobContext.request.post(`${origin}/api/board`, {
		data: { grid },
		headers: { Origin: origin }
	})
	const duplicatePayload = await duplicate.json()
	assert.equal(duplicatePayload.creation.createdBy, 'alice@example.com')
	await page.reload()
	const bobIcon = page.locator('.board-icon', { hasText: 'Created by bob@example.com' })
	await bobIcon.click()
	await page.locator('.canvas-creator', { hasText: 'Created by bob@example.com' }).waitFor()
	await page.setViewportSize({ height: 1000, width: 1440 })
	await page.screenshot({ fullPage: true, path: join(tmpdir(), 'maker-attribution-desktop.png') })
	await page.setViewportSize({ height: 844, width: 390 })
	await page.screenshot({ fullPage: true, path: join(tmpdir(), 'maker-attribution-mobile.png') })
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
	assert.equal(overflow, false)
	assert.deepEqual(errors, [])
	console.log(
		'Email redirect, publish credit, spoof protection, duplicates, click/focus, reload, and mobile layout: OK'
	)
} finally {
	await browser.close()
	server.stop(true)
	app.kill('SIGKILL')
	await app.exited
	rmSync(directory, { force: true, recursive: true })
}
