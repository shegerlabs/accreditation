# End-to-End Testing with Playwright

This guide covers E2E testing - testing complete user flows in a real browser.

## Table of Contents

1. [What is E2E Testing?](#what-is-e2e-testing)
2. [Playwright Basics](#playwright-basics)
3. [Project Configuration](#project-configuration)
4. [Writing E2E Tests](#writing-e2e-tests)
5. [Page Object Model](#page-object-model)
6. [Authentication](#authentication)
7. [Database Helpers](#database-helpers)
8. [Real Examples from This Project](#real-examples-from-this-project)
9. [Running E2E Tests](#running-e2e-tests)
10. [Debugging](#debugging)

---

## What is E2E Testing?

**End-to-End (E2E) tests** verify complete user flows from start to finish in a real browser. They simulate exactly what a user would do.

### What E2E Tests Cover

```
┌─────────────────────────────────────────────────────────┐
│                      E2E Test                           │
│                                                         │
│  Browser  ──▶  Frontend  ──▶  Backend  ──▶  Database   │
│     │             │             │              │        │
│     └─────────────┴─────────────┴──────────────┘        │
│           Tests the entire application                  │
└─────────────────────────────────────────────────────────┘
```

### When to Use E2E Tests

| Use E2E For | Don't Use E2E For |
|-------------|-------------------|
| Critical user flows | Edge cases |
| Login/authentication | Unit logic |
| Registration flows | Component styling |
| Payment processes | API response formats |
| Core business features | Performance testing |

### E2E vs Other Tests

| Aspect | Unit Test | Integration Test | E2E Test |
|--------|-----------|------------------|----------|
| Speed | Fast (ms) | Medium (s) | Slow (s-min) |
| Scope | One function | Multiple units | Entire app |
| Reliability | Very stable | Stable | Can be flaky |
| Maintenance | Easy | Medium | Higher |
| Realism | Low | Medium | High |

---

## Playwright Basics

**Playwright** is a browser automation framework by Microsoft that supports:
- Chrome, Firefox, Safari
- Mobile emulation
- Screenshots and videos
- Network interception
- Parallel execution

### Core Concepts

#### 1. Test Structure

```typescript
import { test, expect } from '@playwright/test'

test('user can log in', async ({ page }) => {
  // Navigate to page
  await page.goto('/login')

  // Fill form
  await page.fill('[name="email"]', 'user@example.com')
  await page.fill('[name="password"]', 'password123')

  // Click button
  await page.click('button[type="submit"]')

  // Assert result
  await expect(page).toHaveURL('/dashboard')
})
```

#### 2. The Page Object

The `page` object represents a browser tab. Key methods:

| Method | Purpose |
|--------|---------|
| `page.goto(url)` | Navigate to URL |
| `page.fill(selector, text)` | Type text into input |
| `page.click(selector)` | Click element |
| `page.locator(selector)` | Find element(s) |
| `page.waitForURL(url)` | Wait for navigation |
| `page.screenshot()` | Take screenshot |

#### 3. Locators

Locators find elements on the page:

```typescript
// CSS selector
page.locator('button.submit')

// Text content
page.locator('text=Submit')

// By role (recommended)
page.getByRole('button', { name: 'Submit' })

// By label
page.getByLabel('Email')

// By placeholder
page.getByPlaceholder('Enter email')

// By test ID
page.getByTestId('submit-btn')
```

#### 4. Assertions

```typescript
// Page URL
await expect(page).toHaveURL('/dashboard')

// Page title
await expect(page).toHaveTitle('Dashboard')

// Element visibility
await expect(page.locator('.alert')).toBeVisible()

// Element text
await expect(page.locator('h1')).toHaveText('Welcome')

// Element count
await expect(page.locator('.item')).toHaveCount(5)

// Element attribute
await expect(page.locator('input')).toHaveAttribute('type', 'email')
```

---

## Project Configuration

### Playwright Config (playwright.config.ts)

```typescript
import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PORT || 5101
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  // Where tests are located
  testDir: './tests/e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail CI if test.only is committed
  forbidOnly: !!process.env.CI,

  // Retry failed tests in CI
  retries: process.env.CI ? 2 : 0,

  // Number of parallel workers
  workers: process.env.CI ? 1 : undefined,

  // Report format
  reporter: [['html', { open: 'never' }]],

  // Shared settings for all tests
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',      // Record trace on failure
    screenshot: 'only-on-failure', // Screenshot on failure
  },

  // Test projects (different configurations)
  projects: [
    // Authentication setup - runs first
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Main tests - require authentication
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',  // Use saved auth
      },
      dependencies: ['setup'],      // Run after setup
      testIgnore: /.*\.noauth\.spec\.ts/,  // Skip no-auth tests
    },

    // Tests without authentication (login page, public pages)
    {
      name: 'chromium-no-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.noauth\.spec\.ts/,
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120000,
  },
})
```

### Key Configuration Explained

| Option | Purpose |
|--------|---------|
| `testDir` | Where E2E tests are located |
| `fullyParallel` | Run tests in parallel for speed |
| `retries` | Retry failed tests (helps with flakiness) |
| `baseURL` | Base URL for `page.goto('/')` |
| `storageState` | Load saved authentication |
| `webServer` | Start app before tests |

---

## Writing E2E Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Runs before each test
    await page.goto('/feature')
  })

  test('should do something', async ({ page }) => {
    // Test steps here
  })

  test('should handle error case', async ({ page }) => {
    // Another test
  })
})
```

### Complete Example: Login Flow

```typescript
import { test, expect } from '@playwright/test'

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('should login with valid credentials', async ({ page }) => {
    // Fill the form
    await page.fill('[name="email"]', 'user@example.com')
    await page.fill('[name="password"]', 'password123')

    // Submit
    await page.click('button[type="submit"]')

    // Wait for redirect
    await page.waitForURL('/dashboard')

    // Verify logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('[name="email"]', 'user@example.com')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('.error-message')).toContainText('Invalid')

    // Should stay on login page
    await expect(page).toHaveURL('/login')
  })

  test('should validate required fields', async ({ page }) => {
    // Submit empty form
    await page.click('button[type="submit"]')

    // Should show validation errors
    await expect(page.locator('text=Email is required')).toBeVisible()
    await expect(page.locator('text=Password is required')).toBeVisible()
  })
})
```

### Waiting Strategies

```typescript
// Wait for navigation
await page.waitForURL('/dashboard')

// Wait for element
await page.waitForSelector('.loading', { state: 'hidden' })

// Wait for network idle
await page.waitForLoadState('networkidle')

// Wait for specific condition
await page.waitForFunction(() => {
  return document.querySelectorAll('.item').length > 0
})

// Explicit timeout
await page.waitForTimeout(1000)  // Use sparingly!
```

---

## Page Object Model

For larger test suites, use the **Page Object Model** to organize code.

### What is Page Object Model?

Instead of duplicating selectors and actions across tests, encapsulate them in classes:

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('[name="email"]')
    this.passwordInput = page.locator('[name="password"]')
    this.submitButton = page.getByRole('button', { name: 'Login' })
    this.errorMessage = page.locator('.error-message')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
```

### Using Page Objects in Tests

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page)

    await loginPage.goto()
    await loginPage.login('user@example.com', 'password123')

    await expect(page).toHaveURL('/dashboard')
  })

  test('should show error for invalid login', async ({ page }) => {
    const loginPage = new LoginPage(page)

    await loginPage.goto()
    await loginPage.login('user@example.com', 'wrong')

    await expect(loginPage.errorMessage).toBeVisible()
  })
})
```

---

## Authentication

### The Authentication Setup

This project uses a **setup project** to handle authentication once:

```typescript
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const authFile = 'tests/e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  const username = process.env.TEST_USER_EMAIL || 'focal@test.com'
  const password = process.env.TEST_USER_PASSWORD || 'testpassword'

  // Go to login page
  await page.goto('/login')

  // Wait for form
  await expect(page.locator('#login-form')).toBeVisible()

  // Fill credentials
  await page.fill('input[name="username"]', username)
  await page.fill('input[type="password"]', password)

  // Submit
  await page.getByRole('button', { name: 'Login' }).click()

  // Wait for successful login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })

  // Save authentication state
  await page.context().storageState({ path: authFile })
})
```

### How It Works

1. **Setup runs first**: The `auth.setup.ts` runs before other tests
2. **State is saved**: Login session is saved to `.auth/user.json`
3. **Tests reuse state**: Other tests load this file via `storageState`
4. **No repeated logins**: Each test starts already logged in

### Tests Without Authentication

For testing login pages or public pages:

```typescript
// tests/e2e/login.noauth.spec.ts
// Note: filename includes ".noauth." - this runs without auth

