# Test Coverage Guide

This guide explains how to measure and interpret test coverage in your project.

## Table of Contents

1. [What is Test Coverage?](#what-is-test-coverage)
2. [Types of Coverage](#types-of-coverage)
3. [Running Coverage Reports](#running-coverage-reports)
4. [Reading Coverage Reports](#reading-coverage-reports)
5. [Coverage Configuration](#coverage-configuration)
6. [Coverage Goals](#coverage-goals)
7. [Common Pitfalls](#common-pitfalls)
8. [Best Practices](#best-practices)

---

## What is Test Coverage?

**Test coverage** measures how much of your code is executed when tests run. It answers: "How much of my code is actually tested?"

### Simple Example

```typescript
// Your code
function greet(name: string, formal: boolean): string {
  if (formal) {
    return `Good day, ${name}.`
  }
  return `Hey ${name}!`
}

// Test 1: Only tests the informal case
test('greets informally', () => {
  expect(greet('John', false)).toBe('Hey John!')
})
```

In this example:
- ✅ Line 5-6 (`if (formal)` and return) - NOT executed
- ✅ Line 7 (`return "Hey..."`) - Executed

**Coverage: 50%** - We only tested half the function!

### Why Coverage Matters

| Benefit | Description |
|---------|-------------|
| **Find untested code** | Identify areas with no test coverage |
| **Confidence** | Higher coverage = more confidence in changes |
| **Risk assessment** | Know which code paths aren't validated |
| **Code quality** | Encourages writing testable code |

### Why Coverage Isn't Everything

| Limitation | Description |
|------------|-------------|
| **Quality ≠ Quantity** | 100% coverage doesn't mean bug-free |
| **False security** | A test that runs code but doesn't assert anything |
| **Overhead** | Chasing 100% can waste time on trivial code |

---

## Types of Coverage

### 1. Line Coverage

**What it measures**: Percentage of lines executed during tests.

```typescript
function example(x: number) {
  const y = x * 2       // Line 1 ✅ covered if function called
  if (y > 10) {         // Line 2 ✅ covered if function called
    return 'big'        // Line 3 ⚠️ only covered if y > 10
  }
  return 'small'        // Line 4 ⚠️ only covered if y <= 10
}
```

### 2. Statement Coverage

**What it measures**: Percentage of statements executed.

Similar to line coverage but counts statements, not lines. Multiple statements on one line are counted separately.

```typescript
// One line, two statements
if (x) return 'yes'; return 'no'
```

### 3. Branch Coverage

**What it measures**: Percentage of decision branches taken.

```typescript
function example(a: boolean, b: boolean) {
  if (a && b) {  // 4 possible branches: TT, TF, FT, FF
    return 'both true'
  }
  return 'not both'
}
```

To get 100% branch coverage, you need tests for all combinations.

### 4. Function Coverage

**What it measures**: Percentage of functions called during tests.

```typescript
// If testHelper is never called in tests, function coverage drops
function helper() { return 'help' }
function main() { return 'main' }

test('tests main', () => {
  expect(main()).toBe('main')
})
// Function coverage: 50% (only main was called)
```

---

## Running Coverage Reports

### Command

```bash
# Run tests with coverage
npm run test:coverage
```

This runs all unit and integration tests (not E2E) and generates coverage reports.

### What Happens

1. Vitest runs all tests
2. Code execution is tracked
3. Reports are generated in multiple formats
4. Summary is printed to terminal

### Output Locations

After running, you'll find:

```
coverage/
├── index.html          # HTML report (open in browser)
├── lcov.info           # LCOV format (for CI tools)
└── ...other files
```

---

## Reading Coverage Reports

### Terminal Output

```
 % Coverage report from v8
------------------------------------|---------|----------|---------|---------|
File                                | % Stmts | % Branch | % Funcs | % Lines |
------------------------------------|---------|----------|---------|---------|
All files                           |   45.23 |    32.18 |   38.72 |   45.23 |
 app/utils                          |   78.45 |    65.23 |   82.14 |   78.45 |
  misc.ts                           |   92.31 |    85.71 |   88.89 |   92.31 |
  validation.ts                     |   64.29 |    50.00 |   75.00 |   64.29 |
 app/components                     |   32.10 |    18.52 |   25.00 |   32.10 |
  Form.tsx                          |   41.67 |    25.00 |   33.33 |   41.67 |
------------------------------------|---------|----------|---------|---------|
```

### Understanding the Columns

| Column | Meaning | Good Target |
|--------|---------|-------------|
| % Stmts | Statement coverage | 80%+ |
| % Branch | Branch coverage | 70%+ |
| % Funcs | Function coverage | 80%+ |
| % Lines | Line coverage | 80%+ |

### HTML Report

Open `coverage/index.html` in a browser for an interactive report:

1. **Overview**: Summary of all files
2. **Drill down**: Click files to see line-by-line coverage
3. **Color coding**:
   - 🟢 Green = Covered
   - 🔴 Red = Not covered
   - 🟡 Yellow = Partially covered (branches)

### Example HTML Report View

```
// Green (covered)        Red (not covered)
function greet(name) {    function unused() {
  return `Hi ${name}`       return 'never called'
}                         }
```

---

## Coverage Configuration

### Vitest Coverage Config (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // Coverage provider
      provider: 'v8',

      // Report formats
      reporter: ['text', 'html', 'lcov'],

      // Files to include in coverage
      include: ['app/**/*.{ts,tsx}'],

      // Files to exclude from coverage
      exclude: [
        'app/**/*.d.ts',         // Type definitions
        'app/entry.*.tsx',       // Entry files
        'app/root.tsx',          // Root component
        '**/node_modules/**',    // Dependencies
        '**/tests/**',           // Test files themselves
      ],

      // Minimum coverage thresholds (fail if not met)
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
    },
  },
})
```

### Configuration Options Explained

| Option | Purpose |
|--------|---------|
| `provider` | Coverage engine (`v8` or `istanbul`) |
| `reporter` | Output formats (text, html, lcov, json) |
| `include` | Files to measure |
| `exclude` | Files to ignore |
| `thresholds` | Minimum required coverage |

### Reporter Formats

| Format | Use Case |
|--------|----------|
| `text` | Terminal output |
| `html` | Browser-viewable report |
| `lcov` | CI tools (Codecov, SonarQube) |
| `json` | Programmatic access |

---

## Coverage Goals

### Recommended Thresholds

| Code Type | Target | Reason |
|-----------|--------|--------|
| **Utility functions** | 90%+ | Pure functions are easy to test |
| **Business logic** | 80%+ | Critical code needs good coverage |
| **UI components** | 60-70% | Some rendering is hard to test |
| **Configuration** | Skip | Not worth testing |
| **Overall project** | 70-80% | Balanced goal |

### Setting Thresholds

```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    lines: 70,
    branches: 60,
    functions: 70,
    statements: 70,
  },
}
```

If coverage falls below these thresholds, the test command fails.

### Per-File Thresholds

```typescript
coverage: {
  thresholds: {
    'app/utils/**': {
      lines: 90,      // Utilities should be well-tested
    },
    'app/components/**': {
      lines: 60,      // Components can be lower
    },
  },
}
```

---

## Common Pitfalls

### 1. Chasing 100% Coverage

```typescript
// Do you really need to test this?
export const API_URL = 'https://api.example.com'

// Or this?
export type UserId = string
```

**Solution**: Exclude trivial code from coverage.

### 2. Tests That Don't Assert

```typescript
// ❌ Bad: Runs code but doesn't verify behavior
test('calls function', () => {
  myFunction()
  // No assertions!
})

// ✅ Good: Verifies actual behavior
test('returns expected value', () => {
  const result = myFunction()
  expect(result).toBe('expected')
})
```

### 3. Testing Implementation Details

```typescript
// ❌ Bad: Tests internal state
test('sets internal flag', () => {
  const obj = new MyClass()
  obj.process()
  expect(obj._internalFlag).toBe(true)
})

// ✅ Good: Tests observable behavior
test('returns processed result', () => {
  const obj = new MyClass()
  expect(obj.process()).toBe('result')
})
```

### 4. Ignoring Branch Coverage

```typescript
function validate(data: Data | null) {
  if (!data) return { valid: false }
  return { valid: data.value > 0 }
}

// Test only covers the truthy branch
test('validates data', () => {
  expect(validate({ value: 5 })).toEqual({ valid: true })
})
// Missing: test for null case
```

---

## Best Practices

### 1. Test Behavior, Not Lines

Focus on testing what your code does, not just executing lines.

```typescript
// Goal: Test the greet function's behavior
describe('greet', () => {
  it('returns formal greeting when formal is true', () => {
    expect(greet('John', true)).toBe('Good day, John.')
  })

  it('returns informal greeting when formal is false', () => {
    expect(greet('John', false)).toBe('Hey John!')
  })
})
```

### 2. Exclude Untestable Code

Some code isn't worth testing:

```typescript
// vitest.config.ts
coverage: {
  exclude: [
    'app/**/*.d.ts',           // Type definitions
    'app/entry.*.tsx',         // Framework entry points
    'app/root.tsx',            // Root layout
    'app/config/**',           // Configuration
    '**/__mocks__/**',         // Mock files
  ],
}
```

### 3. Use Coverage as a Guide, Not a Goal

Coverage tells you what's NOT tested, but not if tests are good.

```typescript
// 100% coverage, but useless test
test('function runs', () => {
  myComplexFunction()  // No assertions!
})
```

### 4. Review Uncovered Lines

Before adding tests for coverage, ask:

1. Is this code actually important?
2. Should this code exist?
3. Can I simplify the code instead?

### 5. Integrate with CI

Add coverage checks to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: coverage/lcov.info
```

### 6. Monitor Coverage Trends

Track coverage over time. Decreasing coverage might indicate:
- New code without tests
- Removed tests
- Technical debt

---

## Quick Reference

### Commands

```bash
# Run coverage
npm run test:coverage

# View HTML report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

### Coverage Thresholds (Recommended)

```typescript
thresholds: {
  lines: 70,
  branches: 60,
  functions: 70,
  statements: 70,
}
```

### What to Exclude

```typescript
exclude: [
  '**/*.d.ts',         // Types
  '**/entry.*.tsx',    // Entry points
  '**/root.tsx',       // Root component
  '**/config/**',      // Configuration
  '**/__mocks__/**',   // Mocks
  '**/node_modules/**',
]
```

---

## Next Steps

- **[Unit Testing Guide](./01-unit-testing.md)** - Write better unit tests
- **[Best Practices Guide](./06-best-practices.md)** - Testing patterns
- **[Mocking Guide](./05-mocking.md)** - Mock dependencies for easier testing
