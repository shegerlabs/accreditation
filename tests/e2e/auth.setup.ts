import { test as setup, expect } from '@playwright/test'

const authFile = 'tests/e2e/.auth/user.json'

/**
 * Authentication Setup
 *
 * This runs before all tests that depend on authenticated state.
 * It logs in once and saves the session to a file that other tests reuse.
 *
 * Configure test credentials in environment variables or use defaults:
 * - TEST_USER_EMAIL: Login email/username (default: focal@test.com)
 * - TEST_USER_PASSWORD: Login password (default: testpassword)
 */
setup('authenticate', async ({ page }) => {
	const username = process.env.TEST_USER_EMAIL || 'focal@test.com'
	const password = process.env.TEST_USER_PASSWORD || 'testpassword'

	// Navigate to login page
	await page.goto('/login')

	// Wait for login form to be ready
	await expect(page.locator('#login-form')).toBeVisible()

	// Fill in credentials
	const usernameInput = page
		.locator('input[name="username"], input[name="email"], input[type="email"]')
		.first()
	await usernameInput.fill(username)
	await page.fill('input[type="password"]', password)

	// Check "Remember me" if available (helps with session persistence)
	const rememberMeLabel = page.getByText('Remember me')
	if (await rememberMeLabel.isVisible()) {
		await rememberMeLabel.click()
	}

	// Submit login form
	await page.getByRole('button', { name: 'Login' }).click()

	// Wait for successful login - should redirect away from login page
	// Adjust this based on where your app redirects after login
	await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })

	// Alternatively, wait for a specific element that only appears when logged in
	// await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()

	// Save authentication state to file
	await page.context().storageState({ path: authFile })
})
