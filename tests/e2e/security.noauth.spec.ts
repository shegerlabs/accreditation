import { test, expect } from '@playwright/test'

/**
 * Security-focused E2E tests for UNAUTHENTICATED access.
 * These tests verify that security controls work for users without sessions.
 *
 * Note: This file uses .noauth.spec.ts naming to run without authentication setup.
 */

// =============================================================================
// UNAUTHENTICATED TESTS - Fresh browser context
// =============================================================================

test.describe('Attachment Endpoint Security - Unauthenticated', () => {
	test('should redirect unauthenticated users to login when accessing attachments', async ({
		page,
	}) => {
		// Try to access an attachment directly without authentication
		// Using a fake attachment ID since we're testing auth, not the actual file
		await page.goto('/resources/attachments/fake-attachment-id')

		// Should redirect to login page
		expect(page.url()).toContain('/login')
	})

	test('should not expose attachment content to unauthenticated users', async ({
		request,
	}) => {
		// Make a direct API request without auth cookies
		const response = await request.get(
			'/resources/attachments/fake-attachment-id',
			{ maxRedirects: 0 },
		)

		// Should get a redirect (302) to login, not the content
		expect(response.status()).toBe(302)
	})
})

test.describe('Session Security - Unauthenticated', () => {
	test('should redirect to login for protected routes', async ({ page }) => {
		// Test a protected route to verify redirect works
		// Note: '/' is a public landing page, so we test '/events' instead
		await page.goto('/events')
		expect(page.url()).toContain('/login')
	})

	test('should allow access to login page', async ({ page }) => {
		await page.goto('/login')
		expect(page.url()).toContain('/login')

		// Should see login form - use same selectors as auth.setup.ts
		const loginForm = page.locator('#login-form')
		const emailInput = page.locator(
			'input[name="username"], input[name="email"], input[type="email"]',
		)
		const passwordInput = page.locator('input[type="password"]')

		await expect(loginForm).toBeVisible()
		expect(await emailInput.count()).toBeGreaterThan(0)
		expect(await passwordInput.count()).toBeGreaterThan(0)
	})

	test('should allow access to signup page', async ({ page }) => {
		await page.goto('/signup')

		// Should see signup form (or registration unavailable message)
		const signupForm = page.locator('form')
		const unavailableMessage = page.getByText(/registration.*unavailable/i)

		const hasContent =
			(await signupForm.count()) > 0 || (await unavailableMessage.count()) > 0
		expect(hasContent).toBeTruthy()
	})
})

test.describe('Rate Limiting - Smoke Test', () => {
	test('should allow normal login attempts', async ({ page }) => {
		await page.goto('/login')

		// Wait for login form to be ready
		await expect(page.locator('#login-form')).toBeVisible()

		// Fill in login form - use same selectors as auth.setup.ts
		const emailInput = page
			.locator(
				'input[name="username"], input[name="email"], input[type="email"]',
			)
			.first()
		await emailInput.fill('test@example.com')
		await page.fill('input[type="password"]', 'wrongpassword')

		// Submit
		await page.getByRole('button', { name: 'Login' }).click()

		// Should get an error message, not a rate limit block
		// (Rate limiting only kicks in after multiple attempts)
		await page.waitForTimeout(500) // Wait for response

		// Check we're still on login page with an error, not blocked
		expect(page.url()).toContain('/login')
	})
})

test.describe('CSRF Protection', () => {
	test('login form should include CSRF token', async ({ page }) => {
		await page.goto('/login')

		// Look for CSRF token input (hidden field)
		const csrfInput = page.locator('input[name="csrf"]')
		const csrfTokenExists = (await csrfInput.count()) > 0

		// CSRF protection should be present
		expect(csrfTokenExists).toBeTruthy()
	})

	test('signup form should include CSRF token', async ({ page }) => {
		await page.goto('/signup')

		// Check if we have a form (registration might be unavailable)
		const form = page.locator('form')
		if ((await form.count()) === 0) {
			test.skip()
			return
		}

		// Look for CSRF token input (hidden field)
		const csrfInput = page.locator('input[name="csrf"]')
		const csrfTokenExists = (await csrfInput.count()) > 0

		// CSRF protection should be present
		expect(csrfTokenExists).toBeTruthy()
	})
})

test.describe('Security Headers - Smoke Test', () => {
	test('should set security headers on responses', async ({ request }) => {
		const response = await request.get('/login')

		// Check for common security headers set by Helmet
		const headers = response.headers()

		// X-Content-Type-Options prevents MIME sniffing
		expect(headers['x-content-type-options']).toBe('nosniff')

		// X-Frame-Options prevents clickjacking (or CSP frame-ancestors)
		const hasFrameProtection =
			headers['x-frame-options'] !== undefined ||
			(headers['content-security-policy']?.includes('frame-ancestors') ?? false)
		expect(hasFrameProtection).toBeTruthy()
	})
})

test.describe('Authentication Flow Security', () => {
	test('should not reveal if email exists on failed login', async ({
		page,
	}) => {
		await page.goto('/login')

		// Wait for login form to be ready
		await expect(page.locator('#login-form')).toBeVisible()

		// Try with a random email that definitely doesn't exist
		const emailInput = page
			.locator(
				'input[name="username"], input[name="email"], input[type="email"]',
			)
			.first()
		await emailInput.fill('nonexistent12345@test.com')
		await page.fill('input[type="password"]', 'wrongpassword')
		await page.getByRole('button', { name: 'Login' }).click()

		// Wait for response
		await page.waitForLoadState('networkidle')

		// The error message should be generic (not revealing if email exists)
		const errorMessage = page.locator('[role="alert"], .error, [class*="error"]')
		if ((await errorMessage.count()) > 0) {
			const text = await errorMessage.textContent()
			// Should NOT say "email not found" or similar
			expect(text?.toLowerCase()).not.toContain('email not found')
			expect(text?.toLowerCase()).not.toContain('user not found')
			expect(text?.toLowerCase()).not.toContain('no account')
		}
	})
})
