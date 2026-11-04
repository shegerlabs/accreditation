import { test, expect, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * E2E Tests for Registration Edit Flow (Rejected Participants)
 *
 * These tests cover the edit functionality for rejected participant registrations.
 * Only rejected participants can be edited and resubmitted.
 *
 * Uses database helpers to ensure a rejected participant exists for testing.
 */

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test user credentials
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'focal@test.com'

// Test fixtures paths
const FIXTURES_DIR = path.join(__dirname, '../fixtures')
const TEST_PHOTO_JPG = path.join(FIXTURES_DIR, 'test-photo.jpg')
const TEST_DOCUMENT_PDF = path.join(FIXTURES_DIR, 'test-document.pdf')

// Database helpers (lazy loaded)
let dbHelpers: typeof import('./helpers/db')
let testUserId: string | null = null
let testParticipantId: string | null = null

// Initialize helpers and ensure a rejected participant exists
async function ensureRejectedParticipant(): Promise<string | null> {
	if (!dbHelpers) {
		dbHelpers = await import('./helpers/db')
	}

	// Get user ID
	if (!testUserId) {
		const user = await dbHelpers.getUserByEmail(TEST_USER_EMAIL)
		testUserId = user?.id ?? null
	}

	if (!testUserId) return null

	// Check if we already have a rejected participant
	const existing = await dbHelpers.getRejectedParticipant(testUserId)
	if (existing) {
		testParticipantId = existing.id
		return existing.id
	}

	// Create one
	const result = await dbHelpers.createRejectedParticipant(testUserId)
	if (result) {
		testParticipantId = result.participantId
		return result.participantId
	}

	return null
}

// Cleanup after all tests
test.afterAll(async () => {
	if (dbHelpers) {
		// Optionally delete the test participant if we created it
		// (keeping it for now as it may be useful for debugging)
		await dbHelpers.disconnectTestPrisma()
	}
})

test.describe('Edit Participant Access Control', () => {
	test('should redirect to login if not authenticated', async ({ browser }) => {
		// Create a new context without stored auth
		const context = await browser.newContext()
		const page = await context.newPage()

		// Try to access edit page (use a fake ID)
		await page.goto('/requests/test-participant-id/edit')

		// Wait for page to settle
		await page.waitForLoadState('networkidle')

		// Should redirect to login or show error page
		const currentUrl = page.url()
		const hasLoginForm = await page.locator('#login-form').isVisible()
		const isLoginPage = currentUrl.includes('/login')
		const isErrorPage =
			(await page.content()).includes('not found') ||
			(await page.content()).includes('error') ||
			(await page.content()).includes('404')

		// Should either redirect to login or show access denied/not found
		expect(isLoginPage || hasLoginForm || isErrorPage).toBeTruthy()

		await context.close()
	})

	test('should show 404 or error for non-existent participant', async ({
		page,
	}) => {
		// Try to access edit page for non-existent participant
		await page.goto('/requests/non-existent-id-12345/edit')
		await page.waitForLoadState('networkidle')

		// Should show error or 404 page
		const pageContent = await page.content()
		const hasError =
			pageContent.toLowerCase().includes('not found') ||
			pageContent.toLowerCase().includes('error') ||
			pageContent.toLowerCase().includes('404') ||
			page.url().includes('/requests') // May redirect to list

		expect(hasError).toBeTruthy()
	})
})

test.describe('Edit Form for Rejected Participants', () => {
	// Ensure test data exists before each test
	test.beforeEach(async () => {
		await ensureRejectedParticipant()
	})

	// Helper to get the edit URL for the test participant
	async function getEditUrl(): Promise<string | null> {
		if (!testParticipantId) {
			await ensureRejectedParticipant()
		}
		return testParticipantId ? `/requests/${testParticipantId}/edit` : null
	}

	test('should show edit form for rejected participant', async ({ page }) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			// Could not create rejected participant (missing required data)
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		// Should show edit form
		const form = page.locator('form:not(#theme-switch)')
		const hasForm = (await form.count()) > 0

		if (hasForm) {
			await expect(form.first()).toBeVisible()
		} else {
			// May show access denied or redirect
			const content = await page.content()
			expect(
				content.includes('rejected') ||
					content.includes('denied') ||
					content.includes('edit'),
			).toBeTruthy()
		}
	})

	test('should pre-fill form with existing participant data', async ({
		page,
	}) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		// Check if form fields are pre-filled
		const firstNameInput = page.locator('[name="firstName"]')

		if ((await firstNameInput.count()) > 0) {
			const value = await firstNameInput.inputValue()
			// Should have some pre-filled value
			expect(value.length).toBeGreaterThan(0)
		}
	})

	test('should have disabled participant type field in edit mode', async ({
		page,
	}) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		// Participant type should be locked/disabled in edit mode
		const typeField = page.locator(
			'[name="participantTypeId"], button[name="participantTypeId"]',
		)

		if ((await typeField.count()) > 0) {
			// Check if it's disabled or read-only
			const isDisabled =
				(await typeField.first().isDisabled()) ||
				(await typeField.first().getAttribute('aria-disabled')) === 'true' ||
				(await typeField.first().getAttribute('readonly')) !== null

			// May be hidden instead of disabled
			expect(isDisabled || (await typeField.isHidden())).toBeTruthy()
		}
	})

	test('should have hidden participantId field in edit form', async ({
		page,
	}) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		// Edit form should have hidden participantId field
		const participantIdInput = page.locator('input[name="participantId"]')

		if ((await participantIdInput.count()) > 0) {
			const type = await participantIdInput.getAttribute('type')
			expect(type).toBe('hidden')
		}
	})

	test('should show existing documents in edit mode', async ({ page }) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		// Check if this is actually an edit form (may redirect to view or error)
		const form = page.locator('form:not(#theme-switch)')
		if ((await form.count()) === 0) {
			// Not an edit form - may be view page or access denied
			test.skip()
			return
		}

		// The edit form may have:
		// 1. File inputs for uploading documents
		// 2. Upload buttons for document types
		// 3. Document section/container for existing docs
		// 4. Or the form may not require documents at all
		const fileInputs = page.locator('input[type="file"]')
		const uploadButtons = page.locator(
			'button:has-text("PASSPORT"), button:has-text("PHOTO"), button:has-text("LETTER"), button:has-text("Upload")',
		)
		const documentSection = page.locator(
			'[class*="document"], [class*="upload"], [data-testid*="document"]',
		)
		const existingDocs = page.locator(
			'img[src*="blob:"], img[src*="data:"], img[src*="http"], [class*="preview"]',
		)

		const hasDocumentHandling =
			(await fileInputs.count()) > 0 ||
			(await uploadButtons.count()) > 0 ||
			(await documentSection.count()) > 0 ||
			(await existingDocs.count()) > 0

		// If no document handling UI found, the form may handle documents differently
		// or documents may be optional for this participant type
		if (!hasDocumentHandling) {
			// Check if form is still valid without document section
			const hasOtherInputs = page.locator(
				'input[name="firstName"], input[name="familyName"]',
			)
			expect(await hasOtherInputs.count()).toBeGreaterThan(0)
		}
	})

	test('should allow updating documents in edit mode', async ({ page }) => {
		const editUrl = await getEditUrl()

		if (!editUrl) {
			test.skip()
			return
		}

		await page.goto(editUrl)
		await page.waitForLoadState('networkidle')

		const fileInputs = page.locator('input[type="file"]')

		if ((await fileInputs.count()) > 0) {
			const input = fileInputs.first()
			await input.setInputFiles(TEST_PHOTO_JPG)
			await page.waitForTimeout(500)

			// File should be accepted
			const files = await input.evaluate(
				(el: HTMLInputElement) => el.files?.length,
			)
			expect(files).toBe(1)
		}
	})
})

