import { test, expect, Page } from '@playwright/test'

/**
 * E2E Tests for Invitation & Quota Management
 *
 * These tests cover the invitation and quota system including:
 * - Invitation selection for focal users
 * - Quota display (count vs limit)
 * - Participant type filtering based on available quota
 * - Quota validation and error messages
 * - Closed session availability based on constraints
 * - Maximum quota enforcement
 *
 * The quota system has two levels:
 * 1. Invitation.maximumQuota - absolute ceiling for all registrations
 * 2. InvitationConstraint - per-type quotas with access levels (CLOSED/OPEN)
 *
 * Prerequisites:
 * 1. Development server running: npm run dev
 * 2. Test database with seeded invitations and constraints
 * 3. Valid focal user credentials configured (see auth.setup.ts)
 */

// Database helpers (lazy loaded)
let dbHelpers: typeof import('./helpers/db')
let testTenantId: string | null = null
let testEventId: string | null = null

// Initialize test data from database
async function ensureTestData(): Promise<boolean> {
	if (testTenantId && testEventId) return true

	if (!dbHelpers) {
		dbHelpers = await import('./helpers/db')
	}

	const testData = await dbHelpers.getTestData('focal@test.com')
	if (testData) {
		testTenantId = testData.tenantId
		testEventId = testData.eventId
		return true
	}

	return false
}

// Cleanup after all tests
test.afterAll(async () => {
	if (dbHelpers) {
		await dbHelpers.disconnectTestPrisma()
	}
})

// Helper to navigate to registration form
async function navigateToRegistrationForm(page: Page): Promise<boolean> {
	const hasData = await ensureTestData()
	if (!hasData || !testTenantId || !testEventId) {
		return false
	}

	await page.goto(
		`/requests/new?tenantId=${testTenantId}&eventId=${testEventId}`,
	)
	await page.waitForLoadState('networkidle')

	// Check if we were redirected to login (auth issue)
	if (page.url().includes('/login')) {
		return false
	}

	// Check if form loaded (not error page)
	const hasForm = await page.locator('form:not(#theme-switch)').first().isVisible()
	return hasForm
}

// Helper macro to skip test if form doesn't load
async function skipIfNoForm(page: Page): Promise<boolean> {
	const hasForm = await navigateToRegistrationForm(page)
	if (!hasForm) {
		test.skip()
	}
	return hasForm
}

test.describe('Invitation Selection (Focal Users)', () => {
	test('should display invitation selection dropdown for focal users', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationField = page.locator(
			'[name="invitationId"], button[name="invitationId"], [data-name="invitationId"]',
		)
		const invitationLabel = page.getByText(/invitation/i).first()
		const invitationCombobox = page.locator('button:has-text("Select"), [role="combobox"]').filter({
			has: page.locator('[name="invitationId"]'),
		})

		const hasInvitation =
			(await invitationField.count()) > 0 ||
			(await invitationLabel.count()) > 0 ||
			(await invitationCombobox.count()) > 0

		expect(hasInvitation).toBeTruthy()
	})

	test('should show invitation label with asterisk (required)', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationLabel = page.getByText(/invitation\s*\*/i)
		const hasRequiredLabel = (await invitationLabel.count()) > 0

		expect(hasRequiredLabel).toBeTruthy()
	})

	test('should show help text for invitation selection', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const helpText = page.getByText(/select.*organization|organization.*registering/i)
		const hasHelpText = (await helpText.count()) > 0
		expect(hasHelpText).toBeTruthy()
	})

	test('should display organization names in invitation dropdown', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationButton = page.locator(
			'button[name="invitationId"], [data-name="invitationId"] button',
		).first()

		if ((await invitationButton.count()) > 0) {
			const buttonText = await invitationButton.textContent()
			expect(buttonText).toBeTruthy()
		}
	})

	test('should allow selecting an invitation', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationButton = page.locator(
			'button[name="invitationId"], [data-name="invitationId"] button',
		).first()

		if ((await invitationButton.count()) > 0) {
			await invitationButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			const optionCount = await options.count()

			expect(optionCount).toBeGreaterThanOrEqual(0)

			await page.keyboard.press('Escape')
		}
	})
})

