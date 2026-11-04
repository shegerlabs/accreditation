# Mocking Guide

This guide covers mocking - replacing real implementations with controlled fakes for testing.

## Table of Contents

1. [What is Mocking?](#what-is-mocking)
2. [Why Mock?](#why-mock)
3. [Vitest Mocking](#vitest-mocking)
4. [MSW for API Mocking](#msw-for-api-mocking)
5. [Mocking in This Project](#mocking-in-this-project)
6. [Advanced Patterns](#advanced-patterns)
7. [Common Mistakes](#common-mistakes)
8. [Best Practices](#best-practices)

---

## What is Mocking?

**Mocking** replaces real code with fake implementations that you control. It's like using a stunt double in a movie - they look real but are safer and more predictable.

### Types of Test Doubles

| Type | Description | Use Case |
|------|-------------|----------|
| **Mock** | Fake with expectations | Verify function was called |
| **Stub** | Fake with preset returns | Return specific values |
| **Spy** | Watches real function | Track calls without replacing |
| **Fake** | Working simplified version | In-memory database |

### Visual Example

```
┌──────────────────────────────────────────────────────────────┐
│                        Without Mock                          │
│                                                              │
│  Your Code  ────────▶  Real Database  ────────▶  Real Data  │
│     │                      │                         │       │
│     └──────────────────────┴─────────────────────────┘       │
│         Slow, Unreliable, Hard to Control                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                         With Mock                            │
│                                                              │
│  Your Code  ────────▶  Mock Database  ────────▶  Fake Data  │
│     │                      │                         │       │
│     └──────────────────────┴─────────────────────────┘       │
│         Fast, Reliable, Controllable                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Why Mock?

### 1. **Isolation**

Test only the code you're testing, not its dependencies.

```typescript
// Without mock: Testing getUser also tests the database
async function getUser(id: string) {
  return await db.users.findById(id)  // Real database call
}

// With mock: Test getUser in isolation
vi.mock('./db', () => ({
  db: {
    users: {
      findById: vi.fn().mockResolvedValue({ id: '1', name: 'John' })
    }
  }
}))
```

### 2. **Speed**

Mocks are instant; real APIs/databases are slow.

```typescript
// Real API: 200-500ms
const user = await fetch('/api/users/1')

// Mocked API: <1ms
const user = await mockFetch('/api/users/1')
```

### 3. **Reliability**

Real services can be down or return unexpected data.

```typescript
// Real: May fail due to network issues
// Mock: Always returns what you expect
vi.fn().mockResolvedValue({ success: true })
```

### 4. **Control**

Test edge cases that are hard to reproduce.

```typescript
// How do you test a network timeout with real APIs?
// With mocks, easy:
vi.fn().mockRejectedValue(new Error('Network timeout'))
```

---

## Vitest Mocking

### Basic Mock Function

```typescript
import { vi } from 'vitest'

// Create a mock function
const mockFn = vi.fn()

// Call it
mockFn('arg1', 'arg2')

// Check it was called
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenCalledTimes(1)
```

### Mock Return Values

```typescript
const mockFn = vi.fn()

// Return a value
mockFn.mockReturnValue('result')
expect(mockFn()).toBe('result')

// Return once, then different value
mockFn
  .mockReturnValueOnce('first')
  .mockReturnValueOnce('second')
  .mockReturnValue('default')

expect(mockFn()).toBe('first')
expect(mockFn()).toBe('second')
expect(mockFn()).toBe('default')
expect(mockFn()).toBe('default')
```

### Mock Async Functions

```typescript
const mockAsync = vi.fn()

// Resolve with value
mockAsync.mockResolvedValue({ data: 'result' })
await expect(mockAsync()).resolves.toEqual({ data: 'result' })

// Reject with error
mockAsync.mockRejectedValue(new Error('Failed'))
await expect(mockAsync()).rejects.toThrow('Failed')

// Chain different responses
mockAsync
  .mockResolvedValueOnce({ data: 'first' })
  .mockRejectedValueOnce(new Error('error'))
  .mockResolvedValue({ data: 'default' })
```

### Mock Implementations

```typescript
const mockFn = vi.fn()

// Custom implementation
mockFn.mockImplementation((x: number) => x * 2)
expect(mockFn(5)).toBe(10)

// One-time implementation
mockFn.mockImplementationOnce((x: number) => x * 3)
expect(mockFn(5)).toBe(15)  // Uses mockImplementationOnce
expect(mockFn(5)).toBe(10)  // Falls back to mockImplementation
```

### Mocking Modules

```typescript
// Mock an entire module
vi.mock('~/utils/api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
  saveUser: vi.fn().mockResolvedValue(true),
}))

// Now imports will use the mocks
import { fetchUser, saveUser } from '~/utils/api'

test('uses mocked module', async () => {
  const user = await fetchUser(1)
  expect(user.name).toBe('John')
})
```

### Spying on Functions

```typescript
const obj = {
  method: (x: number) => x * 2,
}

// Create a spy (tracks calls but keeps original implementation)
const spy = vi.spyOn(obj, 'method')

// Real method still works
expect(obj.method(5)).toBe(10)

// But we can track calls
expect(spy).toHaveBeenCalledWith(5)

// We can also override the implementation
spy.mockImplementation((x) => x * 3)
expect(obj.method(5)).toBe(15)

// Restore original
spy.mockRestore()
expect(obj.method(5)).toBe(10)
```

### Clearing and Resetting Mocks

```typescript
beforeEach(() => {
  vi.clearAllMocks()   // Clear call history, keep implementation
})

afterEach(() => {
  vi.resetAllMocks()   // Clear history AND reset implementation
})

afterAll(() => {
  vi.restoreAllMocks() // Restore original implementations
})
```

---

## MSW for API Mocking

**MSW (Mock Service Worker)** intercepts HTTP requests at the network level.

### How MSW Works

```
┌─────────────────────────────────────────────────────────────┐
│                        With MSW                             │
│                                                             │
│  Your Code  ──▶  fetch('/api/user')  ──▶  MSW Interceptor  │
│                         │                       │           │
│                         └───────────────────────┘           │
│                            Returns mock response            │
│                            (never hits real server)         │
└─────────────────────────────────────────────────────────────┘
```

### Setup (Already configured in this project)

**1. Define Handlers (tests/mocks/handlers.ts)**

```typescript
import { http, HttpResponse } from 'msw'

export const handlers = [
  // Mock POST request
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string }

    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        user: { id: 'test-user-id', email: 'test@example.com' },
      })
    }

    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    )
  }),

  // Mock GET request with URL parameter
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'John Doe',
    })
  }),

  // Mock with query parameters
  http.get('/api/search', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    return HttpResponse.json({
      results: [{ name: `Result for ${query}` }],
    })
  }),
]
```

**2. Create Server (tests/mocks/server.ts)**

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

**3. Setup Before Tests (tests/setup.ts)**

```typescript
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers after each test (clears per-test overrides)
afterEach(() => {
  server.resetHandlers()
})