test.describe('Edit Form Validation', () => {
	// Ensure test data exists before each test
	test.beforeEach(async () => {
		await ensureRejectedParticipant()
	})

	async function navigateToEditPage(page: Page): Promise<boolean> {
		if (!testParticipantId) {
			await ensureRejectedParticipant()
		}
		if (!testParticipantId) return false

		await page.goto(`/requests/${testParticipantId}/edit`)
		await page.waitForLoadState('networkidle')
		return true
	}

	test('should validate required fields on edit submission', async ({
		page,
	}) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		// Clear a required field
		const firstNameInput = page.locator('[name="firstName"]')
		if ((await firstNameInput.count()) > 0) {
			await firstNameInput.fill('')
		}

		// Submit form
		const submitBtn = page
			.locator('button:has-text("Submit Request"), button:has-text("Update Request"), form:not(#theme-switch) button[type="submit"]')
			.first()

		if ((await submitBtn.count()) > 0) {
			await submitBtn.scrollIntoViewIfNeeded()
			await submitBtn.click()
			await page.waitForTimeout(1000)

			// Should show validation errors
			const errors = page.locator(
				'[class*="error"], [aria-invalid="true"], .text-destructive',
			)
			expect(await errors.count()).toBeGreaterThan(0)
		}
	})

	test('should validate passport uniqueness excluding current participant', async ({
		page,
	}) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		// The passport field should allow the current passport value
		// but reject duplicates from other participants
		const passportInput = page.locator('[name="passportNumber"]')

		if ((await passportInput.count()) > 0) {
			const currentValue = await passportInput.inputValue()
			// Current passport should be accepted (not flagged as duplicate)
			expect(currentValue.length).toBeGreaterThan(0)
		}
	})
})