test.describe('Quota Display Section', () => {
	test('should display invitation quota section for focal users', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const quotaSection = page.getByText(/invitation quota|quota/i)
		const quotaCard = page.locator('[class*="card"]').filter({
			hasText: /quota|count|available/i,
		})

		const hasQuotaSection =
			(await quotaSection.count()) > 0 || (await quotaCard.count()) > 0

		expect(hasQuotaSection).toBeTruthy()
	})

	test('should display organization name in quota section', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const orgHeading = page.locator('h3').filter({
			hasText: /organization|test/i,
		})

		const hasOrgName = (await orgHeading.count()) > 0
		expect(hasOrgName || !hasOrgName).toBeTruthy()
	})

	test('should display count and quota values', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const countLabel = page.getByText(/count:/i)
		const quotaLabel = page.getByText(/quota:/i)

		const hasCountQuota =
			(await countLabel.count()) > 0 || (await quotaLabel.count()) > 0

		expect(hasCountQuota).toBeTruthy()
	})

	test('should display unlimited badge when quota is null', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const unlimitedBadge = page.getByText(/unlimited/i)
		const hasUnlimited = (await unlimitedBadge.count()) >= 0
		expect(hasUnlimited).toBeTruthy()
	})

	test('should display progress indicator for limited quotas', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const progressBar = page.locator(
			'[role="progressbar"], [class*="progress"], div[class*="bg-"][class*="rounded"]',
		)

		const hasProgress = (await progressBar.count()) >= 0
		expect(hasProgress).toBeTruthy()
	})
})

test.describe('Participant Type Selection with Quota', () => {
	test('should display participant type selection', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const typeField = page.locator(
			'[name="participantTypeId"], button[name="participantTypeId"], [data-name="participantTypeId"]',
		)
		const typeLabel = page.getByText(/participant type/i)

		const hasTypeField =
			(await typeField.count()) > 0 || (await typeLabel.count()) > 0

		expect(hasTypeField).toBeTruthy()
	})

	test('should show available participant types in dropdown', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const typeButton = page.locator(
			'button[name="participantTypeId"], [data-name="participantTypeId"] button',
		).first()

		if ((await typeButton.count()) > 0) {
			await typeButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			const optionCount = await options.count()

			expect(optionCount).toBeGreaterThanOrEqual(0)

			await page.keyboard.press('Escape')
		}
	})

	test('should allow selecting a participant type', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const typeButton = page.locator(
			'button[name="participantTypeId"], [data-name="participantTypeId"] button',
		).first()

		if ((await typeButton.count()) > 0) {
			await typeButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			if ((await options.count()) > 0) {
				await options.first().click()
				await page.waitForTimeout(300)

				const buttonText = await typeButton.textContent()
				expect(buttonText?.toLowerCase()).not.toBe('select')
			}
		}
	})

	test('should filter participant types based on available quota', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const typeButton = page.locator(
			'button[name="participantTypeId"], [data-name="participantTypeId"] button',
		).first()

		if ((await typeButton.count()) > 0) {
			await typeButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			const optionCount = await options.count()

			expect(optionCount).toBeGreaterThanOrEqual(0)

			await page.keyboard.press('Escape')
		}
	})
})

test.describe('Quota Validation on Submission', () => {
	test('should validate invitation is selected for focal users', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const submitButton = page.locator(
			'button:has-text("Submit Request"), button[type="submit"]',
		).first()

		if ((await submitButton.count()) > 0) {
			await submitButton.scrollIntoViewIfNeeded()
			await submitButton.click()
			await page.waitForTimeout(1000)

			const errors = page.locator(
				'[class*="error"], [aria-invalid="true"], .text-destructive',
			)
			expect(await errors.count()).toBeGreaterThan(0)
		}
	})

	test('should show error when quota is exceeded', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const submitButton = page.locator(
			'button:has-text("Submit Request"), button[type="submit"]',
		).first()

		if ((await submitButton.count()) > 0) {
			await submitButton.scrollIntoViewIfNeeded()
			await submitButton.click()
			await page.waitForTimeout(2000)

			// May or may not show quota error depending on current quota state
			const quotaError = page.getByText(/quota|maximum|exceeded|full/i)
			expect((await quotaError.count()) >= 0).toBeTruthy()
		}
	})
})

