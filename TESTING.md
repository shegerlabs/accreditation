# Testing Guide

This document provides comprehensive documentation for the testing infrastructure in the Accreditation System.

## Table of Contents

- [Overview](#overview)
- [Test Stack](#test-stack)
- [Quick Start](#quick-start)
- [Directory Structure](#directory-structure)
- [E2E Tests with Playwright](#e2e-tests-with-playwright)
  - [Authentication Strategy](#authentication-strategy)
  - [Test Projects](#test-projects)
  - [Test Files](#test-files)
- [Unit & Integration Tests with Vitest](#unit--integration-tests-with-vitest)
- [Test Database Setup](#test-database-setup)
- [Environment Variables](#environment-variables)
- [Commands Reference](#commands-reference)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)

---

## Overview

The testing infrastructure uses a **three-tier approach**:

| Level | Tool | Purpose |
|-------|------|---------|
| **E2E** | Playwright | Full user flow testing in real browser |
| **Integration** | Vitest | Route loaders/actions, database operations |
| **Unit** | Vitest | Pure functions, validation schemas, utilities |

---

## Test Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | Latest | E2E browser testing |
| `vitest` | Latest | Unit/integration test runner |
| `@testing-library/react` | Latest | React component testing |
| `@testing-library/jest-dom` | Latest | DOM assertion matchers |
| `msw` | Latest | API mocking |
| `@remix-run/testing` | Latest | Remix route testing utilities |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the test database (creates test users & data)
npx prisma db seed

# 3. Run all E2E tests
npm run test:e2e

# 4. Run E2E tests with UI (interactive mode)
npm run test:e2e:ui

# 5. Run unit/integration tests
npm test

# 6. Run unit tests with coverage
npm run test:coverage
```

---

## Directory Structure

```
tests/
├── setup.ts                          # Vitest global setup (MSW, testing-library)
├── db-setup.ts                       # Test database utilities
├── mocks/
│   ├── server.ts                     # MSW server configuration
│   └── handlers.ts                   # API mock handlers
├── unit/
│   └── utils/
│       └── validation.test.ts        # Zod schema validation tests
├── integration/
│   └── routes/
│       └── requests-new.test.tsx     # Registration form loader/action tests
└── e2e/
    ├── .auth/
    │   └── user.json                 # Saved authentication state (auto-generated)
    ├── auth.setup.ts                 # Authentication setup (runs before tests)
    ├── auth.noauth.spec.ts           # Tests that run WITHOUT authentication
    └── registration.spec.ts          # Tests that run WITH authentication
```

---

## E2E Tests with Playwright

### Authentication Strategy

We use **Playwright's authentication fixtures** for efficient test execution:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Test Execution Flow                          │
├─────────────────────────────────────────────────────────────────┤
│  1. SETUP PROJECT runs first                                    │
│     └─> auth.setup.ts logs in once                              │
│     └─> Saves session to tests/e2e/.auth/user.json              │
│                                                                 │
│  2. CHROMIUM PROJECT runs authenticated tests                   │
│     └─> Loads saved session from user.json                      │
│     └─> All tests start already logged in                       │
│     └─> Skips *.noauth.spec.ts files                            │
│                                                                 │
│  3. CHROMIUM-NO-AUTH PROJECT runs unauthenticated tests         │
│     └─> No saved session loaded                                 │
│     └─> Only runs *.noauth.spec.ts files                        │
└─────────────────────────────────────────────────────────────────┘
```

**Why this approach?**
- Login only happens **once** per test run (not before every test)
- Tests run faster (no repeated login overhead)
- Session state is shared across all authenticated tests
- Clean separation between auth and no-auth test scenarios

### Test Projects

The `playwright.config.ts` defines three projects:

```typescript
projects: [
  // 1. Setup - runs authentication before other tests
  {
    name: 'setup',
    testMatch: /.*\.setup\.ts/,
  },

  // 2. Chromium - authenticated tests (depends on setup)
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'tests/e2e/.auth/user.json',  // Load saved session
    },
    dependencies: ['setup'],           // Wait for setup to complete
    testIgnore: /.*\.noauth\.spec\.ts/, // Skip noauth tests
  },

  // 3. Chromium No-Auth - unauthenticated tests
  {
    name: 'chromium-no-auth',
    use: { ...devices['Desktop Chrome'] },
    testMatch: /.*\.noauth\.spec\.ts/,  // Only run noauth tests
  },
],
```

### Test Files

#### `auth.setup.ts` - Authentication Setup

**Purpose:** Logs in once and saves session state for all authenticated tests.

```typescript
// Location: tests/e2e/auth.setup.ts

setup('authenticate', async ({ page }) => {
  // Uses test credentials (configurable via env vars)
  const username = process.env.TEST_USER_EMAIL || 'focal@test.com'
  const password = process.env.TEST_USER_PASSWORD || 'testpassword'

  // Navigate to login and authenticate
  await page.goto('/login')
  await page.fill('input[name="username"]', username)
  await page.fill('input[type="password"]', password)

  // Check "Remember me" for persistent session
  const rememberMe = page.getByText('Remember me')
  if (await rememberMe.isVisible()) {
    await rememberMe.click()
  }

  await page.getByRole('button', { name: 'Login' }).click()

  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/\/login/)

  // Save authentication state to file
  await page.context().storageState({ path: 'tests/e2e/.auth/user.json' })
})
```

**Key Points:**
- Runs before all authenticated tests (via `dependencies: ['setup']`)
- Saves cookies and localStorage to `user.json`
- Subsequent tests load this state automatically

---

#### `auth.noauth.spec.ts` - Unauthenticated Tests

**Purpose:** Tests that must run WITHOUT authentication (login page, public pages, error handling).

```typescript
// Location: tests/e2e/auth.noauth.spec.ts

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#login-form')).toBeVisible()
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="username"]', 'invalid@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.getByRole('button', { name: 'Login' }).click()

    // Should show error and stay on login page
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Error Handling', () => {
  test('should handle 404 pages gracefully', async ({ page }) => {
    await page.goto('/non-existent-page-12345')
    // Should show 404 or redirect, not crash
    await expect(page.locator('body')).toBeVisible()
  })
})
```

**Naming Convention:** Files must end with `.noauth.spec.ts` to be recognized.

---

#### `registration.spec.ts` - Authenticated Tests

**Purpose:** Tests the registration form and related functionality WITH authentication.

```typescript
// Location: tests/e2e/registration.spec.ts

// Test data IDs from seeded database
const tenantId = process.env.TEST_TENANT_ID || 'test'
const eventId = process.env.TEST_EVENT_ID || 'test'

test.describe('Events Page', () => {
  test('should display events list when authenticated', async ({ page }) => {
    await page.goto('/events')
    // Should NOT redirect to login (we're authenticated)
    const isLoginPage = await page.locator('#login-form').isVisible()
    expect(isLoginPage).toBe(false)
  })
})

test.describe('Registration Form Structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)
  })

  test('should have required form fields', async ({ page }) => {
    // Personal information fields
    await expect(page.locator('input[name="firstName"]')).toBeVisible()
    await expect(page.locator('input[name="familyName"]')).toBeVisible()

    // Professional info fields
    await expect(page.locator('input[name="organization"]')).toBeVisible()
    await expect(page.locator('input[name="jobTitle"]')).toBeVisible()
  })
})

test.describe('Form Validation', () => {
  test('should show validation errors for empty required fields', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    // Find and click submit button
    const submitBtn = page.locator('form button[type="submit"]').first()
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()

    // Should show validation errors
    const errorLocator = page.locator(
      '[class*="destructive"], [class*="error"], [aria-invalid="true"]'
    ).first()
    await expect(errorLocator).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Document Upload', () => {
  test('should have file upload fields', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)
    const fileInputs = page.locator('input[type="file"]')
    expect(await fileInputs.count()).toBeGreaterThanOrEqual(1)
  })

  test('should accept valid image file for photo', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    const photoInput = page.locator('input[type="file"]').first()
    if (await photoInput.isVisible()) {
      await photoInput.setInputFiles({
        name: 'test-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-content'),
      })

      const files = await photoInput.evaluate(
        (input: HTMLInputElement) => input.files?.length
      )
      expect(files).toBe(1)
    }
  })
})

test.describe('Accessibility', () => {
  test('should have proper form labels', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    const inputs = page.locator('input:not([type="hidden"]):not([type="file"])')
    const inputCount = await inputs.count()

    for (let i = 0; i < Math.min(inputCount, 5); i++) {
      const input = inputs.nth(i)
      const id = await input.getAttribute('id')

      if (id) {
        const label = page.locator(`label[for="${id}"]`)
        const hasLabel = (await label.count()) > 0
        const hasAriaLabel = (await input.getAttribute('aria-label')) !== null
        expect(hasLabel || hasAriaLabel).toBe(true)
      }
    }
  })

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    // Tab through the form
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })
})

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    // Form should be visible and usable
    await expect(page.locator('form:not(#theme-switch)').first()).toBeVisible()
  })

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(`/requests/new?tenantId=${tenantId}&eventId=${eventId}`)

    await expect(page.locator('form:not(#theme-switch)').first()).toBeVisible()
  })
})
```

---

## Unit & Integration Tests with Vitest

### Configuration (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.{test,spec}.{ts,tsx}', './app/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['./tests/e2e/**'],  // Exclude E2E tests (handled by Playwright)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**/*.{ts,tsx}'],
      exclude: ['app/**/*.d.ts', 'app/entry.*.tsx'],
    },
  },
})
```

### Test Setup (`tests/setup.ts`)

```typescript
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

// Reset handlers between tests
afterEach(() => server.resetHandlers())

// Close server after all tests
afterAll(() => server.close())
```

---

## Test Database Setup

### Seeding Test Data

The seed script creates test users and data required for E2E tests:

```bash
npx prisma db seed
```

**Output:**
```
Test Credentials:
  Focal User: focal@test.com / testpassword
  Regular User: user@test.com / testpassword

Test IDs for E2E tests:
  Tenant ID: cmkfyx5s60003twxp4alletaf
  Event ID: cmkfyx5wm000atwxp92p2cfch
```

### Test Users Created

| User | Email | Password | Role | Purpose |
|------|-------|----------|------|---------|
| Focal User | focal@test.com | testpassword | focal, user | Can create registrations for others |
| Regular User | user@test.com | testpassword | user | Can only self-register |

### Seed File Location

```typescript
// prisma/seed.ts

// Creates:
// - Test tenant (Test Organization)
// - Test event (Test Event)
// - Test participant type (Delegate)
// - Test invitation with quota
// - Test users with proper roles
```

---

## Environment Variables

### For E2E Tests

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_USER_EMAIL` | `focal@test.com` | Login email for auth setup |
| `TEST_USER_PASSWORD` | `testpassword` | Login password for auth setup |
| `TEST_TENANT_ID` | (from seed) | Tenant ID for registration tests |
| `TEST_EVENT_ID` | (from seed) | Event ID for registration tests |
| `SKIP_FINGERPRINT_CHECK` | `true` (in tests) | Bypasses session fingerprint validation |
| `PORT` | `5101` | Dev server port for tests |

### Fingerprint Bypass

The application validates session fingerprints (browser headers) for security. Since Playwright uses different browser contexts, this check is bypassed during E2E tests:

```typescript
// playwright.config.ts
webServer: {
  command: `PORT=${PORT} SKIP_FINGERPRINT_CHECK=true npm run dev`,
  // ...
}
```

```typescript
// app/utils/auth.server.ts
const skipFingerprintCheck = process.env.SKIP_FINGERPRINT_CHECK === 'true'
if (!skipFingerprintCheck) {
  // Validate fingerprint...
}
```

---

## Commands Reference

### E2E Tests (Playwright)

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run E2E tests with interactive UI
npm run test:e2e:ui

# Run specific test file
npx playwright test tests/e2e/registration.spec.ts

# Run tests matching pattern
npx playwright test -g "should display login"

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run only chromium project
npx playwright test --project=chromium

# Run only unauthenticated tests
npx playwright test --project=chromium-no-auth

# Debug tests (opens inspector)
npx playwright test --debug

# Generate test code by recording actions
npx playwright codegen http://localhost:5101

# View last test report
npx playwright show-report
```

### Unit/Integration Tests (Vitest)

```bash
# Run all unit/integration tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/unit/utils/validation.test.ts

# Run tests matching pattern
npm test -- -t "passport validation"
```

### Database Commands

```bash
# Seed database with test data
npx prisma db seed

# Reset database and re-seed
npx prisma db push --force-reset && npx prisma db seed

# Open Prisma Studio to inspect data
npx prisma studio
```

---

## Writing New Tests

### Adding an Authenticated E2E Test

1. Add test to `tests/e2e/registration.spec.ts` or create new `*.spec.ts` file
2. Tests automatically run with saved authentication state

```typescript
// tests/e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test('should do something when authenticated', async ({ page }) => {
    // User is already logged in!
    await page.goto('/protected-page')
    await expect(page.locator('h1')).toContainText('Welcome')
  })
})
```

### Adding an Unauthenticated E2E Test

1. Create file ending with `.noauth.spec.ts`
2. Tests run without any saved session

```typescript
// tests/e2e/public-pages.noauth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Public Pages', () => {
  test('should show public content', async ({ page }) => {
    // No authentication - fresh browser context
    await page.goto('/about')
    await expect(page.locator('h1')).toBeVisible()
  })
})
```

### Adding a Unit Test

```typescript
// tests/unit/utils/my-util.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '~/utils/my-util'

describe('myFunction', () => {
  it('should return correct value', () => {
    expect(myFunction('input')).toBe('expected output')
  })
})
```

### Existing Unit Test Files

#### `validations.source.test.ts` - Validation Schemas (100% coverage)

Tests the Zod validation schemas exported from `app/utils/validations.ts`:

```typescript
// Tests for:
- xssTransform()     // XSS sanitization
- UsernameSchema     // Username validation (3-100 chars, allowed characters)
- PasswordSchema     // Password strength (8+ chars, uppercase, lowercase, number, special)
- NameSchema         // Name validation (letters, spaces, hyphens, apostrophes)
- EmailSchema        // Email format validation
```

**Example tests:**
```typescript
it('should reject password without special character', () => {
  const result = PasswordSchema.safeParse('Password1')
  expect(result.success).toBe(false)
})

it('should sanitize XSS in username', () => {
  const result = xssTransform('<script>alert(1)</script>hello')
  expect(result).not.toContain('<script>')
})
```

#### `user.test.ts` - Permission & Role Utilities (100% coverage)

Tests permission parsing, role checking, and user hooks from `app/utils/user.ts`:

```typescript
// Tests for:
- useOptionalUser()        // Hook to get user or null (mocked)
- useUser()                // Hook to get user or throw (mocked)
- parsePermissionString()  // Parse "action:entity:access" strings
- userHasPermission()      // Check if user has specific permission
- userHasRole()            // Check if user has specific role
- userHasRoles()           // Check if user has any of given roles
```

**Example tests:**
```typescript
// Hook tests use vi.mock to mock useRouteLoaderData
it('should return user when data contains user', () => {
  mockUseRouteLoaderData.mockReturnValue({ user: mockUser })
  const result = useOptionalUser()
  expect(result).toEqual(mockUser)
})

it('should throw error when user is null', () => {
  mockUseRouteLoaderData.mockReturnValue({ user: null })
  expect(() => useUser()).toThrow('User not found')
})

it('should parse action, entity, and access levels', () => {
  const result = parsePermissionString('update:participant:own,any')
  expect(result).toEqual({
    action: 'update',
    entity: 'participant',
    access: ['own', 'any'],
  })
})

it('should return true when user has at least one of the roles', () => {
  const user = { roles: [{ name: 'editor' }] }
  expect(userHasRoles(user, ['admin', 'editor'])).toBe(true)
})
```

#### `misc.test.ts` - Utility Functions (100% coverage)

Tests pure utility functions and React hooks from `app/utils/misc.tsx`:

```typescript
// Pure functions:
- cn()                      // Tailwind class merging
- getErrorMessage()         // Extract error messages from various types
- getDomainUrl()            // Get domain from request
- getReferrerRoute()        // Get referrer route from request
- mergeHeaders()            // Merge header objects (override mode)
- combineHeaders()          // Combine header objects (append mode)
- combineResponses()        // Combine ResponseInit objects
- invariantResponse()       // Throw Response if condition fails
- invariant()               // Throw Error if condition fails
- getAttachmentFileSrc()    // Generate attachment URL path
- getParticipantDocumentFileSrc() // Generate participant doc URL path
- downloadFile()            // Download file with retries
- logger()                  // Console logging utility

// React hooks (mocked):
- useIsPending()            // Check if form is submitting
- useDelayedIsPending()     // Debounced pending state
- useDoubleCheck()          // Double-click confirmation
- useDebounce()             // Debounced callback
```

**Example tests:**
```typescript
it('should merge tailwind classes correctly', () => {
  const result = cn('px-2 py-1', 'px-4')
  expect(result).toBe('py-1 px-4') // px-4 overrides px-2
})

// Hook tests mock Remix and React hooks
it('should return true when navigation is pending', () => {
  mockUseNavigation.mockReturnValue({
    state: 'submitting',
    formAction: '/test-action',
    formMethod: 'POST',
  })
  expect(useIsPending()).toBe(true)
})

it('should debounce callback execution', async () => {
  vi.useFakeTimers()
  const callback = vi.fn()
  const debounced = useDebounce(callback, 300)
  debounced('arg1')
  debounced('arg2')
  vi.advanceTimersByTime(300)
  expect(callback).toHaveBeenCalledWith('arg2')
})
```

---

## Troubleshooting

### Common Issues

#### 1. "Session expired" or "Redirected to login" during tests

**Cause:** Session fingerprint validation failing due to different browser contexts.

**Solution:** Ensure `SKIP_FINGERPRINT_CHECK=true` is set in `playwright.config.ts`:

```typescript
webServer: {
  command: `PORT=${PORT} SKIP_FINGERPRINT_CHECK=true npm run dev`,
}
```

#### 2. Tests fail with "element not found" for form fields

**Cause:** Test data (tenant/event IDs) doesn't exist in database.

**Solution:** Run database seed:
```bash
npx prisma db seed
```

#### 3. Auth setup fails with "Login button not found"

**Cause:** Login form structure changed or has multiple forms.

**Solution:** Update selectors in `auth.setup.ts` to match current login page:
```typescript
// Use specific selectors
await expect(page.locator('#login-form')).toBeVisible()
await page.getByRole('button', { name: 'Login' }).click()
```

#### 4. Tests timeout waiting for elements

**Cause:** Page loads slowly or element never appears.

**Solution:**
- Increase timeout: `await expect(locator).toBeVisible({ timeout: 10000 })`
- Use `scrollIntoViewIfNeeded()` for elements below viewport
- Check if element exists with conditional logic

#### 5. "net::ERR_CONNECTION_REFUSED" error

**Cause:** Dev server not running or wrong port.

**Solution:**
- Let Playwright start the server automatically (default behavior)
- Or start dev server manually: `PORT=5101 SKIP_FINGERPRINT_CHECK=true npm run dev`

#### 6. Hydration errors in test output

**Cause:** Server/client HTML mismatch, often from empty data arrays.

**Solution:** Add guard clauses in components:
```typescript
if (!items || items.length === 0) {
  return <p>No items available</p>
}
```

### Debugging Tips

```bash
# Run single test with debug output
npx playwright test --debug -g "test name"

# Take screenshot at failure point
await page.screenshot({ path: 'debug-screenshot.png' })

# Pause execution to inspect
await page.pause()

# Log page content
console.log(await page.content())
```

### CI/CD Notes

For CI environments, set these in your workflow:

```yaml
env:
  CI: true
  SKIP_FINGERPRINT_CHECK: true
  TEST_USER_EMAIL: focal@test.com
  TEST_USER_PASSWORD: testpassword
```

---

## Test Coverage Goals

| Area | Target | Current |
|------|--------|---------|
| Registration Flow | 80% | In Progress |
| Authentication | 90% | Complete |
| Form Validation | 75% | **100%** (validations.ts) |
| User Utilities | 70% | **100%** (user.ts) |
| Misc Utilities | 50% | **100%** (misc.tsx) |
| Workflow Engine | 70% | Planned |

### Current Coverage by File

```
File               | % Stmts | % Branch | % Funcs | % Lines
-------------------|---------|----------|---------|--------
validations.ts     |   100%  |   100%   |   100%  |   100%
user.ts            |   100%  |   100%   |   100%  |   100%
misc.tsx           |   100%  |   100%   |   100%  |   100%
```

---

## Additional Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Testing Library](https://testing-library.com/docs/)
- [MSW (Mock Service Worker)](https://mswjs.io/docs/)
