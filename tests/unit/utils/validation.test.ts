import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// =============================================================================
// ATTACHMENT VALIDATION SCHEMA (extracted for testing)
// =============================================================================

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

const AttachmentFieldSetSchema = z
	.object({
		id: z.string().optional(),
		file: z
			.instanceof(File)
			.optional()
			.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
				message: 'File size must be less than 3MB',
			}),
		altText: z.string().optional(),
		documentType: z.enum(['PASSPORT', 'PHOTO', 'LETTER']),
	})
	.superRefine((data, ctx) => {
		if (!data.file) return

		const isPhoto = data.documentType === 'PHOTO'
		const allowedTypes = isPhoto
			? ['image/png', 'image/jpeg']
			: ['image/png', 'image/jpeg', 'application/pdf']

		if (!allowedTypes.includes(data.file.type)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: isPhoto
					? 'Only PNG or JPG files are allowed for photos'
					: 'Only PNG, JPG, or PDF files are allowed',
				path: ['file'],
			})
		}
	})
	.refine(
		data => {
			return Boolean(data.id) || Boolean(data.file?.size)
		},
		{
			message: 'A file must be attached',
			path: ['file'],
		},
	)

// =============================================================================
// REGISTRATION FORM BASE SCHEMA (simplified for testing)
// =============================================================================

const xssTransform = (value: string) => value.trim()

const PassportNumberSchema = z
	.string({ required_error: 'Passport Number is required' })
	.regex(/^[a-zA-Z0-9- ]+$/, { message: 'Invalid passport number' })
	.transform(xssTransform)
	.transform(value => value?.replace(/[- ]/g, '') ?? '')
	.transform(value => value.toUpperCase())

const EmailSchema = z
	.string()
	.email({ message: 'Email is invalid' })
	.min(3, { message: 'Email is too short' })
	.max(100, { message: 'Email is too long' })
	.transform(value => value.toLowerCase())
	.transform(xssTransform)
	.optional()
	.or(z.literal(''))

const DateOfBirthSchema = z
	.date({ required_error: 'Date of Birth is required' })
	.max(new Date(), { message: 'Date of Birth cannot be in the future' })

// =============================================================================
// TESTS
// =============================================================================

