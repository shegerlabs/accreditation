# Unit Testing with Vitest

This guide covers everything you need to know about writing unit tests in this project using **Vitest**.

## Table of Contents

1. [What is a Unit Test?](#what-is-a-unit-test)
2. [Vitest Basics](#vitest-basics)
3. [Writing Your First Test](#writing-your-first-test)
4. [Test Structure](#test-structure)
5. [Assertions (expect)](#assertions-expect)
6. [Mocking](#mocking)
7. [Testing React Hooks](#testing-react-hooks)
8. [Async Testing](#async-testing)
9. [Real Examples from This Project](#real-examples-from-this-project)
10. [Running Unit Tests](#running-unit-tests)

---

## What is a Unit Test?

A **unit test** tests a single "unit" of code in isolation. A unit is typically:
- A function
- A class method
- A React hook
- A utility module

### Key Characteristics

| Characteristic | Description |
|----------------|-------------|
| **Fast** | Runs in milliseconds |
| **Isolated** | No database, network, or file system |
| **Focused** | Tests one thing at a time |
| **Repeatable** | Same result every time |

### What Makes a Good Unit Test?

```typescript
// ✅ GOOD: Tests one specific behavior
test('getErrorMessage returns string for Error object', () => {
  const error = new Error('Something went wrong')
  expect(getErrorMessage(error)).toBe('Something went wrong')
})

// ❌ BAD: Tests multiple things
test('getErrorMessage works', () => {
  expect(getErrorMessage('text')).toBe('text')
  expect(getErrorMessage(new Error('msg'))).toBe('msg')
  expect(getErrorMessage(null)).toBe('Unknown Error')
  expect(getErrorMessage({ message: 'hi' })).toBe('hi')
})
```

---

## Vitest Basics

### Configuration

Our Vitest configuration is in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use global test functions (no need to import)
    globals: true,

    // Simulate browser environment
    environment: 'jsdom',

    // Run this file before all tests
    setupFiles: ['./tests/setup.ts'],

    // Where to find tests
    include: ['./tests/**/*.{test,spec}.{ts,tsx}', './app/**/*.{test,spec}.{ts,tsx}'],

    // Skip E2E tests (Playwright handles those)
    exclude: ['./tests/e2e/**', '**/node_modules/**'],

    // Test timeout
    testTimeout: 10000,
  },
})
```

### Key Configuration Options Explained

| Option | Purpose |
|--------|---------|
| `globals: true` | Use `test`, `expect`, `describe` without importing |
| `environment: 'jsdom'` | Simulate browser APIs (DOM, localStorage, etc.) |
| `setupFiles` | Files to run before tests (setup mocks, etc.) |
| `include` | Patterns to find test files |
| `exclude` | Patterns to ignore |

---

## Writing Your First Test

### Step 1: Create a Test File

Test files follow the naming convention: `*.test.ts` or `*.spec.ts`

```
tests/
└── unit/
    └── utils/
        └── my-function.test.ts   ← Your test file
```

### Step 2: Write the Test

```typescript
// tests/unit/utils/my-function.test.ts

import { describe, it, expect } from 'vitest'
import { myFunction } from '~/utils/my-function'

describe('myFunction', () => {
  it('should return the expected result', () => {
    const result = myFunction('input')
    expect(result).toBe('expected output')
  })
})
```

### Step 3: Run the Test

```bash
npm test
```

---

## Test Structure

### The Anatomy of a Test File

```typescript
// 1. Imports
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { functionToTest } from '~/utils/my-module'

// 2. Mocks (if needed)
vi.mock('~/utils/some-dependency', () => ({
  someDependency: vi.fn(),
}))

// 3. Test Suite
describe('functionToTest', () => {
  // 4. Setup (runs before each test)
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 5. Teardown (runs after each test)
  afterEach(() => {
    vi.resetAllMocks()
  })

  // 6. Test Cases
  it('should do something specific', () => {
    // Arrange
    const input = 'test'

    // Act
    const result = functionToTest(input)

    // Assert
    expect(result).toBe('expected')
  })

  // 7. Nested describe for grouping related tests
  describe('when input is invalid', () => {
    it('should throw an error', () => {
      expect(() => functionToTest(null)).toThrow()
    })
  })
})
```

### The AAA Pattern

Every test should follow the **AAA pattern**:

```typescript
it('should calculate total with tax', () => {
  // ARRANGE - Set up test data
  const price = 100
  const taxRate = 0.1

  // ACT - Execute the code being tested
  const total = calculateTotalWithTax(price, taxRate)

  // ASSERT - Verify the result
  expect(total).toBe(110)
})
```

### Lifecycle Hooks

| Hook | When it runs |
|------|--------------|
| `beforeAll` | Once before all tests in a `describe` |
| `afterAll` | Once after all tests in a `describe` |
| `beforeEach` | Before each test in a `describe` |
| `afterEach` | After each test in a `describe` |

```typescript
describe('Database operations', () => {
  beforeAll(async () => {
    // Connect to database once
    await db.connect()
  })

  afterAll(async () => {
    // Disconnect after all tests
    await db.disconnect()
  })

  beforeEach(async () => {
    // Clear data before each test
    await db.clear()
  })

  afterEach(() => {
    // Reset mocks after each test
    vi.clearAllMocks()
  })
})
```

---

## Assertions (expect)

Vitest uses `expect` for assertions. Here are the most common matchers:

### Equality

```typescript
// Exact equality (===)
expect(value).toBe(5)

// Deep equality (for objects/arrays)
expect(obj).toEqual({ name: 'John' })

// Loose equality
expect(value).toBeCloseTo(0.3, 5) // For floating point
```

### Truthiness

```typescript
expect(value).toBeTruthy()      // Truthy value
expect(value).toBeFalsy()       // Falsy value
expect(value).toBeNull()        // Exactly null
expect(value).toBeUndefined()   // Exactly undefined
expect(value).toBeDefined()     // Not undefined
```

### Numbers

```typescript
expect(value).toBeGreaterThan(5)
expect(value).toBeGreaterThanOrEqual(5)
expect(value).toBeLessThan(10)
expect(value).toBeLessThanOrEqual(10)
```

### Strings

```typescript
expect(str).toMatch(/pattern/)      // Regex match
expect(str).toContain('substring')  // Contains substring
expect(str).toHaveLength(5)         // String length
```

### Arrays

```typescript
expect(array).toContain(item)       // Contains item
expect(array).toHaveLength(3)       // Array length
expect(array).toContainEqual({ id: 1 }) // Deep equality
```

### Objects

```typescript
expect(obj).toHaveProperty('name')           // Has property
expect(obj).toHaveProperty('name', 'John')   // Has property with value
expect(obj).toMatchObject({ name: 'John' })  // Partial match
```

### Errors

```typescript
// Function throws
expect(() => myFunction()).toThrow()
expect(() => myFunction()).toThrow('error message')
expect(() => myFunction()).toThrow(CustomError)

// Async function throws
await expect(asyncFunction()).rejects.toThrow()
```

### Negation

Add `.not` to negate any matcher:

```typescript
expect(value).not.toBe(5)
expect(array).not.toContain(item)
expect(() => fn()).not.toThrow()
```

---

## Mocking

**Mocking** replaces real implementations with fake ones for testing.

### Why Mock?

1. **Isolate the unit**: Test only the function, not its dependencies
2. **Control behavior**: Make dependencies return specific values
3. **Speed**: Avoid slow operations (network, database)
4. **Reliability**: No flaky tests from external services

### Mocking Functions

```typescript
import { vi } from 'vitest'

// Create a mock function
const mockFn = vi.fn()

// Call it
mockFn('arg1', 'arg2')

// Check calls
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledTimes(1)
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
```

### Mocking Return Values

```typescript
const mockFn = vi.fn()

// Return a value
mockFn.mockReturnValue('result')
expect(mockFn()).toBe('result')

// Return different values
mockFn.mockReturnValueOnce('first').mockReturnValueOnce('second')
expect(mockFn()).toBe('first')
expect(mockFn()).toBe('second')

// Async return
mockFn.mockResolvedValue('async result')
await expect(mockFn()).resolves.toBe('async result')
```

### Mocking Modules

```typescript
// Mock an entire module
vi.mock('~/utils/api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
  saveUser: vi.fn().mockResolvedValue(true),
}))

// Import after mocking
import { fetchUser } from '~/utils/api'

test('uses mocked fetchUser', async () => {
  const user = await fetchUser(1)
  expect(user.name).toBe('John')
})
```

### Spying on Functions

**Spies** track calls without replacing the implementation:

```typescript
const obj = {
  method: (x: number) => x * 2,
}

// Create a spy
const spy = vi.spyOn(obj, 'method')

// Call the real method
const result = obj.method(5)

// Method still works
expect(result).toBe(10)

// But we can track calls
expect(spy).toHaveBeenCalledWith(5)
```

### Clearing Mocks

```typescript
beforeEach(() => {
  vi.clearAllMocks()   // Clear call history
})

afterEach(() => {
  vi.resetAllMocks()   // Reset to original state
  vi.restoreAllMocks() // Restore original implementations
})
```

---

## Testing React Hooks

### Custom Hook Testing

```typescript
import { renderHook, act } from '@testing-library/react'
import { useCounter } from '~/hooks/useCounter'

test('useCounter increments', () => {
  // Render the hook
  const { result } = renderHook(() => useCounter())

  // Initial value
  expect(result.current.count).toBe(0)

  // Trigger state change
  act(() => {
    result.current.increment()
  })

  // Updated value
  expect(result.current.count).toBe(1)
})
```

### Example from This Project

From `tests/unit/utils/misc.test.ts`:

```typescript
describe('useIsPending', () => {
  it('should return true when navigation is pending and matches form action', () => {
    // Mock Remix hooks
    mockUseFormAction.mockReturnValue('/test-action')
    mockUseNavigation.mockReturnValue({
      state: 'submitting',
      formAction: '/test-action',
      formMethod: 'POST',
    })

    const result = useIsPending()
    expect(result).toBe(true)
  })

  it('should return false when navigation is idle', () => {
    mockUseFormAction.mockReturnValue('/test-action')
    mockUseNavigation.mockReturnValue({
      state: 'idle',
      formAction: '/test-action',
      formMethod: 'POST',
    })

    const result = useIsPending()
    expect(result).toBe(false)
  })
})
```

---

## Async Testing

### Testing Promises

```typescript
// Using async/await
test('fetches user data', async () => {
  const user = await fetchUser(1)
  expect(user.name).toBe('John')
})

// Using .resolves
test('fetches user data', async () => {
  await expect(fetchUser(1)).resolves.toEqual({ id: 1, name: 'John' })
})

// Testing rejections
test('handles errors', async () => {
  await expect(fetchUser(-1)).rejects.toThrow('User not found')
})
```

### Testing Timers

```typescript
import { vi } from 'vitest'

test('debounce delays execution', () => {
  // Use fake timers
  vi.useFakeTimers()

  const callback = vi.fn()
  const debounced = debounce(callback, 300)

  // Call multiple times quickly
  debounced()
  debounced()
  debounced()

  // Not called yet
  expect(callback).not.toHaveBeenCalled()

  // Fast forward time
  vi.advanceTimersByTime(300)

  // Now called once
  expect(callback).toHaveBeenCalledTimes(1)

  // Restore real timers
  vi.useRealTimers()
})
```

---

## Real Examples from This Project

### Example 1: Testing Utility Functions

From `tests/unit/utils/misc.test.ts`:

```typescript
describe('cn (className utility)', () => {
  it('should merge class names', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('should handle conditional classes', () => {
    const result = cn('base', true && 'included', false && 'excluded')
    expect(result).toBe('base included')
  })

  it('should merge tailwind classes correctly', () => {
    // Tailwind merge: later classes override earlier conflicting ones
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })
})
```

### Example 2: Testing Error Handling

```typescript
describe('getErrorMessage', () => {
  it('should return string error as-is', () => {
    const result = getErrorMessage('This is an error')
    expect(result).toBe('This is an error')
  })

  it('should extract message from Error object', () => {
    const error = new Error('Something went wrong')
    const result = getErrorMessage(error)
    expect(result).toBe('Something went wrong')
  })

  it('should return "Unknown Error" for null', () => {
    // Suppress console.error during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = getErrorMessage(null)
    expect(result).toBe('Unknown Error')

    consoleSpy.mockRestore()
  })
})
```

### Example 3: Testing with Mocked Dependencies

```typescript
describe('downloadFile', () => {
  // Save original fetch
  const originalFetch = global.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Replace fetch with mock
    mockFetch = vi.fn()
    global.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch
  })

  it('should download file successfully', async () => {
    // Arrange: Set up mock response
    const mockBlob = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: () => Promise.resolve(mockBlob),
    })

    // Act
    const result = await downloadFile('https://example.com/image.png')

    // Assert
    expect(result.contentType).toBe('image/png')
    expect(result.blob).toBeInstanceOf(Buffer)
  })

  it('should retry on failure', async () => {
    // Fail first, succeed second
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })

    const result = await downloadFile('https://example.com/image.png')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.contentType).toBe('image/png')
  })
})
```

---

## Running Unit Tests

### Commands

```bash
# Run all unit tests
npm run test:unit