import { test, expect } from '@playwright/test'

test('login page displays correctly', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await expect(page.locator('input[name="email"]')).toBeVisible()
})
```

---

## Database Helpers

For complex tests, we use **database helpers** to set up test data.

### Helper Functions (tests/e2e/helpers/db.ts)

```typescript
import { PrismaClient } from '@prisma/client'

// Singleton Prisma client
let prismaClient: PrismaClient | null = null

export function getTestPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    })
  }
  return prismaClient
}

export async function disconnectTestPrisma(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect()
    prismaClient = null
  }
}

// Get user by email
export async function getUserByEmail(email: string) {
  const prisma = getTestPrisma()
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  })
}

// Create test data
export async function createRejectedParticipant(userId: string) {
  const prisma = getTestPrisma()
  // ... create participant in database
  return { participantId: 'new-id' }
}
```

### Using Helpers in Tests

```typescript
// tests/e2e/registration-edit.spec.ts
import { test, expect } from '@playwright/test'

let dbHelpers: typeof import('./helpers/db')
let testParticipantId: string | null = null

async function ensureTestData(): Promise<string | null> {
  if (!dbHelpers) {
    dbHelpers = await import('./helpers/db')
  }

  const user = await dbHelpers.getUserByEmail('focal@test.com')
  if (!user) return null

  const existing = await dbHelpers.getRejectedParticipant(user.id)
  if (existing) {
    testParticipantId = existing.id
    return existing.id
  }

  const result = await dbHelpers.createRejectedParticipant(user.id)
  testParticipantId = result?.participantId ?? null
  return testParticipantId
}

