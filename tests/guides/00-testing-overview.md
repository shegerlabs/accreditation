# Testing Overview

Welcome to the comprehensive testing guide for the Accreditation System. This guide will take you from zero knowledge to confidently writing and running tests.

## Table of Contents

1. [What is Testing?](#what-is-testing)
2. [Why Do We Test?](#why-do-we-test)
3. [Types of Tests](#types-of-tests)
4. [The Testing Pyramid](#the-testing-pyramid)
5. [Our Testing Stack](#our-testing-stack)
6. [Quick Start Commands](#quick-start-commands)
7. [Project Test Structure](#project-test-structure)

---

## What is Testing?

**Testing** is the process of verifying that your code works as expected. Instead of manually clicking through your application to check if everything works, you write code that automatically checks your code.

Think of it like this:
- **Manual testing**: You open the browser, fill a form, click submit, and check if it worked.
- **Automated testing**: You write code that fills the form, clicks submit, and verifies the result - automatically, every time.

### A Simple Example

```typescript
// Your code (a function that adds two numbers)
function add(a: number, b: number): number {
  return a + b
}

// Your test (verifies the function works)
test('add function should add two numbers', () => {
  const result = add(2, 3)
  expect(result).toBe(5)  // We expect 2 + 3 to equal 5
})
```

If someone accidentally changes the `add` function to subtract instead of add, the test will fail and alert you immediately.

---

## Why Do We Test?

### 1. **Catch Bugs Early**
Tests find bugs before they reach production. A bug caught during development costs 10x less to fix than one found in production.

### 2. **Confidence to Refactor**
When you have tests, you can change code knowing that if you break something, the tests will tell you immediately.

### 3. **Documentation**
Tests describe how your code should behave. Reading tests often explains the code better than comments.

### 4. **Faster Development**
Counterintuitively, writing tests speeds up development. You spend less time debugging and manually testing.

### 5. **Team Collaboration**
Tests ensure that when multiple developers work on the same codebase, changes don't break each other's work.

---

## Types of Tests

There are three main types of tests, each serving a different purpose:

### 1. Unit Tests
**What they test**: Individual functions, components, or modules in isolation.

**Characteristics**:
- Fast (milliseconds)
- Test one thing at a time
- Don't depend on databases, networks, or other systems
- Easy to write and maintain

**Example**: Testing if a validation function correctly validates email addresses.

```typescript
test('validates email format', () => {
  expect(isValidEmail('user@example.com')).toBe(true)
  expect(isValidEmail('invalid-email')).toBe(false)
})
```

### 2. Integration Tests
**What they test**: How multiple units work together.

**Characteristics**:
- Medium speed (seconds)
- Test interactions between components
- May use databases or mock services
- More complex than unit tests

**Example**: Testing if a form component correctly submits data and handles the response.

```typescript
test('form submits data correctly', async () => {
  render(<RegistrationForm />)
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Success!')).toBeInTheDocument()
})
```

### 3. End-to-End (E2E) Tests
**What they test**: Complete user flows from start to finish.

**Characteristics**:
- Slower (seconds to minutes)
- Test real browser behavior
- Use actual database and services
- Most realistic but most expensive

**Example**: Testing the complete login flow - opening the browser, filling credentials, and verifying successful login.

```typescript
test('user can log in', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name="email"]', 'user@example.com')
  await page.fill('[name="password"]', 'password123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})
```

---

## The Testing Pyramid

The **Testing Pyramid** is a guideline for how many tests of each type you should have:

```
        /\
       /  \
      / E2E \        ← Few (expensive, slow, but most realistic)
     /--------\
    /Integration\    ← Some (moderate cost, catch integration issues)
   /--------------\
  /   Unit Tests   \  ← Many (cheap, fast, catch most bugs)
 /------------------\
```

### Why This Shape?

1. **Unit tests are cheap**: They run fast and are easy to maintain. Have lots of them.
2. **E2E tests are expensive**: They're slow and brittle. Use them sparingly for critical paths.
3. **Integration tests balance**: They catch bugs unit tests miss without the cost of E2E.

### In Practice (This Project)

| Test Type | Count | Purpose |
|-----------|-------|---------|
| Unit | ~50+ | Test utilities, validators, pure functions |
| Integration | ~10-20 | Test Remix routes, loaders, actions |
| E2E | ~40-60 | Test critical user flows (login, registration) |

---

## Our Testing Stack

This project uses industry-standard testing tools:

### Vitest (Unit & Integration Tests)
- **What**: A fast, modern test runner built for Vite projects
- **Why**: Lightning fast, great TypeScript support, compatible with Jest
- **Used for**: Unit tests, integration tests

### Playwright (E2E Tests)
- **What**: A browser automation framework by Microsoft
- **Why**: Cross-browser support, reliable, great debugging tools
- **Used for**: End-to-end tests in real browsers

### Testing Library
- **What**: Utilities for testing UI components
- **Why**: Encourages testing from a user's perspective
- **Used for**: React component testing

### MSW (Mock Service Worker)
- **What**: API mocking library
- **Why**: Intercepts network requests for testing
- **Used for**: Mocking API calls in tests

---

## Quick Start Commands

Here are the commands you'll use most often:

### Unit & Integration Tests (Vitest)

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests with visual UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with visual UI (great for debugging)
npm run test:e2e:ui

# Run E2E tests in debug mode (step through tests)
npm run test:e2e:debug
```

### Run Everything

```bash
# Run all tests (unit + integration + e2e)
npm run test:all
```

---

## Project Test Structure

Here's how tests are organized in this project:

```
tests/
├── guides/                    # 📚 You are here! Documentation
│   ├── 00-testing-overview.md
│   ├── 01-unit-testing.md
│   ├── 02-integration-testing.md
│   ├── 03-e2e-testing.md
│   ├── 04-test-coverage.md
│   ├── 05-mocking.md
│   └── 06-best-practices.md
│
├── setup.ts                   # 🔧 Global test setup (runs before all tests)
├── db-setup.ts                # 🗄️ Test database utilities
│
├── mocks/                     # 🎭 API mocking
│   ├── handlers.ts            # Mock API endpoints
│   ├── server.ts              # MSW server setup
│   └── browser.ts             # MSW browser setup
│
├── fixtures/                  # 📁 Test files (images, PDFs)
│   ├── test-photo.jpg
│   └── test-document.pdf
│
├── unit/                      # 🧪 Unit tests
│   ├── utils/                 # Tests for utility functions
│   │   ├── misc.test.ts
│   │   └── validation.test.ts
│   └── workflow/
│       └── workflow.test.ts
│
├── integration/               # 🔗 Integration tests
│   └── routes/
│       └── requests-new.test.tsx
│
└── e2e/                       # 🌐 End-to-end tests
    ├── .auth/                 # Saved authentication state
    │   └── user.json
    ├── helpers/               # E2E helper functions
    │   ├── db.ts              # Database helpers
    │   └── totp.ts            # 2FA code generation
    ├── auth.setup.ts          # Authentication setup
    ├── registration.spec.ts   # Registration flow tests
    ├── workflow-approvals.spec.ts
    └── login-logout.noauth.spec.ts
```

### Configuration Files

```
(project root)
├── vitest.config.ts           # Vitest configuration
├── playwright.config.ts       # Playwright configuration
└── package.json               # Test scripts
```

---

## What's Next?

Now that you understand the basics, dive into the specific guides:

1. **[Unit Testing Guide](./01-unit-testing.md)** - Learn to write fast, focused tests
2. **[Integration Testing Guide](./02-integration-testing.md)** - Test component interactions
3. **[E2E Testing Guide](./03-e2e-testing.md)** - Test complete user flows
4. **[Coverage Testing Guide](./04-test-coverage.md)** - Measure your test coverage
5. **[Mocking Guide](./05-mocking.md)** - Fake external dependencies
6. **[Best Practices Guide](./06-best-practices.md)** - Write better tests

---

## Glossary

| Term | Definition |
|------|------------|
| **Assertion** | A statement that checks if something is true (e.g., `expect(x).toBe(5)`) |
| **Mock** | A fake version of something (function, API, database) |
| **Fixture** | Test data or files used across tests |
| **Test Suite** | A group of related tests (using `describe`) |
| **Test Case** | A single test (using `test` or `it`) |
| **Coverage** | Percentage of code executed by tests |
| **Flaky Test** | A test that sometimes passes, sometimes fails |
| **E2E** | End-to-End (testing complete user flows) |
| **SUT** | System Under Test (what you're testing) |
