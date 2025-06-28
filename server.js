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
				// Allow inline scripts and eval for development needs
				scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
				// Allow inline styles
				styleSrc: ["'self'", "'unsafe-inline'"],
				// Allow images from same origin, data URIs, and HTTPS sources
				imgSrc: ["'self'", 'data:', 'https:'],
				// Restrict API requests to same origin
				connectSrc:
					process.env.NODE_ENV === 'production'
						? ["'self'"]
						: ["'self'", 'ws://localhost:*'], // Allow WebSocket in development only for vite's HMR
				// Restrict fonts to same origin
				fontSrc: ["'self'"],
				// Prevent object/embed/applet tags
				objectSrc: ["'none'"],
				// Restrict media to same origin
				mediaSrc: ["'self'"],
				// Prevent iframe usage
				frameSrc: ["'none'"],
				// Restrict base tag to same origin
				baseUri: ["'self'"],
				// Restrict form submissions to same origin
				formAction: ["'self'"],
				// Prevent site from being embedded in frames/iframes
				frameAncestors: ["'none'"],
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
		// Prevent site from being embedded in frames (legacy header)
		xFrameOptions: 'DENY',
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

app.use(morgan('tiny'))

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