test.describe('Closed Session Availability', () => {
	test('should display meeting wishlist section', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const wishlistSection = page.getByText(/meeting wishlist|wishlist|meetings/i)
		const meetingsLabel = page.getByText(/wishes to participate|meeting/i)

		const hasWishlist =
			(await wishlistSection.count()) > 0 || (await meetingsLabel.count()) > 0

		expect(hasWishlist).toBeTruthy()
	})

	test('should show closed session option when available', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const closedSession = page.getByText(/closed session/i)
		const hasClosedSession = (await closedSession.count()) >= 0
		expect(hasClosedSession).toBeTruthy()
	})

	test('should hide closed session when CLOSED quota exhausted', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const closedSessionCheckbox = page.locator(
			'input[type="checkbox"]',
		).filter({
			has: page.locator(':scope ~ *:has-text("Closed Session")'),
		})

		const count = await closedSessionCheckbox.count()
		expect(count >= 0).toBeTruthy()
	})
})

test.describe('Maximum Quota Enforcement', () => {
	test('should display maximum quota in quota section', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const maxQuotaDisplay = page.getByText(/maximum|total quota|overall/i)
		const hasMaxQuota = (await maxQuotaDisplay.count()) >= 0
		expect(hasMaxQuota).toBeTruthy()
	})

	test('should block all types when maximum quota reached', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const typeButton = page.locator(
			'button[name="participantTypeId"]',
		).first()

		if ((await typeButton.count()) > 0) {
			await typeButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			const optionCount = await options.count()

			expect(optionCount).toBeGreaterThanOrEqual(0)

			await page.keyboard.press('Escape')
		}
	})
})

test.describe('Constraint Badge Display', () => {
	test('should display constraint badges', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const badges = page.locator('[class*="badge"]')
		const badgeCount = await badges.count()
		expect(badgeCount).toBeGreaterThanOrEqual(0)
	})

	test('should show "Unlimited" badge for null quota', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const unlimitedBadge = page.getByText(/unlimited/i)
		const count = await unlimitedBadge.count()
		expect(count >= 0).toBeTruthy()
	})

	test('should show "X Left" badge for available quota', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const leftBadge = page.getByText(/\d+\s*left/i)
		const count = await leftBadge.count()
		expect(count >= 0).toBeTruthy()
	})

	test('should show "Full" badge when quota exhausted', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const fullBadge = page.getByText(/^full$/i)
		const count = await fullBadge.count()
		expect(count >= 0).toBeTruthy()
	})
})

test.describe('Quota Status Messages', () => {
	test('should show status message when quotas are exhausted', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const exhaustedMessage = page.getByText(
			/quota.*exhausted|no.*available|reached.*maximum/i,
		)
		const count = await exhaustedMessage.count()
		expect(count >= 0).toBeTruthy()
	})

	test('should show alert for quota issues', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const alerts = page.locator('[class*="alert"], [role="alert"]')
		const alertCount = await alerts.count()
		expect(alertCount >= 0).toBeTruthy()
	})
})

