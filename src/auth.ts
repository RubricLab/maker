import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { accountPage, loginPage, verifyPage } from './auth-pages'
import { AuthStore, SESSION_MAX_AGE } from './passkeys'

const COOKIE_NAME = '__Host-maker_session'
const CEREMONY_COOKIE = '__Host-maker_ceremony'
const WINDOW_MS = 15 * 60 * 1000

type AuthOptions = {
	upstreamOrigin: string
	publicOrigin?: string
	databasePath: string
	sendLink: (email: string, url: string) => Promise<void>
}

const cookie = (name: string, value: string, maxAge: number) =>
	`${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
const readCookie = (request: Request, name: string) =>
	(request.headers.get('cookie') ?? '')
		.split(';')
		.map(part => part.trim().split('='))
		.find(([key]) => key === name)?.[1] ?? ''
const privateHeaders = {
	'Cache-Control': 'no-store',
	'Referrer-Policy': 'strict-origin',
	'X-Content-Type-Options': 'nosniff'
}
const htmlResponse = (body: string, status = 200, headers?: HeadersInit): Response =>
	new Response(body, {
		headers: {
			...privateHeaders,
			'Content-Security-Policy':
				"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
			'Content-Type': 'text/html; charset=utf-8',
			...headers
		},
		status
	})
const jsonResponse = (body: object, status = 200, headers?: HeadersInit) =>
	Response.json(body, { headers: { ...privateHeaders, ...headers }, status })

export const createAuthHandler = ({
	upstreamOrigin,
	publicOrigin = 'https://maker.rubric.sh',
	databasePath,
	sendLink
}: AuthOptions) => {
	const store = new AuthStore(databasePath, publicOrigin)
	const signIn = (userId: string) => {
		const session = store.createSession(userId)
		return new Response(null, {
			headers: {
				...privateHeaders,
				Location: '/auth/passkeys',
				'Set-Cookie': cookie(COOKIE_NAME, session, SESSION_MAX_AGE)
			},
			status: 303
		})
	}
	const proxy = async (request: Request): Promise<Response> => {
		const incomingUrl = new URL(request.url)
		const upstreamUrl = new URL(upstreamOrigin)
		upstreamUrl.pathname = incomingUrl.pathname
		upstreamUrl.search = incomingUrl.search
		const headers = new Headers(request.headers)
		headers.delete('host')
		headers.delete('cookie')
		headers.set('accept-encoding', 'identity')
		headers.set('x-forwarded-host', new URL(store.origin).host)
		headers.set('x-forwarded-proto', new URL(store.origin).protocol.slice(0, -1))
		// Caddy overwrites X-Real-IP. Do not pass user-supplied forwarding chains upstream.
		headers.set('x-forwarded-for', request.headers.get('x-real-ip') ?? 'unknown')
		const upstreamResponse = await fetch(upstreamUrl, {
			body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
			headers,
			method: request.method,
			redirect: 'manual'
		})
		const responseHeaders = new Headers(upstreamResponse.headers)
		for (const [key, value] of Object.entries(privateHeaders)) responseHeaders.set(key, value)
		return new Response(upstreamResponse.body, {
			headers: responseHeaders,
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText
		})
	}

	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url)
		const path = url.pathname
		const session = readCookie(request, COOKIE_NAME)
		const user = store.readSession(session)
		const ip = request.headers.get('x-real-ip') ?? 'unknown'
		if (path === '/health') return new Response('ok', { headers: privateHeaders })
		if (path === '/auth/browser.js' && request.method === 'GET') {
			return new Response(Bun.file(new URL('./auth-browser.js', import.meta.url)), {
				headers: {
					...privateHeaders,
					'Content-Type': 'text/javascript; charset=utf-8'
				}
			})
		}
		if (
			!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
			request.headers.get('origin') !== store.origin
		) {
			return jsonResponse({ error: 'Invalid origin.' }, 403)
		}
		if (path === '/login' && request.method === 'GET') {
			if (user) return Response.redirect(new URL('/', store.origin), 303)
			return htmlResponse(loginPage())
		}
		if (path === '/auth/passkeys' && request.method === 'GET') {
			if (!user) return Response.redirect(new URL('/login', store.origin), 303)
			return htmlResponse(accountPage(user.email))
		}
		if (path === '/auth/logout' && request.method === 'POST') {
			store.deleteSession(session)
			return new Response(null, {
				headers: {
					...privateHeaders,
					Location: '/login',
					'Set-Cookie': cookie(COOKIE_NAME, '', 0)
				},
				status: 303
			})
		}
		if (path === '/login' && request.method === 'POST') {
			const retry =
				store.limit('email:global', 100, 60 * 60 * 1000) || store.limit(`email:ip:${ip}`, 5, WINDOW_MS)
			if (retry)
				return htmlResponse(loginPage('Too many requests. Try again later.'), 429, {
					'Retry-After': String(retry)
				})
			let email: string
			try {
				const form = await request.formData()
				const value = form.get('email')
				if (typeof value !== 'string') throw new Error('Invalid email')
				email = value.trim().toLowerCase()
				if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
					throw new Error('Invalid email')
			} catch {
				return htmlResponse(loginPage('Enter a valid email address.'), 400)
			}
			const emailRetry = store.limit(`email:address:${email}`, 3, WINDOW_MS)
			// Give the same response for throttled recipients to avoid email enumeration.
			if (emailRetry) return htmlResponse(loginPage('', true))
			const token = store.createLink(email)
			try {
				await sendLink(email, `${store.origin}/login/verify?token=${token}`)
			} catch {
				store.deleteLink(token)
				console.error('Maker sign-in email failed to send')
				return htmlResponse(loginPage('Could not send the email. Please try again shortly.'), 502)
			}
			return htmlResponse(loginPage('', true))
		}
		if (path === '/login/verify' && request.method === 'GET') {
			const token = url.searchParams.get('token') ?? ''
			if (!/^[A-Za-z0-9_-]{43}$/.test(token))
				return htmlResponse(loginPage('That link is invalid. Request a new one.'), 400)
			return htmlResponse(verifyPage(token))
		}
		if (path === '/login/verify' && request.method === 'POST') {
			const retry =
				store.limit('verify:global', 1000, WINDOW_MS) || store.limit(`verify:${ip}`, 30, WINDOW_MS)
			if (retry)
				return htmlResponse(loginPage('Too many attempts. Try again later.'), 429, {
					'Retry-After': String(retry)
				})
			try {
				const form = await request.formData()
				const token = form.get('token')
				if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
					throw new Error('Invalid token')
				const verifiedUser = store.consumeLink(token)
				if (!verifiedUser) throw new Error('Expired token')
				store.deleteSession(session)
				return signIn(verifiedUser.id)
			} catch {
				return htmlResponse(loginPage('That link expired or was already used. Request a new one.'), 400)
			}
		}
		if (path.startsWith('/auth/passkey/')) {
			if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)
			const match = /^\/auth\/passkey\/(register|login)\/(options|verify)$/.exec(path)
			if (!match) return jsonResponse({ error: 'Not found.' }, 404)
			const register = match[1] === 'register'
			if (register && !user)
				return jsonResponse({ error: 'Sign in before registering a passkey.' }, 401)
			const retry =
				store.limit('passkey:global', 1000, WINDOW_MS) || store.limit(`passkey:${ip}`, 60, WINDOW_MS)
			if (retry)
				return jsonResponse({ error: 'Try again later.' }, 429, { 'Retry-After': String(retry) })
			try {
				if (match[2] === 'options') {
					const opened = register
						? await store.registrationOptions(session)
						: await store.authenticationOptions()
					return jsonResponse(opened.options, 200, {
						'Set-Cookie': cookie(CEREMONY_COOKIE, opened.ceremony, 300)
					})
				}
				const response = await request.json()
				const ceremony = readCookie(request, CEREMONY_COOKIE)
				if (register) {
					await store.register(ceremony, session, response)
					return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie(CEREMONY_COOKIE, '', 0) })
				}
				const userId = await store.authenticate(ceremony, response)
				store.deleteSession(session)
				const newSession = store.createSession(userId)
				const result = jsonResponse({ ok: true }, 200, {
					'Set-Cookie': cookie(COOKIE_NAME, newSession, SESSION_MAX_AGE)
				})
				result.headers.append('Set-Cookie', cookie(CEREMONY_COOKIE, '', 0))
				return result
			} catch {
				return jsonResponse(
					{ error: 'Passkey could not be verified. Try again or sign in by email.' },
					400,
					{ 'Set-Cookie': cookie(CEREMONY_COOKIE, '', 0) }
				)
			}
		}
		if (path.startsWith('/auth/') || path.startsWith('/login/'))
			return jsonResponse({ error: 'Not found.' }, 404)
		if (!user) return Response.redirect(new URL('/login', store.origin), 303)
		return proxy(request)
	}
}

export const resendMailer =
	(apiKey: string, sender: string) => async (email: string, url: string) => {
		const response = await fetch('https://api.resend.com/emails', {
			body: JSON.stringify({
				from: `Maker <${sender}>`,
				subject: 'Sign in to Maker',
				text: `Sign in to Maker:\n\n${url}\n\nThis link expires in 15 minutes and can only be used once. If you did not request it, ignore this email.`,
				to: [email]
			}),
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			method: 'POST',
			signal: AbortSignal.timeout(10_000)
		})
		if (!response.ok) throw new Error(`Resend returned ${response.status}`)
	}

if (import.meta.main) {
	const apiKey = process.env.RESEND_API_KEY
	const sender = process.env.RESEND_SENDER_EMAIL
	if (!apiKey || !sender) throw new Error('RESEND_API_KEY and RESEND_SENDER_EMAIL are required')
	const port = Number(process.env.AUTH_PORT ?? 8841)
	const upstreamOrigin = process.env.UPSTREAM_ORIGIN ?? 'http://127.0.0.1:8840'
	const databasePath = process.env.AUTH_DATABASE_PATH ?? 'data/auth.sqlite'
	mkdirSync(dirname(databasePath), { mode: 0o700, recursive: true })
	Bun.serve({
		fetch: createAuthHandler({
			databasePath,
			publicOrigin: process.env.PUBLIC_ORIGIN ?? 'https://maker.rubric.sh',
			sendLink: resendMailer(apiKey, sender),
			upstreamOrigin
		}),
		hostname: '127.0.0.1',
		maxRequestBodySize: 64 * 1024,
		port
	})
	console.log(`Maker auth listening on 127.0.0.1:${port}`)
}
