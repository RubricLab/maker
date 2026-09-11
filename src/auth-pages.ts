const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

const page = (body: string, script = false) => `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="robots" content="noindex, nofollow">
	<title>Maker</title>
	<style>
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #fff; color: #111; font-family: system-ui, sans-serif; }
		main { width: min(100%, 320px); display: grid; gap: 12px; }
		form { display: grid; gap: 12px; }
		h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
		input, button { width: 100%; min-height: 44px; border: 1px solid #d4d4d4; border-radius: 8px; font: inherit; }
		input { padding: 0 12px; background: transparent; color: inherit; }
		button { border-color: #111; background: #111; color: #fff; cursor: pointer; }
		button:disabled { opacity: .5; cursor: not-allowed; }
		.secondary { background: transparent; color: inherit; border-color: #d4d4d4; }
		a { color: inherit; font-size: 14px; text-align: center; padding: 8px; }
		p, label { margin: 0; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
		[role="alert"] { min-height: 20px; color: #b42318; }
		[role="status"] { color: #287a44; }
		@media (prefers-color-scheme: dark) {
			body { background: #0a0a0a; color: #f5f5f5; }
			input, .secondary { border-color: #404040; }
			button { border-color: #f5f5f5; background: #f5f5f5; color: #111; }
		}
	</style>
	${script ? '<script src="/auth/browser.js" defer></script>' : ''}
</head>
<body><main><h1>Maker</h1>${body}</main></body>
</html>`

export const loginPage = (message = '', sent = false) =>
	page(
		`
	<p>Sign in or create an account. No password needed.</p>
	<form action="/login" method="post">
		<label for="email">Email</label>
		<input id="email" type="email" name="email" placeholder="you@example.com" autocomplete="username webauthn" maxlength="254" required>
		<button type="submit">Send sign-in link</button>
	</form>
	${sent ? '<p role="status">Check your inbox for a sign-in link. It expires in 15 minutes.</p>' : ''}
	<button class="secondary" type="button" data-passkey="login" data-autostart="${!sent && !message}">Sign in with a passkey</button>
	<p role="alert">${escapeHtml(message)}</p>
`,
		true
	)

export const accountPage = (email: string) =>
	page(
		`
	<p>Signed in as ${escapeHtml(email)}</p>
	<p>Add a passkey to sign in with Face ID, Touch ID, or your device lock.</p>
	<button type="button" data-passkey="register">Register passkey</button>
	<a href="/">Continue to Maker</a>
	<form action="/auth/logout" method="post"><button class="secondary">Sign out</button></form>
	<p role="alert"></p>
`,
		true
	)

// Confirm via POST so email scanners and link previews cannot consume the token.
export const verifyPage = (token: string) =>
	page(`
	<p>Continue to sign in to Maker with the email that received this link.</p>
	<form action="/login/verify" method="post">
		<input type="hidden" name="token" value="${escapeHtml(token)}">
		<button type="submit">Sign in to Maker</button>
	</form>
	<a href="/login">Use a different email</a>
`)
