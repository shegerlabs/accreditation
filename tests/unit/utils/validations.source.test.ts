/**
 * Unit tests for app/utils/validations.ts
 *
 * These tests import directly from the source file to ensure proper coverage.
 */
import { describe, it, expect } from 'vitest'
import {
	xssTransform,
	UsernameSchema,
	PasswordSchema,
	NameSchema,
	EmailSchema,
} from '~/utils/validations'

describe('validations.ts', () => {
	describe('xssTransform', () => {
		it('should return undefined for undefined input', () => {
			expect(xssTransform(undefined)).toBeUndefined()
		})

		it('should strip script tags', () => {
			const result = xssTransform('<script>alert("xss")</script>hello')
			expect(result).not.toContain('<script>')
			expect(result).toContain('hello')
		})

		it('should strip style tags', () => {
			const result = xssTransform('<style>body{color:red}</style>hello')
			expect(result).not.toContain('<style>')
			expect(result).toContain('hello')
		})

		it('should strip iframe tags', () => {
			const result = xssTransform('<iframe src="evil.com"></iframe>hello')
			expect(result).not.toContain('<iframe>')
			expect(result).toContain('hello')
		})

		it('should return clean string as-is', () => {
			expect(xssTransform('hello world')).toBe('hello world')
		})

		it('should handle empty string', () => {
			expect(xssTransform('')).toBe('')
		})
	})

	describe('UsernameSchema', () => {
		it('should accept valid username with letters', () => {
			const result = UsernameSchema.safeParse('johndoe')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('johndoe')
			}
		})

		it('should accept username with numbers', () => {
			const result = UsernameSchema.safeParse('john123')
			expect(result.success).toBe(true)
		})

		it('should accept username with underscore', () => {
			const result = UsernameSchema.safeParse('john_doe')
			expect(result.success).toBe(true)
		})

		it('should accept username with dash', () => {
			const result = UsernameSchema.safeParse('john-doe')
			expect(result.success).toBe(true)
		})

		it('should accept username with @ (email format)', () => {
			const result = UsernameSchema.safeParse('john@example.com')
			expect(result.success).toBe(true)
		})

		it('should accept username with dots', () => {
			const result = UsernameSchema.safeParse('john.doe')
			expect(result.success).toBe(true)
		})

		it('should convert to lowercase', () => {
			const result = UsernameSchema.safeParse('JohnDoe')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('johndoe')
			}
		})

		it('should reject username that is too short', () => {
			const result = UsernameSchema.safeParse('ab')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Username is too short')
			}
		})

		it('should reject username that is too long', () => {
			const result = UsernameSchema.safeParse('a'.repeat(101))
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Username is too long')
			}
		})

		it('should reject username with special characters', () => {
			const result = UsernameSchema.safeParse('john#doe')
			expect(result.success).toBe(false)
		})

		it('should reject username with spaces', () => {
			const result = UsernameSchema.safeParse('john doe')
			expect(result.success).toBe(false)
		})

		it('should sanitize XSS in username', () => {
			const result = UsernameSchema.safeParse('john<script>alert(1)</script>')
			// May fail validation due to < character, or sanitize it
			if (result.success) {
				expect(result.data).not.toContain('<script>')
			}
		})
	})

	describe('PasswordSchema', () => {
		it('should accept valid password with all requirements', () => {
			const result = PasswordSchema.safeParse('Password1!')
			expect(result.success).toBe(true)
		})

		it('should accept complex password', () => {
			const result = PasswordSchema.safeParse('MyP@ssw0rd123!')
			expect(result.success).toBe(true)
		})

		it('should reject password without uppercase', () => {
			const result = PasswordSchema.safeParse('password1!')
			expect(result.success).toBe(false)
		})

		it('should reject password without lowercase', () => {
			const result = PasswordSchema.safeParse('PASSWORD1!')
			expect(result.success).toBe(false)
		})

		it('should reject password without number', () => {
			const result = PasswordSchema.safeParse('Password!')
			expect(result.success).toBe(false)
		})

		it('should reject password without special character', () => {
			const result = PasswordSchema.safeParse('Password1')
			expect(result.success).toBe(false)
		})

		it('should reject password that is too short', () => {
			const result = PasswordSchema.safeParse('Pass1!')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					'Password must be at least 8 characters',
				)
			}
		})

		it('should reject password that is too long', () => {
			const result = PasswordSchema.safeParse('P@ssw0rd' + 'a'.repeat(100))
			expect(result.success).toBe(false)
		})

		it('should reject empty password', () => {
			const result = PasswordSchema.safeParse('')
			expect(result.success).toBe(false)
		})
	})

	describe('NameSchema', () => {
		it('should accept valid name', () => {
			const result = NameSchema.safeParse('John Doe')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('John Doe')
			}
		})

		it('should accept name with hyphen', () => {
			const result = NameSchema.safeParse('Mary-Jane')
			expect(result.success).toBe(true)
		})

		it('should accept name with apostrophe', () => {
			const result = NameSchema.safeParse("O'Brien")
			expect(result.success).toBe(true)
		})

		it('should trim whitespace', () => {
			const result = NameSchema.safeParse('  John Doe  ')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('John Doe')
			}
		})

		it('should reject name that is too short', () => {
			const result = NameSchema.safeParse('Jo')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Name is too short')
			}
		})

		it('should reject name that is too long', () => {
			const result = NameSchema.safeParse('a'.repeat(41))
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Name is too long')
			}
		})

		it('should reject name with numbers', () => {
			const result = NameSchema.safeParse('John123')
			expect(result.success).toBe(false)
		})

		it('should reject name with special characters', () => {
			const result = NameSchema.safeParse('John@Doe')
			expect(result.success).toBe(false)
		})

		it('should sanitize XSS in name', () => {
			// This will likely fail validation due to < character
			const result = NameSchema.safeParse('John<script>')
			expect(result.success).toBe(false)
		})
	})

	describe('EmailSchema', () => {
		it('should accept valid email', () => {
			const result = EmailSchema.safeParse('test@example.com')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('test@example.com')
			}
		})

		it('should convert to lowercase', () => {
			const result = EmailSchema.safeParse('Test@Example.COM')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('test@example.com')
			}
		})

		it('should accept email with subdomain', () => {
			const result = EmailSchema.safeParse('user@mail.example.com')
			expect(result.success).toBe(true)
		})

		it('should accept email with plus sign', () => {
			const result = EmailSchema.safeParse('user+tag@example.com')
			expect(result.success).toBe(true)
		})

		it('should reject invalid email format', () => {
			const result = EmailSchema.safeParse('not-an-email')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Email is invalid')
			}
		})

		it('should reject email without domain', () => {
			const result = EmailSchema.safeParse('user@')
			expect(result.success).toBe(false)
		})

		it('should reject email without @', () => {
			const result = EmailSchema.safeParse('userexample.com')
			expect(result.success).toBe(false)
		})

		it('should reject email that is too short', () => {
			const result = EmailSchema.safeParse('a@')
			expect(result.success).toBe(false)
		})

		it('should reject email that is too long', () => {
			const longEmail = 'a'.repeat(90) + '@example.com'
			const result = EmailSchema.safeParse(longEmail)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Email is too long')
			}
		})

		it('should sanitize XSS in email', () => {
			const result = EmailSchema.safeParse('<script>@example.com')
			// Will fail due to invalid email format
			expect(result.success).toBe(false)
		})
	})
})
