import { mkdirSync } from 'node:fs'
import { createAuthHandler, resendMailer } from './auth'

const apiKey = process.env.RESEND_API_KEY
const sender = process.env.RESEND_SENDER_EMAIL
if (!apiKey || !sender) throw new Error('RESEND_API_KEY and RESEND_SENDER_EMAIL are required')

const databasePath = process.env.AUTH_DATABASE_PATH ?? '/data/auth.sqlite'
mkdirSync('/data', { recursive: true })
const upstreamOrigin = 'http://127.0.0.1:8840'
const next = Bun.spawn(['bun', '--bun', 'run', 'start'], {
	env: { ...process.env, PORT: '8840' },
	stderr: 'inherit',
	stdout: 'inherit'
})

try {
	let ready = false
	for (let attempt = 0; attempt < 100; attempt++) {
		if (next.exitCode !== null) throw new Error(`Next.js exited with ${next.exitCode}`)
		try {
			const response = await fetch(upstreamOrigin, { signal: AbortSignal.timeout(1000) })
			if (response.ok) {
				ready = true
				break
			}
		} catch {}
		await Bun.sleep(200)
	}
	if (!ready) throw new Error('Next.js did not start')

	const handler = createAuthHandler({
		databasePath,
		publicOrigin: process.env.PUBLIC_ORIGIN ?? 'https://maker.rubric.sh',
		sendLink: resendMailer(apiKey, sender),
		upstreamOrigin
	})
	const server = Bun.serve({
		fetch(request) {
			// Railway terminates TLS and sets the forwarded client IP.
			const headers = new Headers(request.headers)
			headers.set('x-real-ip', headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown')
			return handler(new Request(request, { headers }))
		},
		hostname: '0.0.0.0',
		maxRequestBodySize: 64 * 1024,
		port: Number(process.env.PORT ?? 8080)
	})
	console.log(`Maker listening on ${server.port}`)
	process.on('SIGTERM', () => {
		server.stop()
		next.kill()
	})
} catch (error) {
	next.kill()
	throw error
}
