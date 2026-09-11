import { Database } from 'bun:sqlite'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server'

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30
const CHALLENGE_MAX_AGE = 5 * 60 * 1000
const LINK_MAX_AGE = 15 * 60 * 1000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('base64url')

export type User = { id: string; email: string }
type StoredPasskey = { id: string; publicKey: string; counter: number; userId: string }
type Challenge = { value: string; session: string | null }

export class AuthStore {
	readonly db: Database
	readonly origin: string
	readonly rpID: string

	constructor(path: string, publicOrigin: string) {
		this.origin = new URL(publicOrigin).origin
		this.rpID = new URL(publicOrigin).hostname
		this.db = new Database(path, { create: true })
		this.db.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA busy_timeout = 5000;
			PRAGMA foreign_keys = ON;
			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE
			);
			CREATE TABLE IF NOT EXISTS passkeys (
				id TEXT PRIMARY KEY, publicKey TEXT NOT NULL, counter INTEGER NOT NULL,
				userId TEXT NOT NULL REFERENCES users(id)
			);
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY, expires INTEGER NOT NULL, userId TEXT NOT NULL REFERENCES users(id)
			);
			CREATE TABLE IF NOT EXISTS links (
				id TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS challenges (
				id TEXT PRIMARY KEY, value TEXT NOT NULL, kind TEXT NOT NULL,
				session TEXT, expires INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS rateLimits (
				id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
			);
		`)
	}

	// Persist email limits across restarts; hash addresses/IPs rather than keeping them here.
	limit(key: string, maximum: number, windowMs: number) {
		const now = Date.now()
		this.db.query('DELETE FROM rateLimits WHERE expires <= ?').run(now)
		const entry = this.db
			.query<{ count: number; expires: number }, [string, number]>(`
			INSERT INTO rateLimits VALUES (?, 1, ?)
			ON CONFLICT(id) DO UPDATE SET count = MIN(count + 1, 1000000)
			RETURNING count, expires
		`)
			.get(hash(key), now + windowMs)
		return entry && entry.count > maximum ? Math.ceil((entry.expires - now) / 1000) : 0
	}

	createLink(email: string) {
		const value = token()
		this.db.query('DELETE FROM links WHERE expires <= ?').run(Date.now())
		this.db
			.query('INSERT INTO links VALUES (?, ?, ?)')
			.run(hash(value), email, Date.now() + LINK_MAX_AGE)
		return value
	}

	deleteLink(value: string) {
		this.db.query('DELETE FROM links WHERE id = ?').run(hash(value))
	}

	consumeLink(value: string) {
		return this.db.transaction(() => {
			const link = this.db
				.query<{ email: string }, [string, number]>(
					'DELETE FROM links WHERE id = ? AND expires > ? RETURNING email'
				)
				.get(hash(value), Date.now())
			if (!link) return null
			this.db.query('INSERT OR IGNORE INTO users VALUES (?, ?)').run(randomUUID(), link.email)
			return this.db.query<User, [string]>('SELECT * FROM users WHERE email = ?').get(link.email)
		})()
	}

	createSession(userId: string) {
		const value = token()
		this.db.query('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
		this.db
			.query('INSERT INTO sessions VALUES (?, ?, ?)')
			.run(hash(value), Date.now() + SESSION_MAX_AGE * 1000, userId)
		return value
	}

	readSession(value: string) {
		if (!value) return null
		return this.db
			.query<User, [string, number]>(`
			SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.userId
			WHERE sessions.id = ? AND sessions.expires > ?
		`)
			.get(hash(value), Date.now())
	}

	deleteSession(value: string) {
		this.db.query('DELETE FROM sessions WHERE id = ?').run(hash(value))
	}

	mint(value: string, kind: string, session: string) {
		const id = token()
		this.db.query('DELETE FROM challenges WHERE expires <= ?').run(Date.now())
		this.db
			.query('INSERT INTO challenges VALUES (?, ?, ?, ?, ?)')
			.run(hash(id), value, kind, session ? hash(session) : null, Date.now() + CHALLENGE_MAX_AGE)
		return id
	}

	consume(id: string, kind: string, session: string) {
		// DELETE RETURNING consumes the challenge atomically, including failed attempts.
		const row = this.db
			.query<Challenge, [string, string, number]>(
				'DELETE FROM challenges WHERE id = ? AND kind = ? AND expires > ? RETURNING value, session'
			)
			.get(hash(id), kind, Date.now())
		if (!row || row.session !== (session ? hash(session) : null))
			throw new Error('Expired or invalid challenge')
		return row.value
	}

	async registrationOptions(session: string) {
		const user = this.readSession(session)
		if (!user) throw new Error('Sign in first')
		const keys = this.db
			.query<{ id: string }, [string]>('SELECT id FROM passkeys WHERE userId = ?')
			.all(user.id)
		const options = await generateRegistrationOptions({
			attestationType: 'none',
			authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			excludeCredentials: keys.map(key => ({ id: key.id })),
			rpID: this.rpID,
			rpName: 'Maker',
			userID: new TextEncoder().encode(user.id),
			userName: user.email
		})
		return { ceremony: this.mint(options.challenge, 'register', session), options }
	}

	async register(ceremony: string, session: string, response: RegistrationResponseJSON) {
		const user = this.readSession(session)
		if (!user) throw new Error('Sign in first')
		const expectedChallenge = this.consume(ceremony, 'register', session)
		const result = await verifyRegistrationResponse({
			expectedChallenge,
			expectedOrigin: this.origin,
			expectedRPID: this.rpID,
			requireUserVerification: true,
			response
		})
		if (!result.verified || !result.registrationInfo) throw new Error('Passkey refused')
		const credential = result.registrationInfo.credential
		this.db
			.query('INSERT INTO passkeys VALUES (?, ?, ?, ?)')
			.run(
				credential.id,
				Buffer.from(credential.publicKey).toString('base64url'),
				credential.counter,
				user.id
			)
	}

	async authenticationOptions() {
		const options = await generateAuthenticationOptions({
			rpID: this.rpID,
			userVerification: 'required'
		})
		return { ceremony: this.mint(options.challenge, 'login', ''), options }
	}

	async authenticate(ceremony: string, response: AuthenticationResponseJSON) {
		const expectedChallenge = this.consume(ceremony, 'login', '')
		const stored = this.db
			.query<StoredPasskey, [string]>('SELECT * FROM passkeys WHERE id = ?')
			.get(response.id)
		if (!stored) throw new Error('Unknown passkey')
		if (
			response.response.userHandle &&
			response.response.userHandle !== Buffer.from(stored.userId).toString('base64url')
		)
			throw new Error('Wrong user')
		const result = await verifyAuthenticationResponse({
			credential: {
				counter: stored.counter,
				id: stored.id,
				publicKey: Buffer.from(stored.publicKey, 'base64url')
			},
			expectedChallenge,
			expectedOrigin: this.origin,
			expectedRPID: this.rpID,
			requireUserVerification: true,
			response
		})
		if (!result.verified) throw new Error('Passkey refused')
		const updated = this.db
			.query('UPDATE passkeys SET counter = ? WHERE id = ? AND counter = ?')
			.run(result.authenticationInfo.newCounter, stored.id, stored.counter)
		if (updated.changes !== 1) throw new Error('Passkey changed during authentication')
		return stored.userId
	}
}
