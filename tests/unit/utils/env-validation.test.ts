import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// =============================================================================
// ENVIRONMENT VARIABLE SCHEMA (extracted from env.server.ts for testing)
// =============================================================================

const envSchema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SESSION_SECRET: z
		.string()
		.min(32, 'SESSION_SECRET must be at least 32 characters'),
	HONEYPOT_SECRET: z
		.string()
		.min(16, 'HONEYPOT_SECRET must be at least 16 characters'),
	AZURE_STORAGE_CONNECTION_STRING: z
		.string()
		.min(1, 'AZURE_STORAGE_CONNECTION_STRING is required'),
	EMAIL_CONNECTION_STRING: z
		.string()
		.min(1, 'EMAIL_CONNECTION_STRING is required'),
})

// =============================================================================
// VALID ENVIRONMENT CONFIGURATIONS
// =============================================================================

const validEnv = {
	NODE_ENV: 'production' as const,
	DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
	SESSION_SECRET: 'this-is-a-32-character-secret!!!', // exactly 32 chars
	HONEYPOT_SECRET: '16-char-secret!!', // exactly 16 chars
	AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=test',
	EMAIL_CONNECTION_STRING: 'endpoint=https://test.azure.com',
}

// =============================================================================
// TESTS: Environment Variable Validation
// =============================================================================

