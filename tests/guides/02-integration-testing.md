# Integration Testing with Vitest and Testing Library

This guide covers integration testing - testing how multiple units work together.

## Table of Contents

1. [What is Integration Testing?](#what-is-integration-testing)
2. [Unit vs Integration Tests](#unit-vs-integration-tests)
3. [Testing Library Basics](#testing-library-basics)
4. [Testing Remix Routes](#testing-remix-routes)
5. [Testing with MSW](#testing-with-msw)
6. [Testing Forms](#testing-forms)
7. [Real Examples from This Project](#real-examples-from-this-project)
8. [Running Integration Tests](#running-integration-tests)

---

## What is Integration Testing?

**Integration tests** verify that multiple units work together correctly. While unit tests isolate individual functions, integration tests check their interactions.

### Examples of Integration Tests

| What to Test | Example |
|--------------|---------|
| Component + Hooks | Form component with form validation hooks |
| Route + Loader | Remix route with data loading |
| Component + API | Component that fetches and displays data |
| Multiple Components | Parent component rendering children |

### The "Integration" in Integration Testing

```
┌─────────────────────────────────────────────────────────┐
│                    Integration Test                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐        │
│  │ Component│────▶│   Hook   │────▶│   API    │        │
│  │  (UI)    │     │ (Logic)  │     │ (Data)   │        │
│  └──────────┘     └──────────┘     └──────────┘        │
│       ▲                                    │            │
│       └────────────────────────────────────┘            │
│                 Tests the flow                          │
└─────────────────────────────────────────────────────────┘
```

---

## Unit vs Integration Tests

### When to Use Each

| Scenario | Unit Test | Integration Test |
|----------|-----------|------------------|
| Pure function logic | ✅ | |
| Component renders correctly | | ✅ |
| Form submission flow | | ✅ |
| Data transformation | ✅ | |
| API call + state update | | ✅ |
| Validation rules | ✅ | |
| User interactions | | ✅ |

### Code Example

**Unit Test**: Tests the validator in isolation

```typescript
// tests/unit/utils/validation.test.ts
test('validateEmail returns error for invalid email', () => {
  const result = validateEmail('invalid')
  expect(result).toEqual({ error: 'Invalid email format' })
})
```

**Integration Test**: Tests form using the validator

```typescript
// tests/integration/components/registration-form.test.tsx
test('shows error when email is invalid', async () => {
  render(<RegistrationForm />)

  await userEvent.type(screen.getByLabelText('Email'), 'invalid')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(screen.getByText('Invalid email format')).toBeInTheDocument()
})
```

---

## Testing Library Basics

We use **React Testing Library** for integration tests. Its philosophy: test from the user's perspective.

### Core Concepts

#### 1. Rendering Components

```typescript
import { render, screen } from '@testing-library/react'
import { MyComponent } from '~/components/MyComponent'

test('renders component', () => {
  render(<MyComponent title="Hello" />)

  expect(screen.getByText('Hello')).toBeInTheDocument()
})
```

#### 2. Querying Elements

Testing Library provides several query methods:

| Query | Returns | Throws if not found? | Use when... |
|-------|---------|---------------------|-------------|
| `getBy*` | Element | Yes | Element must exist |
| `queryBy*` | Element or null | No | Element may not exist |
| `findBy*` | Promise<Element> | Yes | Element appears async |
| `getAllBy*` | Array | Yes | Multiple elements exist |

#### Query Variants

```typescript
// By role (best practice - accessible)
screen.getByRole('button', { name: 'Submit' })
screen.getByRole('textbox', { name: 'Email' })

// By label (for form elements)
screen.getByLabelText('Email')

// By placeholder
screen.getByPlaceholderText('Enter your email')

// By text content
screen.getByText('Welcome')
screen.getByText(/welcome/i)  // Case-insensitive

// By test ID (last resort)
screen.getByTestId('submit-button')
```

#### 3. User Interactions

```typescript
import userEvent from '@testing-library/user-event'

test('handles user input', async () => {
  // Setup userEvent
  const user = userEvent.setup()

  render(<LoginForm />)

  // Type in an input
  await user.type(screen.getByLabelText('Email'), 'user@example.com')

  // Click a button
  await user.click(screen.getByRole('button', { name: 'Submit' }))

  // Select from dropdown
  await user.selectOptions(screen.getByRole('combobox'), 'option-value')

  // Check a checkbox
  await user.click(screen.getByRole('checkbox'))

  // Clear and retype
  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'new@example.com')
})
```

#### 4. Waiting for Async

```typescript
test('shows loading then data', async () => {
  render(<UserProfile userId="1" />)

  // Wait for loading to appear
  expect(screen.getByText('Loading...')).toBeInTheDocument()

  // Wait for data to load
  expect(await screen.findByText('John Doe')).toBeInTheDocument()

  // Loading should be gone
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
})
```

---

## Testing Remix Routes

Remix provides `createRemixStub` for testing routes with their loaders and actions.

### Basic Route Test

```typescript
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import MyRoute from '~/routes/my-route'

test('loads and displays data', async () => {
  const RemixStub = createRemixStub([
    {
      path: '/',
      Component: MyRoute,
      loader: () => ({ message: 'Hello World' }),
    },
  ])

  render(<RemixStub />)

  expect(await screen.findByText('Hello World')).toBeInTheDocument()
})
```

### Testing with Actions

```typescript
import { createRemixStub } from '@remix-run/testing'
import { json } from '@remix-run/node'

test('submits form and shows success', async () => {
  const user = userEvent.setup()

  const RemixStub = createRemixStub([
    {
      path: '/',
      Component: MyFormRoute,
      loader: () => ({ users: [] }),
      action: async ({ request }) => {
        const formData = await request.formData()
        const email = formData.get('email')
        return json({ success: true, email })
      },
    },
  ])

  render(<RemixStub />)

  await user.type(screen.getByLabelText('Email'), 'user@example.com')
  await user.click(screen.getByRole('button', { name: 'Submit' }))

  expect(await screen.findByText('Success!')).toBeInTheDocument()
})
```

### Testing with Database (Mocked)

```typescript
import { createRemixStub } from '@remix-run/testing'
import { prisma } from '~/utils/db.server'

// Mock Prisma
vi.mock('~/utils/db.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

test('creates user and redirects', async () => {
  // Setup mock response
  vi.mocked(prisma.user.create).mockResolvedValue({
    id: '1',
    email: 'new@example.com',
  })

  const RemixStub = createRemixStub([
    {
      path: '/register',
      Component: RegisterRoute,
      action: registerAction,  // Real action function
    },
    {
      path: '/dashboard',
      Component: () => <div>Dashboard</div>,
    },
  ])

  render(<RemixStub initialEntries={['/register']} />)

  await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Register' }))

  // Should redirect to dashboard
  expect(await screen.findByText('Dashboard')).toBeInTheDocument()
})
```

---

## Testing with MSW

**MSW (Mock Service Worker)** intercepts HTTP requests and returns mock responses.

### Setup (Already configured in this project)

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json()

    if (body.email === 'test@example.com') {
      return HttpResponse.json({ user: { id: '1', email: body.email } })
    }

    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    )
  }),

  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'John Doe',
    })
  }),
]
```

```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

