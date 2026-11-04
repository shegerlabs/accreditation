import { createRequestHandler } from '@remix-run/express'
import compression from 'compression'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'

const viteDevServer =
	process.env.NODE_ENV === 'production'
		? undefined
		: await import('vite').then(vite =>
				vite.createServer({
					server: { middlewareMode: true },
				}),
			)

const remixHandler = createRequestHandler({
	build: viteDevServer
		? () => viteDevServer.ssrLoadModule('virtual:remix/server-build')
		: await import('./build/server/index.js'),
})

const app = express()
app.set('trust proxy', 1)
app.use(compression())

// Configure security headers
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				// Restrict resources to same origin by default
				defaultSrc: ["'self'"],
				// SECURITY NOTE: 'unsafe-inline' and 'unsafe-eval' are required for:
				// - Remix's runtime script injection for hydration
				// - Vite's Hot Module Replacement (HMR) in development
				// - React's client-side hydration process
				// TODO: Consider implementing nonce-based CSP for stricter security
				// See: https://remix.run/docs/en/main/guides/csp
				scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
				// Inline styles required for Tailwind's dynamic class generation
				styleSrc: ["'self'", "'unsafe-inline'"],
				// Allow images from same origin, data URIs, and HTTPS sources
				imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
				// Restrict API requests to same origin
				connectSrc:
					process.env.NODE_ENV === 'production'
						? ["'self'", 'data:', 'blob:']
						: ["'self'", 'ws://localhost:*', 'data:', 'blob:'],
				// Restrict fonts to same origin
				fontSrc: ["'self'"],
				// Prevent object/embed/applet tags
				objectSrc: ["'none'"],
				// Restrict media to same origin
				mediaSrc: ["'self'"],
				// Update frame-src to allow blob URLs for PDF viewing
				frameSrc: ["'self'", 'blob:'],
				// Restrict base tag to same origin
				baseUri: ["'self'"],
				// Restrict form submissions to same origin
				formAction: ["'self'"],
				// Allow framing from same origin
				frameAncestors: ["'self'"],
			},
		},
		// Prevent browsers from including page in cross-origin embeddings
		crossOriginEmbedderPolicy: true,
		// Control window.opener behavior for cross-origin links
		crossOriginOpenerPolicy: true,
		// Restrict resource sharing to same origin
		crossOriginResourcePolicy: true,
		// Force HTTPS for a specified time
		strictTransportSecurity: {
			maxAge: 31536000, // 1 year in seconds
			includeSubDomains: true,
		},
		// Control how much referrer information should be included
		referrerPolicy: 'strict-origin-when-cross-origin',
		// Set X-Frame-Options to SAMEORIGIN to allow framing from same origin
		xFrameOptions: { action: 'sameorigin' },
	}),
)

// Add Permissions-Policy header
app.use((req, res, next) => {
	res.setHeader(
		'Permissions-Policy',
		// Allow features only from same origin
		// Format: feature=(self) means the feature is only allowed for same origin
		'accelerometer=(self),' + // Allow motion sensors from same origin
			'autoplay=(self),' + // Allow autoplay from same origin
			'camera=(self),' + // Allow camera access from same origin
			'display-capture=(self),' + // Allow screen capture from same origin
			'encrypted-media=(self),' + // Allow DRM from same origin
			'fullscreen=(self),' + // Allow fullscreen from same origin
			'geolocation=(self),' + // Allow location access from same origin
			'gyroscope=(self),' + // Allow motion sensors from same origin
			'magnetometer=(self),' + // Allow compass access from same origin
			'microphone=(self),' + // Allow microphone access from same origin
			'midi=(self),' + // Allow MIDI device access from same origin
			'payment=(self),' + // Allow payment API from same origin
			'picture-in-picture=(self),' + // Allow PiP from same origin
			'screen-wake-lock=(self),' + // Allow wake lock from same origin
			'usb=(self),' + // Allow USB access from same origin
			'xr-spatial-tracking=(self),' + // Allow VR/AR from same origin
			'clipboard-read=(self),' + // Allow clipboard reading from same origin
			'clipboard-write=(self)', // Allow clipboard writing from same origin
	)
	next()
})

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by')

// handle asset requests
if (viteDevServer) {
	app.use(viteDevServer.middlewares)
} else {
	// Vite fingerprints its assets so we can cache forever.
	app.use(
		'/assets',
		express.static('build/client/assets', { immutable: true, maxAge: '1y' }),
	)
}

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static('build/client', { maxAge: '1h' }))

// SECURITY: Custom morgan format that excludes sensitive endpoints from logging
// This prevents OTP codes and reset tokens from appearing in logs
const sensitivePathPatterns = [
	'/verify',
	'/reset-password',
	'/forgot-password',
	'/change-email',
	'/two-factor',
]

app.use(
	morgan((tokens, req, res) => {
		// Skip logging for sensitive paths to prevent OTP/token leakage
		const isSensitivePath = sensitivePathPatterns.some(pattern =>
			req.path.includes(pattern),
		)

		if (isSensitivePath) {
			// Log only method and status, not the full URL with query params
			return [
				tokens.method(req, res),
				'[REDACTED-SENSITIVE-PATH]',
				tokens.status(req, res),
				tokens.res(req, res, 'content-length'),
				'-',
				tokens['response-time'](req, res),
				'ms',
			].join(' ')
		}

		// Standard tiny format for non-sensitive paths
		return [
			tokens.method(req, res),
			tokens.url(req, res),
			tokens.status(req, res),
			tokens.res(req, res, 'content-length'),
			'-',
			tokens['response-time'](req, res),
			'ms',
		].join(' ')
	}),
)

// Only skip rate limiting in test environment
const isTestEnvironment = process.env.NODE_ENV === 'test'

const rateLimitDefault = {
	windowMs: 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests, please try again later.',
	headers: true,
}

const strongestRateLimit = rateLimit({
	...rateLimitDefault,
	max: 10,
})

const strongRateLimit = rateLimit({
	...rateLimitDefault,
	max: 50,
})

const generalRateLimit = rateLimit(rateLimitDefault)

app.use((req, res, next) => {
	// Skip rate limiting only in test environment
	if (isTestEnvironment) {
		return next()
	}

	const strongPaths = [
		'/signup',
		'/login',
		'/forgot-password',
		'/reset-password',
		'/onboarding',
		'/verify',
		'/participant/requests/new',
		'/participant/requests/general',
		'/participant/requests/professional',
		'/participant/requests/wishlist',
		'/participant/requests/documents',
	]

	if (req.method !== 'GET' && req.method !== 'HEAD') {
		if (strongPaths.some(path => req.path.includes(path))) {
			return strongestRateLimit(req, res, next)
		}

		return strongRateLimit(req, res, next)
	}

	return generalRateLimit(req, res, next)
})

// Block suspicious requests
app.use((req, res, next) => {
	if (
		req.headers['user-agent'] === undefined ||
		req.headers['accept'] === undefined
	) {
		return res.status(403).send('Forbidden')
	}
	next()
})

// Health Check - moved here after all middleware
app.get('/up', (req, res) => {
	res.json({
		status: 'ok',
		uptime: process.uptime(),
		version: process.env.npm_package_version,
	})
})

// handle SSR requests - this should always be last
app.all('*', remixHandler)

const port = process.env.PORT || 8080
app.listen(port, () =>
	console.log(`Express server listening at http://localhost:${port}`),
)
