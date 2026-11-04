import { test, expect } from '@playwright/test'

/**
 * Unauthenticated E2E Tests
 *
 * These tests run WITHOUT authentication state.
 * They test public pages and the login flow itself.
 */

test.describe('Authentication Flow', () => {
	test('should display login page', async ({ page }) => {
		await page.goto('/login')

		// Check for login page elements
		await expect(page.getByText('Login').first()).toBeVisible()
		await expect(
			page.locator('input[name="username"], input[name="email"], input[type="email"]').first()
		).toBeVisible()
		await expect(page.locator('input[type="password"]')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
	})

	test('should show error for invalid credentials', async ({ page }) => {
		await page.goto('/login')

		// Fill username/email field
		const usernameInput = page.locator(
			'input[name="username"], input[name="email"], input[type="email"]'
		).first()
		await usernameInput.fill('wronguser')
		await page.fill('input[type="password"]', 'wrongpassword')
		await page.getByRole('button', { name: 'Login' }).click()

		// Wait for error message or page to respond
		await expect(
			page.locator('[role="alert"], .error, [class*="error"], [class*="destructive"]').first()
		).toBeVisible({ timeout: 10000 })
	})
})

test.describe('Error Handling', () => {
	test('should handle 404 pages gracefully', async ({ page }) => {
		await page.goto('/non-existent-page')

		// Should show 404 page or redirect
		const url = page.url()
		const pageContent = await page.textContent('body')

		// Either shows 404 or redirects
		expect(
			pageContent?.includes('404') ||
				pageContent?.includes('not found') ||
				url.includes('login') ||
				url === 'http://localhost:5101/'
		).toBe(true)
	})
})
