import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createAuthHandler } from '../src/auth'
import { AuthStore } from '../src/passkeys'

test('email → register passkey → sign out → passkey sign-in, with real WebAuthn verification', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'maker-browser-'))
	const databasePath = join(directory, 'auth.sqlite')
	const emails: string[] = []
	const upstream = Bun.serve({
		fetch: () => new Response('<h1>Private Maker</h1>', { headers: { 'Content-Type': 'text/html' } }),
		hostname: '127.0.0.1',
		port: 0
	})
	let handler: ReturnType<typeof createAuthHandler>
	const server = Bun.serve({ fetch: request => handler(request), hostname: '127.0.0.1', port: 0 })
	const origin = `http://localhost:${server.port}`
	const options = {
		databasePath,
		publicOrigin: origin,
		async sendLink(_email: string, url: string) {
			emails.push(url)
		},
		upstreamOrigin: `http://127.0.0.1:${upstream.port}`
	}
	handler = createAuthHandler(options)
	const store = new AuthStore(databasePath, origin)
	const browser = await chromium.launch({ headless: true })
	try {
		const context = await browser.newContext({ viewport: { height: 844, width: 390 } })
		const page = await context.newPage()
		page.setDefaultTimeout(10_000)
		const errors: string[] = []
		page.on('pageerror', error => errors.push(error.message))
		const cdp = await context.newCDPSession(page)
		await cdp.send('WebAuthn.enable')
		await cdp.send('WebAuthn.addVirtualAuthenticator', {
			options: {
				automaticPresenceSimulation: true,
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true,
				protocol: 'ctap2',
				transport: 'internal'
			}
		})
		await page.goto(origin + '/login')
		await page.screenshot({ path: join(tmpdir(), 'maker-login.png') })
		await page.getByLabel('Email', { exact: true }).fill('alice@example.com')
		await page.getByRole('button', { name: 'Send sign-in link' }).click()
		await page.getByRole('status').waitFor()
		expect(emails).toHaveLength(1)
		await page.goto(emails[0]!)
		await page.getByRole('button', { exact: true, name: 'Sign in to Maker' }).click()
		await page.waitForURL(origin + '/auth/passkeys')
		await page.getByRole('button', { exact: true, name: 'Register passkey' }).click()
		await page.getByText('Passkey registered. You can use it next time you sign in.').waitFor()
		expect(store.db.query('SELECT * FROM passkeys').all()).toHaveLength(1)
		await page.screenshot({ path: join(tmpdir(), 'maker-passkey.png') })
		await page.getByRole('button', { exact: true, name: 'Sign out' }).click()
		await page.waitForURL(origin + '/login')
		// Recreate the handler to verify persistence, rather than relying on memory.
		handler = createAuthHandler(options)
		let verification: { body: string; cookie: string } | undefined
		await page.route('**/auth/passkey/login/verify', async route => {
			const headers = await route.request().allHeaders()
			verification = { body: route.request().postData()!, cookie: headers.cookie! }
			await route.continue()
		})
		await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
		await page.waitForURL(origin + '/')
		await page.getByRole('heading', { name: 'Private Maker' }).waitFor()
		expect(verification).toBeDefined()
		const replay = await handler(
			new Request(origin + '/auth/passkey/login/verify', {
				body: verification!.body,
				headers: { 'Content-Type': 'application/json', Cookie: verification!.cookie, Origin: origin },
				method: 'POST'
			})
		)
		expect(replay.status).toBe(400)
		await page.goto(origin + '/auth/passkeys')
		await page.getByText('Signed in as alice@example.com').waitFor()
		await page.getByRole('button', { exact: true, name: 'Sign out' }).click()
		await page.waitForURL(origin + '/login')
		// Corrupt the signed assertion, which must never create a session.
		await page.unroute('**/auth/passkey/login/verify')
		await page.route('**/auth/passkey/login/verify', async route => {
			const body = route.request().postDataJSON()
			body.response.signature = 'AAAA'
			await route.continue({ postData: JSON.stringify(body) })
		})
		await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
		await page.getByText('Passkey could not be verified. Try again or sign in by email.').waitFor()
		expect(page.url()).toBe(origin + '/login')
		expect(errors).toEqual([])
	} finally {
		await browser.close()
		server.stop(true)
		upstream.stop(true)
		store.db.close()
		rmSync(directory, { force: true, recursive: true })
	}
}, 60_000)