// Stop server after all tests
afterAll(() => {
  server.close()
})
```

### Using MSW in Tests

**Default Handler**

```typescript
test('fetches user', async () => {
  const response = await fetch('/api/users/123')
  const user = await response.json()

  expect(user.name).toBe('John Doe')  // Uses default handler
})
```

**Override Handler for Specific Test**

```typescript
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

test('handles server error', async () => {
  // Override default handler for this test only
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.json(
        { error: 'Server error' },
        { status: 500 }
      )
    })
  )

  const response = await fetch('/api/users/123')
  expect(response.status).toBe(500)

  // After this test, resetHandlers() in afterEach restores default
})
```

**Test Network Errors**

```typescript
test('handles network failure', async () => {
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.error()
    })
  )

  await expect(fetch('/api/users/123')).rejects.toThrow()
})
```

**Test Delayed Responses**

```typescript
import { delay } from 'msw'

test('shows loading state', async () => {
  server.use(
    http.get('/api/users/:id', async () => {
      await delay(1000)  // 1 second delay
      return HttpResponse.json({ name: 'John' })
    })
  )

  // Test that loading spinner appears during delay
})
```

---

## Mocking in This Project

### Project Mock Structure

```
tests/
├── mocks/
│   ├── handlers.ts     # API endpoint handlers
│   ├── server.ts       # MSW server for Node
│   ├── browser.ts      # MSW server for browser
│   └── resend.ts       # Email service mock
└── setup.ts            # Global setup (starts MSW)
```

### Existing Handlers

From `tests/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw'