describe('Registration Form Validation', () => {
	describe('Passport Number Validation', () => {
		it('should accept valid passport numbers', () => {
			const result = PassportNumberSchema.safeParse('AB123456')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('AB123456')
			}
		})

		it('should accept passport numbers with spaces and hyphens', () => {
			const result = PassportNumberSchema.safeParse('AB-123 456')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('AB123456')
			}
		})

		it('should convert passport numbers to uppercase', () => {
			const result = PassportNumberSchema.safeParse('ab123456')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('AB123456')
			}
		})

		it('should reject passport numbers with special characters', () => {
			const result = PassportNumberSchema.safeParse('AB@123#456')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Invalid passport number')
			}
		})

		it('should reject empty passport numbers', () => {
			const result = PassportNumberSchema.safeParse('')
			expect(result.success).toBe(false)
		})
	})

	describe('Email Validation', () => {
		it('should accept valid emails', () => {
			const result = EmailSchema.safeParse('test@example.com')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('test@example.com')
			}
		})

		it('should convert emails to lowercase', () => {
			const result = EmailSchema.safeParse('Test@Example.COM')
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data).toBe('test@example.com')
			}
		})

		it('should allow empty email (optional for focal users)', () => {
			const result = EmailSchema.safeParse('')
			expect(result.success).toBe(true)
		})

		it('should allow undefined email (optional for focal users)', () => {
			const result = EmailSchema.safeParse(undefined)
			expect(result.success).toBe(true)
		})

		it('should reject invalid email format', () => {
			const result = EmailSchema.safeParse('not-an-email')
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Email is invalid')
			}
		})

		it('should reject email that is too long', () => {
			const longEmail = 'a'.repeat(100) + '@example.com'
			const result = EmailSchema.safeParse(longEmail)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Email is too long')
			}
		})
	})

	describe('Date of Birth Validation', () => {
		it('should accept valid past dates', () => {
			const pastDate = new Date('1990-01-01')
			const result = DateOfBirthSchema.safeParse(pastDate)
			expect(result.success).toBe(true)
		})

		it('should accept today as date of birth', () => {
			const today = new Date()
			today.setHours(0, 0, 0, 0)
			const result = DateOfBirthSchema.safeParse(today)
			expect(result.success).toBe(true)
		})

		it('should reject future dates', () => {
			const futureDate = new Date()
			futureDate.setFullYear(futureDate.getFullYear() + 1)
			const result = DateOfBirthSchema.safeParse(futureDate)
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					'Date of Birth cannot be in the future',
				)
			}
		})
	})

	describe('Document Attachment Validation', () => {
		it('should accept document with existing id', () => {
			const result = AttachmentFieldSetSchema.safeParse({
				id: 'existing-doc-id',
				documentType: 'PASSPORT',
			})
			expect(result.success).toBe(true)
		})

		it('should reject document without file or id', () => {
			const result = AttachmentFieldSetSchema.safeParse({
				documentType: 'PASSPORT',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('A file must be attached')
			}
		})

		it('should accept valid photo file (JPEG)', () => {
			const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'PHOTO',
			})
			expect(result.success).toBe(true)
		})

		it('should accept valid photo file (PNG)', () => {
			const file = new File(['content'], 'photo.png', { type: 'image/png' })
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'PHOTO',
			})
			expect(result.success).toBe(true)
		})

		it('should reject PDF for photo document type', () => {
			const file = new File(['content'], 'photo.pdf', {
				type: 'application/pdf',
			})
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'PHOTO',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					'Only PNG or JPG files are allowed for photos',
				)
			}
		})

		it('should accept PDF for passport document type', () => {
			const file = new File(['content'], 'passport.pdf', {
				type: 'application/pdf',
			})
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'PASSPORT',
			})
			expect(result.success).toBe(true)
		})

		it('should accept PDF for letter document type', () => {
			const file = new File(['content'], 'letter.pdf', {
				type: 'application/pdf',
			})
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'LETTER',
			})
			expect(result.success).toBe(true)
		})

		it('should reject file larger than 3MB', () => {
			// Create a file larger than 3MB
			const largeContent = new ArrayBuffer(4 * 1024 * 1024) // 4MB
			const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' })
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'PHOTO',
			})
			expect(result.success).toBe(false)
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					'File size must be less than 3MB',
				)
			}
		})

		it('should reject invalid document type', () => {
			const file = new File(['content'], 'doc.jpg', { type: 'image/jpeg' })
			const result = AttachmentFieldSetSchema.safeParse({
				file,
				documentType: 'INVALID',
			})
			expect(result.success).toBe(false)
		})
	})
})

describe('Document Requirements Validation', () => {
	const DocumentsSchema = z
		.array(AttachmentFieldSetSchema)
		.superRefine((documents, ctx) => {
			const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
			const missingTypes = requiredTypes.filter(
				type =>
					!documents.some(
						doc =>
							doc.documentType === type &&
							(Boolean(doc.id) || Boolean(doc.file?.size)),
					),
			)

			if (missingTypes.length > 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Missing required documents: ${missingTypes.join(', ')}`,
				})
			}
		})

	it('should accept when all required documents are present', () => {
		const documents = [
			{ id: 'passport-id', documentType: 'PASSPORT' as const },
			{ id: 'photo-id', documentType: 'PHOTO' as const },
			{ id: 'letter-id', documentType: 'LETTER' as const },
		]
		const result = DocumentsSchema.safeParse(documents)
		expect(result.success).toBe(true)
	})

	it('should reject when passport is missing', () => {
		const documents = [
			{ id: 'photo-id', documentType: 'PHOTO' as const },
			{ id: 'letter-id', documentType: 'LETTER' as const },
		]
		const result = DocumentsSchema.safeParse(documents)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('PASSPORT')
		}
	})

	it('should reject when photo is missing', () => {
		const documents = [
			{ id: 'passport-id', documentType: 'PASSPORT' as const },
			{ id: 'letter-id', documentType: 'LETTER' as const },
		]
		const result = DocumentsSchema.safeParse(documents)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('PHOTO')
		}
	})

	it('should reject when letter is missing', () => {
		const documents = [
			{ id: 'passport-id', documentType: 'PASSPORT' as const },
			{ id: 'photo-id', documentType: 'PHOTO' as const },
		]
		const result = DocumentsSchema.safeParse(documents)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('LETTER')
		}
	})

	it('should reject when multiple documents are missing', () => {
		const documents = [{ id: 'passport-id', documentType: 'PASSPORT' as const }]
		const result = DocumentsSchema.safeParse(documents)
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0].message).toContain('PHOTO')
			expect(result.error.issues[0].message).toContain('LETTER')
		}
	})
})
