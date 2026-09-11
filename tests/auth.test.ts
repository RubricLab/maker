import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthHandler } from '../src/auth'
import { AuthStore } from '../src/passkeys'

const origin = 'https://maker.rubric.sh'
const cleanups: (() => void)[] = []
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
})

function fixture(sendFails = false, upstreamOrigin = 'http://127.0.0.1:1') {
	const directory = mkdtempSync(join(tmpdir(), 'maker-auth-'))
	const databasePath = join(directory, 'auth.sqlite')
	const emails: { email: string; url: string }[] = []
	const handler = createAuthHandler({
		databasePath,
		publicOrigin: origin,
		async sendLink(email, url) {
			if (sendFails) throw new Error('offline')
			emails.push({ email, url })
		},
		upstreamOrigin
	})
	const store = new AuthStore(databasePath, origin)
	cleanups.push(() => {
		store.db.close()
		rmSync(directory, { force: true, recursive: true })
	})
	const request = (
		path: string,
		body?: Record<string, string>,
		cookie = '',
		requestOrigin = origin,
		ip = '127.0.0.1'
	) =>
		handler(
			new Request(origin + path, {
				body: body ? new URLSearchParams(body) : null,
				headers: { Cookie: cookie, Origin: requestOrigin, 'X-Real-IP': ip },
				method: body ? 'POST' : 'GET'
			})
		)
	return { emails, handler, request, store }
}

const sessionCookie = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!