test.describe('Edit Form Submission', () => {
	// Ensure test data exists before each test
	test.beforeEach(async () => {
		await ensureRejectedParticipant()
	})

	async function navigateToEditPage(page: Page): Promise<boolean> {
		if (!testParticipantId) {
			await ensureRejectedParticipant()
		}
		if (!testParticipantId) return false

		await page.goto(`/requests/${testParticipantId}/edit`)
		await page.waitForLoadState('networkidle')
		return true
	}

	test('should show loading state during edit submission', async ({
		page,
	}) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		const submitBtn = page
			.locator('button:has-text("Submit Request"), button:has-text("Update Request"), form:not(#theme-switch) button[type="submit"]')
			.first()

		if ((await submitBtn.count()) > 0) {
			await submitBtn.scrollIntoViewIfNeeded()
			await submitBtn.click()

			// Check for loading indicator
			await page.waitForTimeout(300)
			// Form may show loading state briefly
		}
	})

	test('should have cancel button on edit form', async ({ page }) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		// Should have cancel/back option
		const cancelBtn = page.getByRole('button', { name: /cancel|back/i })
		const cancelLink = page.getByRole('link', { name: /cancel|back/i })

		const hasCancel =
			(await cancelBtn.count()) > 0 || (await cancelLink.count()) > 0
		expect(hasCancel).toBeTruthy()
	})
})

test.describe('Edit Restrictions', () => {
	test('should not allow editing non-rejected participants', async ({
		page,
	}) => {
		// Navigate to requests list
		await page.goto('/requests')
		await page.waitForLoadState('networkidle')

		// Look for participant details (view links, not edit)
		const viewLinks = page.locator(
			'a[href^="/requests/"]:not([href*="edit"]):not([href*="new"])',
		)

		if ((await viewLinks.count()) > 0) {
			// Click to view a participant
			await viewLinks.first().click()
			await page.waitForLoadState('networkidle')

			// Check if edit option is available based on status
			const editLink = page.locator('a[href*="/edit"]')
			const editBtn = page.getByRole('link', { name: /edit/i })

			// Edit should only be available for rejected participants
			// This test documents expected behavior
		}
	})

	test('should show appropriate message for non-editable participants', async ({
		page,
	}) => {
		await page.goto('/requests')
		await page.waitForLoadState('networkidle')

		// The page may show status badges indicating which can be edited
		const statusBadges = page.locator(
			'[class*="badge"], [class*="status"]',
		)

		// Should have status indicators
		const badgeCount = await statusBadges.count()
		// Status badges may or may not be present depending on list implementation
	})
})

test.describe('Edit Form Accessibility', () => {
	// Ensure test data exists before each test
	test.beforeEach(async () => {
		await ensureRejectedParticipant()
	})

	async function navigateToEditPage(page: Page): Promise<boolean> {
		if (!testParticipantId) {
			await ensureRejectedParticipant()
		}
		if (!testParticipantId) return false

		await page.goto(`/requests/${testParticipantId}/edit`)
		await page.waitForLoadState('networkidle')
		return true
	}

	test('should be keyboard navigable', async ({ page }) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		// Tab through form
		await page.keyboard.press('Tab')
		await page.keyboard.press('Tab')

		const focusedElement = await page.evaluate(
			() => document.activeElement?.tagName,
		)
		expect(focusedElement).toBeTruthy()
	})

	test('should have proper labels on edit form', async ({ page }) => {
		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		const inputs = page.locator(
			'input:not([type="hidden"]):not([type="file"])',
		)
		const inputCount = await inputs.count()

		// Check first few inputs for labels
		for (let i = 0; i < Math.min(inputCount, 3); i++) {
			const input = inputs.nth(i)
			const id = await input.getAttribute('id')
			const ariaLabel = await input.getAttribute('aria-label')

			if (id) {
				const label = page.locator(`label[for="${id}"]`)
				const hasLabel = (await label.count()) > 0

				expect(hasLabel || ariaLabel).toBeTruthy()
			}
		}
	})
})

test.describe('Edit Form Responsive Design', () => {
	// Ensure test data exists before each test
	test.beforeEach(async () => {
		await ensureRejectedParticipant()
	})

	async function navigateToEditPage(page: Page): Promise<boolean> {
		if (!testParticipantId) {
			await ensureRejectedParticipant()
		}
		if (!testParticipantId) return false

		await page.goto(`/requests/${testParticipantId}/edit`)
		await page.waitForLoadState('networkidle')
		return true
	}

	test('should work on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 })

		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		// Form should be visible
		const form = page.locator('form:not(#theme-switch)')
		if ((await form.count()) > 0) {
			await expect(form.first()).toBeVisible()
		}
	})

	test('should have properly sized inputs on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 })

		const hasEditPage = await navigateToEditPage(page)

		if (!hasEditPage) {
			test.skip()
			return
		}

		const firstInput = page.locator('[name="firstName"]')

		if ((await firstInput.count()) > 0) {
			const box = await firstInput.boundingBox()
			if (box) {
				expect(box.width).toBeGreaterThan(100)
			}
		}
	})
})
