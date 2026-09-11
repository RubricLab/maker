const decode = value => {
	const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
	return Uint8Array.from(raw, letter => letter.charCodeAt(0))
}
const encode = value =>
	btoa(String.fromCharCode(...new Uint8Array(value)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

async function post(path, body, signal) {
	const response = await fetch(path, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
		signal
	})
	const result = await response.json()
	if (!response.ok) throw new Error(result.error || 'Please try again.')
	return result
}

const button = document.querySelector('[data-passkey]')
const message = document.querySelector('[role="alert"]')
const register = button.dataset.passkey === 'register'
const supported = !!window.PublicKeyCredential
let controller
let pending = Promise.resolve()
let interacted = false

// A local hint only. Access still requires a fresh, server-verified WebAuthn assertion.
function rememberPasskey() {
	try {
		localStorage.setItem('maker.passkey', '1')
	} catch {}
}

async function attempt(mode, signal) {
	const conditional = mode === 'conditional'
	button.disabled = !conditional
	if (mode === 'manual') message.textContent = ''
	const path = `/auth/passkey/${register ? 'register' : 'login'}`
	try {
		const options = await post(`${path}/options`, {}, signal)
		options.challenge = decode(options.challenge)
		let credential
		if (register) {
			options.user.id = decode(options.user.id)
			options.excludeCredentials = (options.excludeCredentials || []).map(key => ({
				...key,
				id: decode(key.id)
			}))
			credential = await navigator.credentials.create({ publicKey: options, signal })
		} else {
			options.allowCredentials = (options.allowCredentials || []).map(key => ({
				...key,
				id: decode(key.id)
			}))
			credential = await navigator.credentials.get({
				mediation: conditional ? 'conditional' : 'optional',
				publicKey: options,
				signal
			})
		}
		if (!credential) throw new Error('No passkey selected.')
		const response = credential.response
		const wire = {
			authenticatorAttachment: credential.authenticatorAttachment,
			clientExtensionResults: credential.getClientExtensionResults(),
			id: credential.id,
			rawId: encode(credential.rawId),
			response: register
				? {
						attestationObject: encode(response.attestationObject),
						clientDataJSON: encode(response.clientDataJSON),
						transports: response.getTransports ? response.getTransports() : []
					}
				: {
						authenticatorData: encode(response.authenticatorData),
						clientDataJSON: encode(response.clientDataJSON),
						signature: encode(response.signature),
						userHandle: response.userHandle ? encode(response.userHandle) : null
					},
			type: credential.type
		}
		await post(`${path}/verify`, wire, signal)
		rememberPasskey()
		location.replace('/')
	} catch (error) {
		// Cancelled/background attempts leave the email form usable and do not retry in a loop.
		if (signal.aborted || mode !== 'manual') return
		message.textContent =
			error.name === 'NotAllowedError'
				? 'Passkey cancelled or unavailable. Try again or sign in by email.'
				: error.name === 'InvalidStateError'
					? 'This device already has a passkey for Maker.'
					: error.message
	} finally {
		button.disabled = false
	}
}

function start(mode) {
	controller?.abort()
	const current = new AbortController()
	controller = current
	const previous = pending
	// Finish cancellation before minting a new ceremony cookie.
	pending = (async () => {
		await previous
		if (!current.signal.aborted) await attempt(mode, current.signal)
	})()
	return pending
}

button.addEventListener('click', () => {
	interacted = true
	void start('manual')
})
for (const form of document.querySelectorAll('form')) {
	form.addEventListener('submit', () => {
		interacted = true
		controller?.abort()
	})
}
window.addEventListener('pagehide', () => controller?.abort())

async function resume() {
	if (register) return
	try {
		const response = await fetch('/auth/session', { cache: 'no-store' })
		const session = await response.json()
		if (session.signedIn && !interacted) {
			location.replace('/')
			return
		}
	} catch {}
	if (
		!supported ||
		interacted ||
		button.dataset.autostart === 'false' ||
		new URLSearchParams(location.search).has('signed_out')
	)
		return
	let remembered = false
	try {
		remembered = localStorage.getItem('maker.passkey') === '1'
	} catch {}
	if (remembered) {
		await start('automatic')
		return
	}
	// Existing/synced passkeys without a browser hint appear in the native email autofill UI.
	try {
		const conditional = await PublicKeyCredential.isConditionalMediationAvailable?.()
		if (conditional && !interacted) await start('conditional')
	} catch {}
}

if (!supported) {
	button.disabled = true
	message.textContent = 'This browser does not support passkeys. Sign in by email instead.'
}
void resume()
