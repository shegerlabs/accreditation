import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:3000'

async function makeRequest(path, method = 'GET') {
	try {
		const response = await fetch(`${BASE_URL}${path}`, {
			method,
			headers: {
				Accept: '*/*',
				'User-Agent': 'rate-limit-test',
			},
		})
		const limit = response.headers.get('ratelimit-limit')
		const remaining = response.headers.get('ratelimit-remaining')
		const reset = response.headers.get('ratelimit-reset')

		return {
			status: response.status,
			limit,
			remaining,
			reset,
		}
	} catch (error) {
		console.error('Request failed:', error)
		return null
	}
}

async function testRateLimit(path, method, requestCount, description) {
	console.log(`\nTesting ${description}`)
	console.log('----------------------------------------')

	const start = Date.now()
	const results = Array.from({ length: requestCount }, () =>
		makeRequest(path, method),
	)
	const responses = await Promise.all(results)

	responses.forEach((result, i) => {
		if (!result) return
		console.log(
			`Request ${(i + 1).toString().padStart(3)}: Status ${result.status}, ` +
				`Limit: ${result.limit}, Remaining: ${result.remaining}, Reset: ${result.reset}s`,
		)
	})

	const duration = ((Date.now() - start) / 1000).toFixed(2)
	const successful = responses.filter(r => r?.status === 200).length
	const rateLimited = responses.filter(r => r?.status === 429).length

	console.log('\nTest Summary:')
	console.log('----------------------------------------')
	console.log(`Duration: ${duration} seconds`)
	console.log(`Successful requests (200): ${successful}`)
	console.log(`Rate limited requests (429): ${rateLimited}`)
	console.log(`Total requests: ${requestCount}`)
}

// Test different rate limit scenarios
async function runTests() {
	// Test general rate limit (100 requests/minute)
	await testRateLimit(
		'/up',
		'GET',
		150,
		'general rate limit (100 requests/minute)',
	)

	// Test strong rate limit (50 requests/minute)
	await testRateLimit(
		'/api/some-endpoint',
		'POST',
		60,
		'strong rate limit (50 requests/minute)',
	)

	// Test strongest rate limit (10 requests/minute)
	await testRateLimit(
		'/login',
		'POST',
		15,
		'strongest rate limit (10 requests/minute)',
	)
}

runTests().catch(console.error)
