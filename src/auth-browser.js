const decode = value => {
	const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
	return Uint8Array.from(raw, letter => letter.charCodeAt(0))
}
const encode = value =>
	btoa(String.fromCharCode(...new Uint8Array(value)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

async function post(path, body = {}) {
	const response = await fetch(path, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST'
	})
	const result = await response.json()
	if (!response.ok) throw new Error(result.error || 'Please try again.')
	return result
}

const button = document.querySelector('[data-passkey]')
const message = document.querySelector('[role="alert"]')
if (!window.PublicKeyCredential) {
	button.disabled = true
	message.textContent = 'This browser does not support passkeys. Sign in by email instead.'
}
button.addEventListener('click', async () => {
	button.disabled = true
	message.textContent = ''
	const register = button.dataset.passkey === 'register'
	const path = '/auth/passkey/' + (register ? 'register' : 'login')
	try {
		const options = await post(path + '/options')
		options.challenge = decode(options.challenge)
		let credential
		if (register) {
			options.user.id = decode(options.user.id)
			options.excludeCredentials = (options.excludeCredentials || []).map(key => ({
				...key,
				id: decode(key.id)
			}))
			credential = await navigator.credentials.create({ publicKey: options })
		} else {
			options.allowCredentials = (options.allowCredentials || []).map(key => ({
				...key,
				id: decode(key.id)
			}))
			credential = await navigator.credentials.get({ publicKey: options })
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
		await post(path + '/verify', wire)
		location.assign('/')
	} catch (error) {
		message.textContent =
			error.name === 'NotAllowedError'
				? 'Passkey cancelled or unavailable. Try again or sign in by email.'
				: error.name === 'InvalidStateError'
					? 'This device already has a passkey for Maker.'
					: error.message
	} finally {
		button.disabled = false
	}
})