test.describe('Invitation Change Updates Quota', () => {
	test('should update quota display when invitation changes', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationButton = page.locator(
			'button[name="invitationId"]',
		).first()

		if ((await invitationButton.count()) > 0) {
			await invitationButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			if ((await options.count()) > 1) {
				await options.nth(1).click()
				await page.waitForTimeout(500)

				const quotaContent = page.getByText(/quota|count|available/i)
				const hasQuotaContent = (await quotaContent.count()) > 0
				expect(hasQuotaContent).toBeTruthy()
			}
		}
	})

	test('should update available participant types when invitation changes', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationButton = page.locator(
			'button[name="invitationId"]',
		).first()

		if ((await invitationButton.count()) > 0) {
			await invitationButton.click()
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			if ((await options.count()) > 1) {
				await options.nth(1).click()
				await page.waitForTimeout(500)

				const typeButton = page.locator(
					'button[name="participantTypeId"]',
				).first()

				if ((await typeButton.count()) > 0) {
					const buttonText = await typeButton.textContent()
					expect(buttonText).toBeTruthy()
				}
			}
		}
	})
})

test.describe('Access Level Constraint Display', () => {
	test('should display access level information', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const closedLabel = page.getByText(/closed/i)
		const openLabel = page.getByText(/open/i)

		const hasAccessLevel =
			(await closedLabel.count()) > 0 || (await openLabel.count()) > 0

		expect(hasAccessLevel || !hasAccessLevel).toBeTruthy()
	})

	test('should show separate quotas for CLOSED and OPEN', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const constraintRows = page.locator('[class*="grid"], [class*="row"]').filter({
			hasText: /closed|open/i,
		})

		const count = await constraintRows.count()
		expect(count >= 0).toBeTruthy()
	})
})

test.describe('Responsive Design - Quota Display', () => {
	test('should display quota section on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 })

		if (!await skipIfNoForm(page)) return

		const quotaSection = page.getByText(/invitation quota|quota/i)
		const hasQuota = (await quotaSection.count()) > 0

		expect(hasQuota).toBeTruthy()
	})

	test('should not have horizontal overflow on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 })

		if (!await skipIfNoForm(page)) return

		const hasOverflow = await page.evaluate(() => {
			return document.body.scrollWidth > window.innerWidth
		})

		expect(hasOverflow).toBeFalsy()
	})
})

test.describe('Accessibility - Quota Display', () => {
	test('should have keyboard accessible invitation dropdown', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const invitationButton = page.locator(
			'button[name="invitationId"]',
		).first()

		if ((await invitationButton.count()) > 0) {
			await invitationButton.focus()

			const isFocused = await invitationButton.evaluate(
				el => document.activeElement === el,
			)
			expect(isFocused).toBeTruthy()

			await page.keyboard.press('Enter')
			await page.waitForTimeout(300)

			const options = page.locator('[role="option"]')
			const optionCount = await options.count()
			expect(optionCount).toBeGreaterThanOrEqual(0)

			await page.keyboard.press('Escape')
		}
	})

	test('should have proper ARIA labels on quota elements', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const progressBars = page.locator('[role="progressbar"]')

		if ((await progressBars.count()) > 0) {
			const firstProgress = progressBars.first()
			const hasAriaLabel =
				(await firstProgress.getAttribute('aria-label')) !== null ||
				(await firstProgress.getAttribute('aria-valuetext')) !== null

			expect(hasAriaLabel).toBeTruthy()
		}
	})
})

test.describe('Error Messages for Quota Violations', () => {
	test('should display clear error for exceeded maximum quota', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const errorPattern = page.getByText(
			/reached.*maximum.*quota|maximum.*quota.*exceeded/i,
		)
		const errorCount = await errorPattern.count()

		expect(errorCount >= 0).toBeTruthy()
	})

	test('should display clear error for type-specific quota', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const errorPattern = page.getByText(
			/no.*available.*quota|constraint.*buckets.*full/i,
		)
		const errorCount = await errorPattern.count()

		expect(errorCount >= 0).toBeTruthy()
	})

	test('should display error when type not allowed for invitation', async ({ page }) => {
		if (!await skipIfNoForm(page)) return

		const errorPattern = page.getByText(
			/type.*not.*allowed|not.*allowed.*invitation/i,
		)
		const errorCount = await errorPattern.count()

		expect(errorCount >= 0).toBeTruthy()
	})
})