export const handlers = [
  // Authentication
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string }

    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
      })
    }

    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }),

  // Invitations
  http.get('/api/invitations', () => {
    return HttpResponse.json({
      invitations: [
        { id: 'inv-1', organization: 'Test Organization', maximumQuota: 10 },
      ],
    })
  }),

  // Participant types
  http.get('/api/participant-types', () => {
    return HttpResponse.json({
      participantTypes: [
        { id: 'pt-1', name: 'Delegate' },
        { id: 'pt-2', name: 'Observer' },
        { id: 'pt-3', name: 'Press' },
      ],
    })
  }),
]
```

### Mocking Remix Hooks

From `tests/unit/utils/misc.test.ts`:

```typescript
// Mock Remix hooks
const mockUseFormAction = vi.fn()
const mockUseNavigation = vi.fn()

vi.mock('@remix-run/react', () => ({
  useFormAction: () => mockUseFormAction(),
  useNavigation: () => mockUseNavigation(),
}))

// Use in tests
test('useIsPending returns true when submitting', () => {
  mockUseFormAction.mockReturnValue('/test-action')
  mockUseNavigation.mockReturnValue({
    state: 'submitting',
    formAction: '/test-action',
    formMethod: 'POST',
  })

  const result = useIsPending()
  expect(result).toBe(true)
})
```

### Mocking React Hooks

```typescript
// Mock useState, useRef, etc.
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useState: (initial: any) => [mockState, mockSetState],
    useRef: (initial: any) => ({ current: mockRefValue }),
    useEffect: (fn: () => void) => fn(),
  }
})
```

---

## Advanced Patterns

### 1. Factory Functions for Mocks

```typescript
// Create reusable mock factories
function createMockUser(overrides = {}) {
  return {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  }
}

function createMockInvitation(overrides = {}) {
  return {
    id: 'inv-1',
    organization: 'Test Org',
    maximumQuota: 10,
    participants: [],
    ...overrides,
  }
}

// Use in tests
test('displays user info', () => {
  const user = createMockUser({ name: 'John Doe' })
  render(<UserProfile user={user} />)
  expect(screen.getByText('John Doe')).toBeInTheDocument()
})
```

### 2. Partial Mocks

```typescript
// Only mock specific functions, keep others real
vi.mock('~/utils/api', async () => {
  const actual = await vi.importActual('~/utils/api')
  return {
    ...actual,
    // Only mock this function
    fetchUser: vi.fn().mockResolvedValue({ id: 1 }),
  }
})
```

### 3. Dynamic Mocks

```typescript
// Change mock behavior based on input
const mockFetch = vi.fn().mockImplementation((url) => {
  if (url.includes('/users')) {
    return Promise.resolve({ json: () => ({ name: 'User' }) })
  }
  if (url.includes('/posts')) {
    return Promise.resolve({ json: () => ({ title: 'Post' }) })
  }
  return Promise.reject(new Error('Unknown endpoint'))
})
```

### 4. Capturing Mock Arguments

```typescript
test('calls API with correct data', async () => {
  const mockSave = vi.fn().mockResolvedValue({ success: true })

  await saveUser(mockSave, { name: 'John', email: 'john@example.com' })

  // Check exactly what was passed
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'John',
      email: 'john@example.com',
    })
  )
})
```

### 5. Mock Timers

```typescript
test('debounces function calls', () => {
  vi.useFakeTimers()

  const callback = vi.fn()
  const debounced = debounce(callback, 300)

  // Call multiple times quickly
  debounced()
  debounced()
  debounced()

  // Not called yet
  expect(callback).not.toHaveBeenCalled()

  // Fast-forward time
  vi.advanceTimersByTime(300)

  // Now called once
  expect(callback).toHaveBeenCalledTimes(1)

  vi.useRealTimers()
})
```

---

## Common Mistakes

### 1. Not Clearing Mocks Between Tests

```typescript
// ❌ State leaks between tests
test('first test', () => {
  mockFn.mockReturnValue('first')
})