test.describe('Edit Form', () => {
  test.beforeEach(async () => {
    await ensureTestData()
  })

  test.afterAll(async () => {
    if (dbHelpers) {
      await dbHelpers.disconnectTestPrisma()
    }
  })

  test('should show edit form for rejected participant', async ({ page }) => {
    if (!testParticipantId) {
      test.skip()
      return
    }

    await page.goto(`/requests/${testParticipantId}/edit`)
    await expect(page.locator('form')).toBeVisible()
  })
})
```

---

## Real Examples from This Project

### Example 1: Registration Flow Test

```typescript
// tests/e2e/registration.spec.ts
import { test, expect } from '@playwright/test'
import path from 'path'

const TEST_TENANT_ID = process.env.TEST_TENANT_ID
const TEST_EVENT_ID = process.env.TEST_EVENT_ID

test.describe('Registration Flow', () => {
  test('should complete full registration', async ({ page }) => {
    // Navigate to registration
    await page.goto(`/requests/new?tenantId=${TEST_TENANT_ID}&eventId=${TEST_EVENT_ID}`)
    await page.waitForLoadState('networkidle')

    // Select invitation
    const invitationSelect = page.locator('button[name="invitationId"]')
    await invitationSelect.click()
    await page.locator('[role="option"]').first().click()

    // Fill personal information
    await page.fill('[name="firstName"]', 'John')
    await page.fill('[name="familyName"]', 'Doe')
    await page.fill('[name="passportNumber"]', 'AB123456')

    // Upload photo
    const photoInput = page.locator('input[type="file"]').first()
    await photoInput.setInputFiles(
      path.join(__dirname, '../fixtures/test-photo.jpg')
    )

    // Submit
    await page.click('button[type="submit"]')

    // Verify success
    await expect(page.locator('.success-message')).toBeVisible()
  })

  test('should prevent duplicate passport registration', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${TEST_TENANT_ID}&eventId=${TEST_EVENT_ID}`)

    // Fill form with existing passport
    await page.fill('[name="passportNumber"]', 'EXISTING123')
    await page.click('button[type="submit"]')

    // Should show error
    await expect(page.locator('text=already registered')).toBeVisible()
  })
})
```

### Example 2: Workflow Status Test

```typescript
// tests/e2e/workflow-approvals.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Workflow Status Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests')
    await page.waitForLoadState('networkidle')
  })

  test('should display status filter dropdown', async ({ page }) => {
    const statusFilter = page.locator('button:has-text("Status")')
    await expect(statusFilter).toBeVisible()

    // Open dropdown
    await statusFilter.click()

    // Check options
    await expect(page.getByText(/in progress/i)).toBeVisible()
    await expect(page.getByText(/rejected/i)).toBeVisible()
    await expect(page.getByText(/approved/i)).toBeVisible()

    // Close dropdown
    await page.keyboard.press('Escape')
  })

  test('should filter by rejected status', async ({ page }) => {
    // Open status filter
    await page.locator('button:has-text("Status")').click()

    // Select rejected
    await page.getByText(/rejected/i).click()

    // Wait for filter to apply
    await page.waitForLoadState('networkidle')

    // Verify filtered results
    const statusBadges = page.locator('.badge:has-text("Rejected")')
    const count = await statusBadges.count()
    if (count > 0) {
      // All visible badges should be "Rejected"
      for (let i = 0; i < count; i++) {
        await expect(statusBadges.nth(i)).toContainText('Rejected')
      }
    }
  })
})
```

### Example 3: 2FA Flow Test

```typescript
// tests/e2e/login-logout.noauth.spec.ts
import { test, expect } from '@playwright/test'

let dbHelpers: typeof import('./helpers/db')
let totpHelpers: typeof import('./helpers/totp')

test.describe('Two-Factor Authentication Flow', () => {
  test.describe.configure({ mode: 'serial' })  // Run sequentially

  test.beforeAll(async () => {
    dbHelpers = await import('./helpers/db')
    totpHelpers = await import('./helpers/totp')
  })

  test('should enable 2FA', async ({ page }) => {
    // Setup: Ensure 2FA is disabled
    const user = await dbHelpers.getUserByEmail('focal@test.com')
    await dbHelpers.disable2FAForUser(user.id)

    // Login
    await page.goto('/login')
    await page.fill('[name="username"]', 'focal@test.com')
    await page.fill('[name="password"]', 'testpassword')
    await page.click('button[type="submit"]')

    // Navigate to settings
    await page.goto('/settings/two-factor')

    // Enable 2FA
    await page.click('button:has-text("Enable")')

    // Get the secret and generate valid code
    const verification = await dbHelpers.get2FAVerification(user.id)
    const validCode = totpHelpers.generateValidTOTPCode({
      secret: verification.secret,
    })

    // Enter the code
    await page.getByLabel('Code').fill(validCode)
    await page.getByRole('button', { name: 'Submit' }).click()

    // Verify success
    await expect(page.getByText('2FA enabled')).toBeVisible()
  })
})
```

---

## Running E2E Tests

### Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run with visual UI (great for debugging)
npm run test:e2e:ui

# Run in debug mode (step through tests)
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/registration.spec.ts

# Run tests with specific browser
npx playwright test --project=chromium

# Run in headed mode (see browser)
npx playwright test --headed

# Generate HTML report
npx playwright show-report
```

### Environment Variables

```bash
# Test credentials
TEST_USER_EMAIL=focal@test.com
TEST_USER_PASSWORD=testpassword

# Test data IDs
TEST_TENANT_ID=your-tenant-id
TEST_EVENT_ID=your-event-id
```

---

## Debugging

### 1. Playwright UI Mode

```bash
npm run test:e2e:ui
```

This opens an interactive UI where you can:
- See test execution step by step
- Inspect DOM at each step
- View network requests
- Time travel through test

### 2. Debug Mode

```bash
npm run test:e2e:debug
```

Opens browser with Playwright Inspector:
- Set breakpoints
- Step through actions
- Inspect elements

### 3. Screenshots and Traces

On failure, Playwright automatically captures:
- Screenshot
- Trace file (viewable with `npx playwright show-trace trace.zip`)

### 4. Console Logging

```typescript
test('debug example', async ({ page }) => {
  // Listen to console logs
  page.on('console', msg => console.log('Browser log:', msg.text()))

  await page.goto('/mypage')

  // Pause for manual inspection
  await page.pause()
})
```

### 5. Common Issues

| Issue | Solution |
|-------|----------|
| Element not found | Use `await page.waitForSelector()` |
| Test flaky | Add explicit waits, use `networkidle` |
| Auth not working | Check `.auth/user.json` exists |
| Timeout | Increase timeout in config |

---

## Best Practices

### 1. Use Meaningful Selectors

```typescript
// ❌ Fragile
await page.click('.btn-primary')

// ✅ Semantic
await page.getByRole('button', { name: 'Submit' })
```

### 2. Wait for State, Not Time

```typescript
// ❌ Arbitrary wait
await page.waitForTimeout(2000)

// ✅ Wait for condition
await page.waitForLoadState('networkidle')
```

### 3. Clean Up Test Data

```typescript
test.afterAll(async () => {
  await dbHelpers.cleanupTestData()
  await dbHelpers.disconnectTestPrisma()
})
```

### 4. Use Serial Mode for Dependent Tests

```typescript
test.describe('Dependent tests', () => {
  test.describe.configure({ mode: 'serial' })

  test('first creates data', async ({ page }) => { /* ... */ })
  test('second uses data', async ({ page }) => { /* ... */ })
})
```

---

## Next Steps

- **[Coverage Guide](./04-test-coverage.md)** - Measure test coverage
- **[Mocking Guide](./05-mocking.md)** - Mock external services
- **[Best Practices Guide](./06-best-practices.md)** - Testing patterns