```typescript
// tests/setup.ts
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Using MSW in Tests

```typescript
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

test('shows user data', async () => {
  render(<UserProfile userId="1" />)

  // Uses default handler from handlers.ts
  expect(await screen.findByText('John Doe')).toBeInTheDocument()
})

test('handles API error', async () => {
  // Override handler for this test only
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    })
  )

  render(<UserProfile userId="999" />)

  expect(await screen.findByText('User not found')).toBeInTheDocument()
})
```

---

## Testing Forms

### Testing Form Validation

```typescript
test('shows validation errors', async () => {
  const user = userEvent.setup()
  render(<RegistrationForm />)

  // Submit empty form
  await user.click(screen.getByRole('button', { name: 'Submit' }))

  // Check for validation errors
  expect(screen.getByText('Email is required')).toBeInTheDocument()
  expect(screen.getByText('Password is required')).toBeInTheDocument()
})

test('clears errors when input is corrected', async () => {
  const user = userEvent.setup()
  render(<RegistrationForm />)

  // Trigger validation error
  await user.type(screen.getByLabelText('Email'), 'invalid')
  await user.click(screen.getByRole('button', { name: 'Submit' }))

  expect(screen.getByText('Invalid email format')).toBeInTheDocument()

  // Fix the error
  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'valid@example.com')

  // Error should be gone (may need to blur or submit again)
  expect(screen.queryByText('Invalid email format')).not.toBeInTheDocument()
})
```

### Testing Form Submission

```typescript
test('submits form data correctly', async () => {
  const handleSubmit = vi.fn()
  const user = userEvent.setup()

  render(<ContactForm onSubmit={handleSubmit} />)

  await user.type(screen.getByLabelText('Name'), 'John Doe')
  await user.type(screen.getByLabelText('Email'), 'john@example.com')
  await user.type(screen.getByLabelText('Message'), 'Hello there!')

  await user.click(screen.getByRole('button', { name: 'Send' }))

  expect(handleSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
    email: 'john@example.com',
    message: 'Hello there!',
  })
})
```

### Testing File Uploads

```typescript
test('handles file upload', async () => {
  const user = userEvent.setup()
  render(<FileUploadForm />)

  // Create a mock file
  const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })

  // Upload the file
  const input = screen.getByLabelText('Upload Document')
  await user.upload(input, file)

  // Check file was selected
  expect(screen.getByText('test.pdf')).toBeInTheDocument()
})
```

---

## Real Examples from This Project

### Example: Testing Registration Form Route

```typescript
// tests/integration/routes/requests-new.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { createRemixStub } from '@remix-run/testing'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Registration Form Route', () => {
  beforeEach(async () => {
    // Setup test database state
    await setupTestDatabase()
  })

  describe('Loader', () => {
    it('should load invitations for focal user', async () => {
      const { tenant, event } = await seedTestData()

      const RemixStub = createRemixStub([
        {
          path: '/requests/new',
          Component: RegistrationRoute,
          loader: () => ({
            invitations: [
              { id: 'inv-1', organization: 'Test Org', maximumQuota: 10 },
            ],
            participantTypes: [
              { id: 'pt-1', name: 'Delegate' },
            ],
          }),
        },
      ])

      render(<RemixStub initialEntries={['/requests/new']} />)

      // Wait for data to load
      expect(await screen.findByText('Test Org')).toBeInTheDocument()
    })
  })

  describe('Action', () => {
    it('should create participant with valid data', async () => {
      const user = userEvent.setup()

      const RemixStub = createRemixStub([
        {
          path: '/requests/new',
          Component: RegistrationRoute,
          loader: () => ({
            invitations: [{ id: 'inv-1', organization: 'Test Org' }],
            participantTypes: [{ id: 'pt-1', name: 'Delegate' }],
          }),
          action: async ({ request }) => {
            const formData = await request.formData()
            // Validate and create participant
            return { success: true }
          },
        },
      ])

      render(<RemixStub initialEntries={['/requests/new']} />)

      // Fill out the form
      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Family Name'), 'Doe')

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit' }))

      // Verify success
      expect(await screen.findByText('Success')).toBeInTheDocument()
    })

    it('should reject duplicate passport number', async () => {
      const user = userEvent.setup()

      const RemixStub = createRemixStub([
        {
          path: '/requests/new',
          Component: RegistrationRoute,
          loader: () => ({ /* ... */ }),
          action: async () => {
            return {
              errors: { passportNumber: 'Passport already registered' },
            }
          },
        },
      ])

      render(<RemixStub initialEntries={['/requests/new']} />)

      await user.type(screen.getByLabelText('Passport Number'), 'EXISTING123')
      await user.click(screen.getByRole('button', { name: 'Submit' }))

      expect(
        await screen.findByText('Passport already registered')
      ).toBeInTheDocument()
    })
  })
})
```

---

## Running Integration Tests

### Commands

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test file
npm test -- tests/integration/routes/requests-new.test.tsx

# Run in watch mode
npm test -- --watch

# Run with verbose output
npm test -- --reporter=verbose
```

