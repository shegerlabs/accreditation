# Testing Guide

This document describes how to set up and run tests for the Accreditation System.

## Overview

The project uses three levels of testing:

| Type | Framework | Purpose |
|------|-----------|---------|
| Unit Tests | Vitest | Test pure functions, validation schemas, helpers |
| Integration Tests | Vitest + Prisma | Test database operations, loaders, actions |
| E2E Tests | Playwright | Test full user flows in browser |

## Quick Start

```bash
# Run all unit tests (no setup required)
npm run test:unit

# Run tests in watch mode
npm test

# Run with coverage report
npm run test:coverage

# Open Vitest UI
npm run test:ui
```

## Test Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all Vitest tests in watch mode |
| `npm run test:unit` | Run only unit tests |
| `npm run test:integration` | Run integration tests (skips DB tests if no database) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ui` | Open Vitest interactive UI |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Open Playwright interactive UI |
| `npm run test:all` | Run unit, integration, and E2E tests |

---

## Unit Tests

### Location
```
tests/unit/
├── utils/
│   └── validation.test.ts    # Form validation schemas
└── workflow/
    └── workflow.test.ts      # Workflow logic and state transitions
```

### Setup Required
**None** - Unit tests run without any external dependencies.

### Running
```bash
npm run test:unit
```

### What's Tested
- Zod validation schemas (passport, email, date of birth)
- Document attachment validation (file types, sizes)
- Workflow action mappings
- State transition logic

---

## Integration Tests

### Location
```
tests/integration/
└── routes/
    └── requests-new.test.tsx   # Registration form database operations
```

### Setup Required

Integration tests have two modes:

#### 1. Without Database (Default)
Tests that don't require a database will run automatically. Database-dependent tests are skipped.

```bash
npm run test:integration
```

#### 2. With Test Database
To run full integration tests including database operations:

**Step 1: Create Test Database**
```bash
# PostgreSQL
createdb accreditation_test

# Or using psql
psql -c "CREATE DATABASE accreditation_test;"
```

**Step 2: Set Environment Variable**
```bash
export TEST_DATABASE_URL="postgresql://username:password@localhost:5432/accreditation_test"
```

**Step 3: Push Schema to Test Database**
```bash
DATABASE_URL=$TEST_DATABASE_URL npx prisma db push
```

**Step 4: Run Tests**
```bash
npm run test:integration
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEST_DATABASE_URL` | For DB tests | PostgreSQL connection string for test database |
| `SKIP_DB_TESTS` | Optional | Set to `true` to explicitly skip database tests |

### What's Tested
- Participant creation and uniqueness constraints
- Invitation quota enforcement
- Workflow step creation and linking
- Document attachments
- Role-based validation logic

---

## E2E Tests

### Location
```
tests/e2e/
├── auth.setup.ts           # Authentication setup (runs first)
├── auth.noauth.spec.ts     # Unauthenticated tests (login, 404)
└── registration.spec.ts    # Authenticated registration flow tests
```

### Setup Required

**Step 1: Install Playwright Browsers**
```bash
npx playwright install chromium
# Or install all browsers
npx playwright install
```

**Step 2: Configure Test Credentials**

The E2E tests use Playwright's authentication fixtures. Tests that require login will use saved session state.

**Option A: Create test user in database (recommended)**
```bash
# Add a test user during database seeding with:
# Username/Email: focal@test.com
# Password: testpassword
```

**Option B: Use environment variables**
```bash
# Set credentials for an existing user
export TEST_USER_EMAIL="your-email@example.com"
export TEST_USER_PASSWORD="your-password"
```

**Step 3: Run E2E Tests**

There are two ways to run E2E tests:

#### Option A: Auto-start server (recommended for CI)
```bash
# Playwright will automatically start the dev server
npm run test:e2e
```

#### Option B: Manual server start (recommended for development)
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm run test:e2e
```

### Running Options

```bash
# Run all E2E tests (auto-starts dev server)
npm run test:e2e

# Run with browser visible
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e -- tests/e2e/registration.spec.ts

# Generate HTML report
npm run test:e2e -- --reporter=html
```

### Interactive UI Mode

**Important:** UI mode requires starting the dev server manually first.

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Open Playwright UI
npm run test:e2e:ui
```

The UI mode skips the automatic web server startup to avoid port conflicts.

### Debug Mode

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run in debug mode (step through tests)
npm run test:e2e:debug
```

### Test Projects

E2E tests are organized into three Playwright projects:

| Project | Description | Auth State |
|---------|-------------|------------|
| `setup` | Runs authentication setup first | Creates auth state |
| `chromium` | Main tests (registration flow) | Uses saved auth state |
| `chromium-no-auth` | Login/public page tests | No auth state |