test('second test', () => {
  // mockFn still returns 'first'!
  expect(mockFn()).toBe('default')  // Fails
})

// ✅ Clear mocks
beforeEach(() => {
  vi.clearAllMocks()
})
```

### 2. Mocking After Import

```typescript
// ❌ Import happens before mock
import { myFunction } from './module'
vi.mock('./module')

// ✅ Mock before import
vi.mock('./module')
import { myFunction } from './module'
```

### 3. Over-Mocking

```typescript
// ❌ Too much mocking - not testing real behavior
vi.mock('./utils')
vi.mock('./api')
vi.mock('./database')
vi.mock('./validation')

test('does something', () => {
  // What are we even testing?
})

// ✅ Mock only external dependencies
vi.mock('./api')  // External service

test('validates and saves', () => {
  // Actually tests validation logic
})
```

### 4. Not Restoring Mocks

```typescript
// ❌ Modified mock affects other tests
test('modifies global', () => {
  global.fetch = vi.fn()
})

test('breaks because fetch is mocked', () => {
  // fetch is still mocked!
})

// ✅ Restore after test
afterEach(() => {
  vi.restoreAllMocks()
})
```

---

## Best Practices

### 1. Mock at the Boundary

Mock external systems, not internal logic.

```typescript
// ✅ Mock the API layer
vi.mock('~/utils/api')

// ❌ Don't mock internal utilities
// vi.mock('~/utils/formatDate')  // Just use the real one
```

### 2. Keep Mocks Simple

```typescript
// ✅ Simple, clear mock
const mockUser = { id: 1, name: 'John' }

// ❌ Overly complex mock
const mockUser = {
  id: 1,
  name: 'John',
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  preferences: { theme: 'dark', notifications: true },
  // ... 20 more fields
}
```

### 3. Use Descriptive Names

```typescript
// ✅ Clear what the mock does
const mockFetchUserSuccess = vi.fn().mockResolvedValue({ id: 1 })
const mockFetchUserNotFound = vi.fn().mockRejectedValue(new Error('Not found'))

// ❌ Generic names
const mock1 = vi.fn()
const mock2 = vi.fn()
```

### 4. Document Complex Mocks

```typescript
// Complex mock behavior should be documented
vi.mock('~/utils/auth', () => ({
  /**
   * Mock that simulates:
   * - First call: Returns logged-in user
   * - Second call: Returns null (session expired)
   */
  getCurrentUser: vi.fn()
    .mockResolvedValueOnce({ id: 1, name: 'John' })
    .mockResolvedValue(null)
}))
```

### 5. Prefer MSW for HTTP

```typescript
// ✅ Use MSW for HTTP mocking (realistic)
server.use(
  http.get('/api/user', () => HttpResponse.json({ name: 'John' }))
)

// ❌ Don't mock fetch directly for most cases
global.fetch = vi.fn()
```

---

## Quick Reference

### Vitest Mock Methods

| Method | Description |
|--------|-------------|
| `vi.fn()` | Create mock function |
| `vi.mock(path)` | Mock module |
| `vi.spyOn(obj, 'method')` | Spy on method |
| `mockFn.mockReturnValue(val)` | Return value |
| `mockFn.mockResolvedValue(val)` | Return Promise |
| `mockFn.mockRejectedValue(err)` | Return rejected Promise |
| `mockFn.mockImplementation(fn)` | Custom implementation |
| `vi.clearAllMocks()` | Clear call history |
| `vi.resetAllMocks()` | Reset implementations |
| `vi.restoreAllMocks()` | Restore originals |

### MSW Response Helpers

| Method | Description |
|--------|-------------|
| `HttpResponse.json(data)` | JSON response |
| `HttpResponse.text(text)` | Text response |
| `HttpResponse.error()` | Network error |
| `delay(ms)` | Delay response |

---

## Next Steps

- **[Unit Testing Guide](./01-unit-testing.md)** - More on Vitest
- **[Integration Testing Guide](./02-integration-testing.md)** - Component testing
- **[Best Practices Guide](./06-best-practices.md)** - Testing patterns