test('email signup normalizes users, waits for POST, and rejects link reuse', async () => {
	const { request, emails, store } = fixture()
	const sent = await request('/login', { email: ' New@Example.com ' })
	expect(sent.status).toBe(200)
	expect(emails[0]!.email).toBe('new@example.com')
	expect(store.db.query('SELECT * FROM users').all()).toHaveLength(0)
	const url = new URL(emails[0]!.url)
	const token = url.searchParams.get('token')!
	const scan = await request(url.pathname + url.search)
	expect(scan.status).toBe(200)
	expect(scan.headers.get('referrer-policy')).toBe('strict-origin')
	expect(scan.headers.get('set-cookie')).toBeNull()
	const login = await request('/login/verify', { token })
	expect(login.status).toBe(303)
	expect(login.headers.get('location')).toBe('/')
	expect(login.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict')
	const account = await request('/auth/passkeys', undefined, sessionCookie(login))
	const html = await account.text()
	expect(html).toContain('new@example.com')
	const replay = await request('/login/verify', { token })
	expect(replay.status).toBe(400)
	const again = await request('/login', { email: 'new@example.com' })
	expect(again.status).toBe(200)
	const nextToken = new URL(emails[1]!.url).searchParams.get('token')!
	await request('/login/verify', { token: nextToken })
	expect(store.db.query('SELECT * FROM users').all()).toHaveLength(1)
})

test('protects private routes, rejects forged/old password sessions and cross-origin writes', async () => {
	const { request } = fixture()
	for (const path of ['/', '/api/board', '/_next/static/app.js', '/auth/passkeys']) {
		const response = await request(path, undefined, 'maker_session=old; __Host-maker_session=forged')
		expect(response.status).toBe(303)
	}
	const anonymousRegistration = await request('/auth/passkey/register/options', {})
	expect(anonymousRegistration.status).toBe(401)
	for (const path of [
		'/login',
		'/login/verify',
		'/auth/logout',
		'/auth/passkey/login/options',
		'/api/board'
	]) {
		const response = await request(path, {}, '', 'https://evil.example')
		expect(response.status).toBe(403)
	}
	const password = await request('/login', { password: 'previous-password' })
	expect(password.status).toBe(400)
})

test('expires links and sessions; logout revokes server-side sessions', async () => {
	const { request, store } = fixture()
	const expired = store.createLink('expired@example.com')
	store.db.exec('UPDATE links SET expires = 0')
	const response = await request('/login/verify', { token: expired })
	expect(response.status).toBe(400)
	const token = store.createLink('user@example.com')
	const login = await request('/login/verify', { token })
	const cookie = sessionCookie(login)
	const logout = await request('/auth/logout', {}, cookie)
	expect(logout.status).toBe(303)
	const revoked = await request('/auth/passkeys', undefined, cookie)
	expect(revoked.status).toBe(303)
	const user = store.db.query<{ id: string }, []>('SELECT id FROM users').get()!
	const session = store.createSession(user.id)
	store.db.exec('UPDATE sessions SET expires = 0')
	expect(store.readSession(session)).toBeNull()
})

test('challenges are expiring, single-use, purpose- and session-bound', () => {
	const { store } = fixture()
	const challenge = store.mint('challenge', 'register', 'session-a')
	expect(() => store.consume(challenge, 'register', 'session-b')).toThrow()
	expect(() => store.consume(challenge, 'register', 'session-a')).toThrow()
	const other = store.mint('challenge', 'register', 'session-a')
	expect(() => store.consume(other, 'login', '')).toThrow()
	expect(store.consume(other, 'register', 'session-a')).toBe('challenge')
	expect(() => store.consume(other, 'register', 'session-a')).toThrow()
	const expired = store.mint('challenge', 'login', '')
	store.db.exec('UPDATE challenges SET expires = 0')
	expect(() => store.consume(expired, 'login', '')).toThrow()
})

test('rate limits email by recipient and trusted IP, and persists limits', async () => {
	const { request, emails, store } = fixture()
	for (let index = 0; index < 4; index++) {
		const response = await request('/login', { email: 'user@example.com' }, '', origin, `ip-${index}`)
		expect(response.status).toBe(200)
	}
	expect(emails).toHaveLength(3)
	for (let index = 0; index < 5; index++)
		await request('/login', { email: `user${index}@example.com` })
	const limited = await request('/login', { email: 'last@example.com' })
	expect(limited.status).toBe(429)
	expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
	expect(store.limit('persisted', 1, 60_000)).toBe(0)
	const reopened = new AuthStore(store.db.filename, origin)
	expect(reopened.limit('persisted', 1, 60_000)).toBeGreaterThan(0)
	reopened.db.close()
})

test('failed email delivery invalidates minted link without creating a user', async () => {
	const { request, store } = fixture(true)
	const response = await request('/login', { email: 'user@example.com' })
	expect(response.status).toBe(502)
	expect(store.db.query('SELECT * FROM links').all()).toHaveLength(0)
	expect(store.db.query('SELECT * FROM users').all()).toHaveLength(0)
})

test('credentials and sessions belong to each verified user', async () => {
	const { store } = fixture()
	const alice = store.consumeLink(store.createLink('alice@example.com'))!
	const bob = store.consumeLink(store.createLink('bob@example.com'))!
	const aliceSession = store.createSession(alice.id)
	const bobSession = store.createSession(bob.id)
	store.db.query('INSERT INTO passkeys VALUES (?, ?, ?, ?)').run('alice-key', 'public', 0, alice.id)
	const aliceOptions = await store.registrationOptions(aliceSession)
	const bobOptions = await store.registrationOptions(bobSession)
	expect(aliceOptions.options.user.name).toBe('alice@example.com')
	expect(bobOptions.options.user.name).toBe('bob@example.com')
	expect(aliceOptions.options.user.id).not.toBe(bobOptions.options.user.id)
	expect(aliceOptions.options.excludeCredentials).toHaveLength(1)
	expect(bobOptions.options.excludeCredentials).toHaveLength(0)
})

test('proxy replaces forged publisher headers with the signed-in email', async () => {
	const upstream = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: request => Response.json({ email: request.headers.get('x-maker-user-email') })
	})
	try {
		const { store, handler } = fixture(false, `http://127.0.0.1:${upstream.port}`)
		for (const email of ['alice@example.com', 'bob@example.com']) {
			const user = store.consumeLink(store.createLink(email))!
			const session = store.createSession(user.id)
			const response = await handler(
				new Request(origin + '/api/board', {
					headers: {
						Cookie: `__Host-maker_session=${session}`,
						'x-maker-user-email': 'forged@example.com'
					}
				})
			)
			const result = await response.json()
			expect(result.email).toBe(email)
		}
	} finally {
		upstream.stop(true)
	}
})