### Test File Location

Integration tests live in:
```
tests/
└── integration/
    └── routes/
        ├── requests-new.test.tsx
        └── requests-edit.test.tsx
```

---

## Debugging Integration Tests

### 1. Debug Mode

```typescript
import { screen } from '@testing-library/react'

test('debug example', () => {
  render(<MyComponent />)

  // Print the current DOM
  screen.debug()

  // Print specific element
  screen.debug(screen.getByRole('button'))
})
```

### 2. Testing Playground

```typescript
import { screen } from '@testing-library/react'

test('playground example', () => {
  render(<MyComponent />)

  // Opens interactive playground in browser
  screen.logTestingPlaygroundURL()
})
```

### 3. Async Debugging

```typescript
test('async debug', async () => {
  render(<MyComponent />)

  // Wait and debug
  await waitFor(() => {
    screen.debug()
    expect(screen.getByText('Loaded')).toBeInTheDocument()
  })
})
```

---

## Common Mistakes

### 1. Not Waiting for Async Operations

```typescript
// ❌ Wrong - doesn't wait
test('loads data', () => {
  render(<AsyncComponent />)
  expect(screen.getByText('Data')).toBeInTheDocument()
})

// ✅ Correct - waits for element
test('loads data', async () => {
  render(<AsyncComponent />)
  expect(await screen.findByText('Data')).toBeInTheDocument()
})
```

### 2. Using Wrong Query

```typescript
// ❌ Wrong - throws if not found
test('element may not exist', () => {
  render(<Component showOptional={false} />)
  expect(screen.getByText('Optional')).not.toBeInTheDocument()
})

// ✅ Correct - returns null if not found
test('element may not exist', () => {
  render(<Component showOptional={false} />)
  expect(screen.queryByText('Optional')).not.toBeInTheDocument()
})
```

### 3. Not Setting Up User Event

```typescript
// ❌ Wrong - may cause issues
test('clicks button', async () => {
  render(<Button />)
  await userEvent.click(screen.getByRole('button'))
})

// ✅ Correct - setup user event first
test('clicks button', async () => {
  const user = userEvent.setup()
  render(<Button />)
  await user.click(screen.getByRole('button'))
})
```

---

## Next Steps

- **[E2E Testing Guide](./03-e2e-testing.md)** - Test complete user flows
- **[Mocking Guide](./05-mocking.md)** - Advanced mocking with MSW
- **[Best Practices Guide](./06-best-practices.md)** - Testing patterns
