# Testing Best Practices

This guide covers proven patterns and practices for writing maintainable, reliable tests.

## Table of Contents

1. [General Principles](#general-principles)
2. [Test Organization](#test-organization)
3. [Writing Good Tests](#writing-good-tests)
4. [Naming Conventions](#naming-conventions)
5. [Avoiding Flaky Tests](#avoiding-flaky-tests)
6. [Performance](#performance)
7. [Debugging Tests](#debugging-tests)
8. [CI/CD Integration](#cicd-integration)
9. [Test Maintenance](#test-maintenance)

---

## General Principles

### The FIRST Principles

Good tests follow the **FIRST** principles:

| Principle | Meaning | Example |
|-----------|---------|---------|
| **F**ast | Tests run quickly | Unit tests < 100ms |
| **I**ndependent | Tests don't depend on each other | No shared state |
| **R**epeatable | Same result every time | No random data |
| **S**elf-validating | Pass or fail, no manual checking | Clear assertions |
| **T**imely | Written with or before code | TDD approach |

### Test Behavior, Not Implementation

```typescript
// ❌ Tests implementation details
test('uses reduce to sum', () => {
  const spy = vi.spyOn(Array.prototype, 'reduce')
  sum([1, 2, 3])
  expect(spy).toHaveBeenCalled()
})

// ✅ Tests behavior
test('calculates sum correctly', () => {
  expect(sum([1, 2, 3])).toBe(6)
})
```

### One Assert Per Test (Generally)

```typescript
// ❌ Multiple unrelated assertions
test('user works', () => {
  expect(createUser({ name: 'John' }).name).toBe('John')
  expect(createUser({ age: 30 }).age).toBe(30)
  expect(createUser({ email: 'a@b.com' }).email).toBe('a@b.com')
})

// ✅ One concept per test
test('creates user with name', () => {
  expect(createUser({ name: 'John' }).name).toBe('John')
})

test('creates user with age', () => {
  expect(createUser({ age: 30 }).age).toBe(30)
})
```

**Exception**: Related assertions are fine together:

```typescript
// ✅ Related assertions are OK
test('returns user data', () => {
  const user = getUser(1)
  expect(user.id).toBe(1)
  expect(user.name).toBeDefined()
  expect(user.email).toContain('@')
})
```

---

## Test Organization

### The AAA Pattern

Every test should follow **Arrange-Act-Assert**:

```typescript
test('calculates total with tax', () => {
  // ARRANGE - Set up test data
  const cart = { items: [{ price: 100 }], taxRate: 0.1 }

  // ACT - Execute the code
  const total = calculateTotal(cart)

  // ASSERT - Verify the result
  expect(total).toBe(110)
})
```

### Describe Blocks for Grouping

```typescript
describe('ShoppingCart', () => {
  describe('addItem', () => {
    it('adds item to empty cart', () => { /* ... */ })
    it('adds item to cart with items', () => { /* ... */ })
    it('increments quantity if item exists', () => { /* ... */ })
  })

  describe('removeItem', () => {
    it('removes existing item', () => { /* ... */ })
    it('does nothing if item not found', () => { /* ... */ })
  })

  describe('calculateTotal', () => {
    it('returns 0 for empty cart', () => { /* ... */ })
    it('sums all item prices', () => { /* ... */ })
    it('applies discount code', () => { /* ... */ })
  })
})
```

### Test File Structure

```typescript
// 1. Imports
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { myFunction } from '~/utils/myFunction'

// 2. Mocks
vi.mock('~/utils/dependency')

// 3. Test Data Factories
function createTestUser(overrides = {}) {
  return { id: '1', name: 'Test', ...overrides }
}

// 4. Describe Block
describe('myFunction', () => {
  // 5. Setup/Teardown
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 6. Tests grouped by scenario
  describe('when input is valid', () => {
    it('returns expected result', () => { /* ... */ })
  })

  describe('when input is invalid', () => {
    it('throws appropriate error', () => { /* ... */ })
  })
})
```

---

## Writing Good Tests

### Use Descriptive Test Names

```typescript
// ❌ Vague names
test('works', () => { /* ... */ })
test('handles edge case', () => { /* ... */ })

// ✅ Descriptive names
test('returns empty array when no items match filter', () => { /* ... */ })
test('throws ValidationError when email format is invalid', () => { /* ... */ })
```

### Test Name Pattern

Use the pattern: `should [expected behavior] when [condition]`

```typescript
test('should return user when valid ID is provided')
test('should throw NotFoundError when user does not exist')
test('should send welcome email when user is created')
```

### Avoid Magic Numbers

```typescript
// ❌ Magic numbers
test('calculates tax', () => {
  expect(calculateTax(100)).toBe(110)
})

// ✅ Named constants
test('calculates tax', () => {
  const basePrice = 100
  const taxRate = 0.1
  const expectedTotal = basePrice * (1 + taxRate)

  expect(calculateTax(basePrice)).toBe(expectedTotal)
})
```

### Use Test Data Factories

```typescript
// Define once, use everywhere
function createMockUser(overrides = {}) {
  return {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

// Use in tests
test('displays admin badge for admin users', () => {
  const adminUser = createMockUser({ role: 'admin' })
  render(<UserBadge user={adminUser} />)
  expect(screen.getByText('Admin')).toBeInTheDocument()
})

test('hides admin badge for regular users', () => {
  const regularUser = createMockUser({ role: 'user' })
  render(<UserBadge user={regularUser} />)
  expect(screen.queryByText('Admin')).not.toBeInTheDocument()
})
```

---

## Naming Conventions

### File Names

```
tests/
├── unit/
│   └── utils/
│       ├── validation.test.ts    # Unit test
│       └── formatDate.test.ts
├── integration/
│   └── routes/
│       └── login.test.tsx        # Integration test
└── e2e/
    ├── auth.spec.ts              # E2E test
    └── registration.spec.ts
```

| Type | Pattern | Example |
|------|---------|---------|
| Unit | `*.test.ts` | `validation.test.ts` |
| Integration | `*.test.tsx` | `form.test.tsx` |
| E2E | `*.spec.ts` | `login.spec.ts` |
| No Auth E2E | `*.noauth.spec.ts` | `public.noauth.spec.ts` |

### Describe Block Names

```typescript
// Name after the module/function/component being tested
describe('validateEmail', () => { /* ... */ })
describe('UserProfile component', () => { /* ... */ })
describe('POST /api/users', () => { /* ... */ })
```

### Test Names

```typescript
// Describe expected behavior
it('returns true for valid email format')
it('throws error when password is too short')
it('redirects to dashboard after login')

// For edge cases, describe the scenario
it('handles empty input gracefully')
it('works with unicode characters')
it('survives concurrent updates')
```

---

## Avoiding Flaky Tests

Flaky tests pass sometimes and fail other times. They erode trust in your test suite.

### Common Causes and Solutions

#### 1. Race Conditions

```typescript
// ❌ Race condition
test('shows data', async () => {
  render(<DataLoader />)
  expect(screen.getByText('Data')).toBeInTheDocument()
})

// ✅ Wait for async
test('shows data', async () => {
  render(<DataLoader />)
  expect(await screen.findByText('Data')).toBeInTheDocument()
})
```

#### 2. Time Dependencies

```typescript
// ❌ Depends on real time
test('shows correct date', () => {
  render(<DateDisplay />)
  expect(screen.getByText('January 15, 2024')).toBeInTheDocument()
})

// ✅ Mock time
test('shows correct date', () => {
  vi.setSystemTime(new Date('2024-01-15'))
  render(<DateDisplay />)
  expect(screen.getByText('January 15, 2024')).toBeInTheDocument()
  vi.useRealTimers()
})
```

#### 3. Shared State

```typescript
// ❌ Tests share state
let counter = 0

test('first test', () => {
  counter++
  expect(counter).toBe(1)
})

test('second test', () => {
  counter++
  expect(counter).toBe(1)  // Fails! counter is 2
})

// ✅ Reset state
beforeEach(() => {
  counter = 0
})
```

#### 4. Order Dependencies

```typescript
// ❌ Tests depend on order
test('creates user', async () => {
  await createUser({ id: 1 })
})

test('gets user', async () => {
  const user = await getUser(1)  // Depends on first test!
  expect(user).toBeDefined()
})

// ✅ Each test sets up its own data
test('gets user', async () => {
  await createUser({ id: 1 })
  const user = await getUser(1)
  expect(user).toBeDefined()
})
```

#### 5. Network/External Dependencies

```typescript
// ❌ Depends on external API
test('fetches weather', async () => {
  const weather = await fetch('https://api.weather.com/current')
  expect(weather.temp).toBeDefined()
})

// ✅ Mock external calls
test('fetches weather', async () => {
  server.use(
    http.get('https://api.weather.com/current', () => {
      return HttpResponse.json({ temp: 72 })
    })
  )
  const weather = await fetchWeather()
  expect(weather.temp).toBe(72)
})
```

### Debugging Flaky Tests

1. **Run multiple times**: `npx vitest --repeat=10`
2. **Run in isolation**: `npx vitest tests/path/to/test.ts`
3. **Add logging**: Temporarily log state at key points
4. **Check for async issues**: Missing awaits, race conditions

---

## Performance

### Unit Test Performance

```typescript
// ❌ Slow: Creates new mock every test
describe('User', () => {
  it('test 1', () => {
    vi.mock('./database')  // Heavy operation
    // ...
  })

  it('test 2', () => {
    vi.mock('./database')  // Repeated!
    // ...
  })
})

// ✅ Fast: Mock once
vi.mock('./database')

describe('User', () => {
  it('test 1', () => { /* ... */ })
  it('test 2', () => { /* ... */ })
})
```

### E2E Test Performance

```typescript
// ❌ Slow: Logs in for every test
test('test 1', async ({ page }) => {
  await login(page)
  // ...
})

test('test 2', async ({ page }) => {
  await login(page)  // Repeated login!
  // ...
})

// ✅ Fast: Reuse auth state
// In playwright.config.ts
use: {
  storageState: 'tests/e2e/.auth/user.json',
}
```

### Parallel Execution

```typescript
// vitest.config.ts - runs tests in parallel by default

// playwright.config.ts
export default defineConfig({
  fullyParallel: true,  // Run tests in parallel
  workers: process.env.CI ? 1 : undefined,  // Single worker in CI
})
```

### Skip Slow Tests During Development

```typescript
// Mark slow tests
test.skip('integration test that takes 10 seconds', () => {
  // Only run in CI
})

// Or use test.skipIf
test.skipIf(process.env.FAST_TESTS)('slow test', () => {
  // Skipped when FAST_TESTS is set
})
```

---

## Debugging Tests

### Console Logging

```typescript
test('debug example', () => {
  const result = myFunction(input)
  console.log('Input:', input)
  console.log('Result:', result)
  expect(result).toBe(expected)
})
```

### Vitest Debug Mode

```bash
# Run with debugging
DEBUG=* npm test
```

### Playwright Debug Mode

```bash
# Interactive debugging
npm run test:e2e:debug

# UI mode
npm run test:e2e:ui
```

### Isolating Failures

```typescript
// Run only this test
test.only('isolate this test', () => {
  // ...
})

// Skip other tests
test.skip('skip this test', () => {
  // ...
})
```

### Testing Library Debug

```typescript
import { screen } from '@testing-library/react'

test('debug dom', () => {
  render(<MyComponent />)

  // Print entire DOM
  screen.debug()

  // Print specific element
  screen.debug(screen.getByRole('button'))
})
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run test:coverage
        env:
          CI: true

      - uses: codecov/codecov-action@v3
        with:
          files: coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npx playwright install --with-deps chromium

      - run: npm run test:e2e
        env:
          CI: true

      # Upload test artifacts on failure
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Pre-commit Hooks

```json
// package.json
{
  "scripts": {
    "precommit": "npm run test:unit"
  }
}
```

### Required Checks

In GitHub, require tests to pass before merging:

1. Go to Settings > Branches
2. Add branch protection rule for `main`
3. Require status checks: `unit-tests`, `e2e-tests`

---

## Test Maintenance

### Review Tests in Code Reviews

Include tests in code reviews:

- [ ] Tests cover the new functionality
- [ ] Tests are readable and maintainable
- [ ] No duplicate test coverage
- [ ] Edge cases are tested
- [ ] Tests run fast

### Refactor Tests with Code

When refactoring code, update tests:

```typescript
// Before: Tests internal implementation
test('uses cache', () => {
  expect(obj._cache).toBeDefined()
})

// After: Tests behavior
test('returns cached result', () => {
  const first = obj.getValue()
  const second = obj.getValue()
  expect(first).toBe(second)
})
```

### Delete Obsolete Tests

Remove tests for deleted features:

```typescript
// If the feature is removed, delete its tests
// Don't comment them out "just in case"
```

### Keep Test Data Updated

```typescript
// Use factories that default to valid values
function createUser(overrides = {}) {
  return {
    id: '1',
    name: 'Test',
    email: 'test@example.com',  // Keep email format valid
    ...overrides,
  }
}
```

---

## Quick Reference

### Test Command Cheat Sheet

```bash
# Unit tests
npm test                    # Watch mode
npm run test:unit          # Run once
npm run test:coverage      # With coverage

# E2E tests
npm run test:e2e           # Run all
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:debug     # Debug mode

# All tests
npm run test:all           # Unit + Integration + E2E
```

### Common Patterns

```typescript
// Test data factory
function createMock(overrides = {}) {
  return { ...defaults, ...overrides }
}

// AAA pattern
test('name', () => {
  // Arrange
  const input = 'test'

  // Act
  const result = myFunction(input)

  // Assert
  expect(result).toBe('expected')
})

// Async testing
test('async', async () => {
  await expect(asyncFn()).resolves.toBe('result')
})

// Error testing
test('throws', () => {
  expect(() => fn()).toThrow('message')
})
```

### Golden Rules

1. **One test = one concept**
2. **Test behavior, not implementation**
3. **Fast, isolated, repeatable**
4. **Clear names that describe expectations**
5. **Mock at boundaries, not internals**
6. **Keep tests as simple as possible**
7. **Maintain tests like production code**

---

## Further Reading

- **[Testing Overview](./00-testing-overview.md)** - Start here
- **[Unit Testing](./01-unit-testing.md)** - Fast, focused tests
- **[Integration Testing](./02-integration-testing.md)** - Component tests
- **[E2E Testing](./03-e2e-testing.md)** - Full flow tests
- **[Coverage](./04-test-coverage.md)** - Measuring coverage
- **[Mocking](./05-mocking.md)** - Faking dependencies
