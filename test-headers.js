import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:3000'

async function checkSecurityHeaders() {
	console.log('Checking security headers...\n')

	const response = await fetch(`${BASE_URL}/up`)
	const headers = response.headers

	const expectedHeaders = {
		'strict-transport-security': 'max-age=31536000; includeSubDomains',
		'x-frame-options': 'DENY',
		'x-content-type-options': 'nosniff',
		'content-security-policy': headers.get('content-security-policy'),
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': headers.get('permissions-policy'),
		'cross-origin-embedder-policy': 'require-corp',
		'cross-origin-opener-policy': 'same-origin',
		'cross-origin-resource-policy': 'same-origin',
	}

	console.log('Security Headers Check:')
	console.log('----------------------------------------')

	let missingHeaders = 0

	for (const [header] of Object.entries(expectedHeaders)) {
		const value = headers.get(header)
		const status = value ? '✅' : '❌'
		console.log(`${status} ${header}:`)
		if (value) {
			console.log(`   ${value}`)
		} else {
			console.log('   Missing!')
			missingHeaders++
		}
		console.log()
	}

	console.log('----------------------------------------')
	console.log(`Total headers checked: ${Object.keys(expectedHeaders).length}`)
	console.log(`Missing headers: ${missingHeaders}`)
	console.log(
		`Security score: ${Math.round(((Object.keys(expectedHeaders).length - missingHeaders) / Object.keys(expectedHeaders).length) * 100)}%`,
	)
}

checkSecurityHeaders().catch(console.error)
