import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

// Load test environment variables from .env.test
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

// Use port from env or default to 5101 (matches server.js default)
const PORT = process.env.PORT || 5101
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
	testDir: './tests/e2e',
	outputDir: './tests/test-results',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [['html', { outputFolder: './tests/playwright-report', open: 'never' }]],
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		// Setup project - runs authentication before other tests
		{
			name: 'setup',
			testMatch: /.*\.setup\.ts/,
		},
		// Main test project - uses authenticated state (excludes noauth tests)
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// Use saved authentication state
				storageState: 'tests/e2e/.auth/user.json',
			},
			dependencies: ['setup'],
			testIgnore: /.*\.noauth\.spec\.ts/,
		},
		// Unauthenticated tests (login page, public pages)
		{
			name: 'chromium-no-auth',
			use: { ...devices['Desktop Chrome'] },
			testMatch: /.*\.noauth\.spec\.ts/,
		},
	],
	/* Configure web server only when not using UI mode or when explicitly enabled */
	webServer: process.env.SKIP_WEB_SERVER
		? undefined
		: {
				command: `PORT=${PORT} NODE_ENV=test npm run dev`,
				url: BASE_URL,
				reuseExistingServer: true,
				timeout: 120000,
			},
})