### What's Tested
- Login page functionality
- Form field presence and validation
- File upload functionality
- Responsive design (mobile, tablet, desktop)
- Keyboard accessibility
- Error handling (404 pages)

### Test Reports
After running E2E tests, view the HTML report:
```bash
npx playwright show-report
```

---

## Test Database Setup (Detailed)

### Option 1: Local PostgreSQL

```bash
# 1. Create database
createdb accreditation_test

# 2. Create .env.test file
echo 'TEST_DATABASE_URL="postgresql://localhost:5432/accreditation_test"' > .env.test

# 3. Push schema
DATABASE_URL="postgresql://localhost:5432/accreditation_test" npx prisma db push

# 4. Run tests
source .env.test && npm run test:integration
```

### Option 2: Docker PostgreSQL

```bash
# 1. Start PostgreSQL container
docker run --name pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=accreditation_test -p 5433:5432 -d postgres:15

# 2. Wait for container to be ready
sleep 5

# 3. Push schema
DATABASE_URL="postgresql://postgres:test@localhost:5433/accreditation_test" npx prisma db push

# 4. Run tests
TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/accreditation_test" npm run test:integration

# 5. Cleanup
docker stop pg-test && docker rm pg-test
```

---

## Writing New Tests

### Unit Test Template

```typescript
// tests/unit/example.test.ts
import { describe, it, expect } from 'vitest'

describe('Feature Name', () => {
  describe('function/component name', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test'

      // Act
      const result = myFunction(input)

      // Assert
      expect(result).toBe('expected')
    })
  })
})
```

### Integration Test Template

```typescript
// tests/integration/routes/my-route.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const SKIP_DB_TESTS = !process.env.TEST_DATABASE_URL

describe('My Route Tests', () => {
  describe.skipIf(SKIP_DB_TESTS)('Database Operations', () => {
    let testPrisma: any
    let seedTestScenario: any

    beforeAll(async () => {
      const dbSetup = await import('../../db-setup')
      testPrisma = dbSetup.testPrisma
      seedTestScenario = dbSetup.seedTestScenario
      await testPrisma.$connect()
    })

    beforeEach(async () => {
      const { cleanupTestDatabase } = await import('../../db-setup')
      await cleanupTestDatabase()
    })

    afterAll(async () => {
      const { disconnectTestDatabase } = await import('../../db-setup')
      await disconnectTestDatabase()
    })

    it('should perform database operation', async () => {
      const scenario = await seedTestScenario()
      // Test database operations
    })
  })

  // Tests that don't need database
  describe('Validation Logic', () => {
    it('should validate input', () => {
      // Pure function tests
    })
  })
})
```

### E2E Test Template

```typescript
// tests/e2e/my-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup - navigate to page, login, etc.
    await page.goto('/my-page')
  })

  test('should complete user flow', async ({ page }) => {
    // Interact with page
    await page.fill('[name="field"]', 'value')
    await page.click('button[type="submit"]')

    // Assert result
    await expect(page.locator('.success')).toBeVisible()
  })
})
```

---

## CI/CD Integration

Tests run automatically on GitHub Actions for:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

### GitHub Actions Workflow

The workflow (`.github/workflows/test.yml`) runs:

1. **Unit & Integration Tests** - With PostgreSQL service container
2. **E2E Tests** - With Playwright and built application
3. **Type Check** - TypeScript compilation
4. **Lint** - ESLint checks

### Artifacts

After CI runs, you can download:
- `coverage-report` - Test coverage HTML report
- `playwright-report` - E2E test results
- `test-screenshots` - Screenshots from failed E2E tests

---

## Troubleshooting

### Tests Can't Find Files

Ensure you're running from the project root:
```bash
cd /path/to/accreditation
npm test
```

### Database Connection Errors

Check your `TEST_DATABASE_URL`:
```bash
echo $TEST_DATABASE_URL
# Should output: postgresql://user:pass@host:port/dbname
```

### Playwright Browser Not Found

Install browsers:
```bash
npx playwright install chromium
```

### E2E Tests Timeout

Increase timeout in `playwright.config.ts` or ensure dev server is running:
```bash
npm run dev
```

### MSW Handler Not Working

Check that handlers are registered in `tests/mocks/handlers.ts` and the server is started in `tests/setup.ts`.

---

## Coverage Reports

Generate and view coverage:

```bash
# Generate coverage
npm run test:coverage

# View HTML report (opens in browser)
open coverage/index.html
```

Coverage configuration is in `vitest.config.ts`:
- Reports: `text` (terminal) and `html` (browser)
- Includes: `app/**/*.{ts,tsx}`
- Excludes: `.d.ts` files, entry files

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