# Run all tests in watch mode (re-runs on file changes)
npm test

# Run tests for a specific file
npm test -- tests/unit/utils/misc.test.ts

# Run tests matching a pattern
npm test -- --grep "getErrorMessage"

# Run with verbose output
npm test -- --reporter=verbose

# Run with coverage
npm run test:coverage
```

### Watch Mode

When running `npm test`, Vitest enters **watch mode**:

```
Press a to run all tests.
Press f to run only failed tests.
Press u to update snapshots.
Press p to filter by filename.
Press t to filter by test name.
Press q to quit.
```

### Debugging

1. **Add console.log**: Simplest approach for quick debugging
2. **Use `test.only`**: Run only one test
   ```typescript
   test.only('this test runs', () => { /* ... */ })
   test('this test is skipped', () => { /* ... */ })
   ```
3. **Use `test.skip`**: Skip a test temporarily
   ```typescript
   test.skip('work in progress', () => { /* ... */ })
   ```

---

## Common Patterns

### Testing Multiple Inputs

```typescript
describe('isValidEmail', () => {
  test.each([
    ['valid@email.com', true],
    ['invalid-email', false],
    ['@missing.local', false],
    ['no@domain', false],
    ['test@example.co.uk', true],
  ])('isValidEmail(%s) returns %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected)
  })
})
```

### Testing Error Boundaries

```typescript
describe('invariant', () => {
  it('should not throw when condition is truthy', () => {
    expect(() => invariant(true, 'Error')).not.toThrow()
  })

  it('should throw Error when condition is falsy', () => {
    expect(() => invariant(false, 'Error message')).toThrow(Error)
  })

  it('should include message in thrown error', () => {
    try {
      invariant(false, 'Custom error')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toBe('Custom error')
    }
  })
})
```

---

## Troubleshooting

### "Cannot find module"

Make sure the path alias is configured in `vitest.config.ts`:

```typescript
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  // ...
})
```

### "ReferenceError: document is not defined"

Add jsdom environment:

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
})
```

### Mocks Not Working

Make sure mocks are defined before imports:

```typescript
// ✅ Correct order
vi.mock('~/utils/api')
import { fetchUser } from '~/utils/api'

// ❌ Wrong order (mock won't work)
import { fetchUser } from '~/utils/api'
vi.mock('~/utils/api')
```

---

## Next Steps

- **[Integration Testing Guide](./02-integration-testing.md)** - Test components together
- **[Mocking Guide](./05-mocking.md)** - Advanced mocking techniques
- **[Coverage Guide](./04-test-coverage.md)** - Measure test coverage