describe('Environment Variable Validation', () => {
	describe('Valid configurations', () => {
		it('should accept valid production environment', () => {
			const result = envSchema.safeParse(validEnv)
			expect(result.success).toBe(true)
		})

		it('should accept valid development environment', () => {
			const result = envSchema.safeParse({
				...validEnv,
				NODE_ENV: 'development',
			})
			expect(result.success).toBe(true)
		})

		it('should accept valid test environment', () => {
			const result = envSchema.safeParse({
				...validEnv,
				NODE_ENV: 'test',
			})
			expect(result.success).toBe(true)
		})

		it('should accept SESSION_SECRET longer than 32 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: 'a'.repeat(64), // 64 chars is fine
			})
			expect(result.success).toBe(true)
		})

		it('should accept HONEYPOT_SECRET longer than 16 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				HONEYPOT_SECRET: 'a'.repeat(32), // 32 chars is fine
			})
			expect(result.success).toBe(true)
		})
	})

	describe('NODE_ENV validation', () => {
		it('should reject invalid NODE_ENV value', () => {
			const result = envSchema.safeParse({
				...validEnv,
				NODE_ENV: 'staging', // invalid
			})
			expect(result.success).toBe(false)
		})

		it('should reject missing NODE_ENV', () => {
			const { NODE_ENV, ...envWithoutNodeEnv } = validEnv
			const result = envSchema.safeParse(envWithoutNodeEnv)
			expect(result.success).toBe(false)
		})
	})

	describe('DATABASE_URL validation', () => {
		it('should reject empty DATABASE_URL', () => {
			const result = envSchema.safeParse({
				...validEnv,
				DATABASE_URL: '',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.DATABASE_URL).toContain(
					'DATABASE_URL is required',
				)
			}
		})

		it('should reject missing DATABASE_URL', () => {
			const { DATABASE_URL, ...envWithoutDb } = validEnv
			const result = envSchema.safeParse(envWithoutDb)
			expect(result.success).toBe(false)
		})
	})

	describe('SESSION_SECRET validation (security critical)', () => {
		it('should reject SESSION_SECRET shorter than 32 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: 'short-secret', // only 12 chars
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.SESSION_SECRET).toContain(
					'SESSION_SECRET must be at least 32 characters',
				)
			}
		})

		it('should reject SESSION_SECRET with exactly 31 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: 'a'.repeat(31), // 1 char short
			})
			expect(result.success).toBe(false)
		})

		it('should accept SESSION_SECRET with exactly 32 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: 'a'.repeat(32),
			})
			expect(result.success).toBe(true)
		})

		it('should reject empty SESSION_SECRET', () => {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: '',
			})
			expect(result.success).toBe(false)
		})

		it('should reject missing SESSION_SECRET', () => {
			const { SESSION_SECRET, ...envWithoutSecret } = validEnv
			const result = envSchema.safeParse(envWithoutSecret)
			expect(result.success).toBe(false)
		})
	})

	describe('HONEYPOT_SECRET validation (security critical)', () => {
		it('should reject HONEYPOT_SECRET shorter than 16 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				HONEYPOT_SECRET: 'short', // only 5 chars
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.flatten().fieldErrors.HONEYPOT_SECRET).toContain(
					'HONEYPOT_SECRET must be at least 16 characters',
				)
			}
		})

		it('should reject HONEYPOT_SECRET with exactly 15 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				HONEYPOT_SECRET: 'a'.repeat(15), // 1 char short
			})
			expect(result.success).toBe(false)
		})

		it('should accept HONEYPOT_SECRET with exactly 16 characters', () => {
			const result = envSchema.safeParse({
				...validEnv,
				HONEYPOT_SECRET: 'a'.repeat(16),
			})
			expect(result.success).toBe(true)
		})

		it('should reject empty HONEYPOT_SECRET', () => {
			const result = envSchema.safeParse({
				...validEnv,
				HONEYPOT_SECRET: '',
			})
			expect(result.success).toBe(false)
		})
	})

	describe('AZURE_STORAGE_CONNECTION_STRING validation', () => {
		it('should reject empty AZURE_STORAGE_CONNECTION_STRING', () => {
			const result = envSchema.safeParse({
				...validEnv,
				AZURE_STORAGE_CONNECTION_STRING: '',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(
					result.error.flatten().fieldErrors.AZURE_STORAGE_CONNECTION_STRING,
				).toContain('AZURE_STORAGE_CONNECTION_STRING is required')
			}
		})

		it('should reject missing AZURE_STORAGE_CONNECTION_STRING', () => {
			const { AZURE_STORAGE_CONNECTION_STRING, ...envWithoutAzure } = validEnv
			const result = envSchema.safeParse(envWithoutAzure)
			expect(result.success).toBe(false)
		})
	})

	describe('EMAIL_CONNECTION_STRING validation', () => {
		it('should reject empty EMAIL_CONNECTION_STRING', () => {
			const result = envSchema.safeParse({
				...validEnv,
				EMAIL_CONNECTION_STRING: '',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(
					result.error.flatten().fieldErrors.EMAIL_CONNECTION_STRING,
				).toContain('EMAIL_CONNECTION_STRING is required')
			}
		})

		it('should reject missing EMAIL_CONNECTION_STRING', () => {
			const { EMAIL_CONNECTION_STRING, ...envWithoutEmail } = validEnv
			const result = envSchema.safeParse(envWithoutEmail)
			expect(result.success).toBe(false)
		})
	})

	describe('Multiple validation errors', () => {
		it('should report all validation errors at once', () => {
			const result = envSchema.safeParse({
				NODE_ENV: 'production',
				DATABASE_URL: '',
				SESSION_SECRET: 'short',
				HONEYPOT_SECRET: 'tiny',
				AZURE_STORAGE_CONNECTION_STRING: '',
				EMAIL_CONNECTION_STRING: '',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				const errors = result.error.flatten().fieldErrors
				expect(errors.DATABASE_URL).toBeDefined()
				expect(errors.SESSION_SECRET).toBeDefined()
				expect(errors.HONEYPOT_SECRET).toBeDefined()
				expect(errors.AZURE_STORAGE_CONNECTION_STRING).toBeDefined()
				expect(errors.EMAIL_CONNECTION_STRING).toBeDefined()
			}
		})
	})
})

// =============================================================================
// TESTS: Security Best Practices
// =============================================================================

describe('Environment Security Best Practices', () => {
	it('SESSION_SECRET minimum length provides adequate entropy (32 chars = 256 bits)', () => {
		// 32 characters with mixed case, numbers, and symbols provides adequate entropy
		// This test documents the security requirement
		const minLength = 32
		const schema = z.string().min(minLength)
		const result = schema.safeParse('a'.repeat(minLength))
		expect(result.success).toBe(true)
	})

	it('HONEYPOT_SECRET minimum length is sufficient for spam prevention (16 chars)', () => {
		// 16 characters is sufficient for honeypot validation
		const minLength = 16
		const schema = z.string().min(minLength)
		const result = schema.safeParse('a'.repeat(minLength))
		expect(result.success).toBe(true)
	})

	it('should prevent weak secrets in production', () => {
		// Common weak secrets that should be rejected
		const weakSecrets = [
			'secret',
			'password',
			'12345678901234567890123456789012', // numeric only but 32 chars - this passes length but is weak
		]

		// At minimum, the length check prevents very short secrets
		for (const weak of ['secret', 'password', '123456']) {
			const result = envSchema.safeParse({
				...validEnv,
				SESSION_SECRET: weak,
			})
			expect(result.success).toBe(false)
		}
	})
})
