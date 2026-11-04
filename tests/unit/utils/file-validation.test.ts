import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	validateFileType,
	validatePhotoFile,
	validateDocumentFile,
	ALLOWED_IMAGE_TYPES,
	ALLOWED_DOCUMENT_TYPES,
} from '~/utils/file-validation.server'

// Mock the settings module to avoid Prisma database dependency
vi.mock('~/utils/settings.server', () => ({
	getSetting: vi.fn().mockResolvedValue(['image/png', 'image/jpeg']),
	SettingKeys: {
		UPLOAD_ALLOWED_IMAGE_TYPES: 'UPLOAD_ALLOWED_IMAGE_TYPES',
	},
}))

// =============================================================================
// FILE MAGIC BYTES FOR TESTING
// These are the actual magic bytes that identify file types
// =============================================================================

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC_BYTES = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52,
])

// JPEG magic bytes: FF D8 FF
const JPEG_MAGIC_BYTES = Buffer.from([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])

// PDF magic bytes: 25 50 44 46 (%PDF)
const PDF_MAGIC_BYTES = Buffer.from([
	0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
])

// Plain text (no recognizable magic bytes)
const TEXT_BYTES = Buffer.from('Hello, this is plain text content')

// Fake PNG - claims to be PNG but has JPEG magic bytes
const FAKE_PNG_WITH_JPEG_BYTES = JPEG_MAGIC_BYTES

// =============================================================================
// TESTS: validateFileType
// =============================================================================

describe('validateFileType', () => {
	describe('PNG files', () => {
		it('should validate genuine PNG with correct claimed type', async () => {
			const result = await validateFileType(PNG_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(true)
			expect(result.detectedType).toBe('image/png')
		})

		it('should reject PNG bytes with wrong claimed type', async () => {
			const result = await validateFileType(PNG_MAGIC_BYTES, 'image/jpeg')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe('image/png')
		})

		it('should handle case-insensitive MIME type comparison', async () => {
			const result = await validateFileType(PNG_MAGIC_BYTES, 'IMAGE/PNG')
			expect(result.valid).toBe(true)
		})
	})

	describe('JPEG files', () => {
		it('should validate genuine JPEG with correct claimed type', async () => {
			const result = await validateFileType(JPEG_MAGIC_BYTES, 'image/jpeg')
			expect(result.valid).toBe(true)
			expect(result.detectedType).toBe('image/jpeg')
		})

		it('should reject JPEG bytes with wrong claimed type', async () => {
			const result = await validateFileType(JPEG_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe('image/jpeg')
		})
	})

	describe('PDF files', () => {
		it('should validate genuine PDF with correct claimed type', async () => {
			const result = await validateFileType(PDF_MAGIC_BYTES, 'application/pdf')
			expect(result.valid).toBe(true)
			expect(result.detectedType).toBe('application/pdf')
		})

		it('should reject PDF bytes with wrong claimed type', async () => {
			const result = await validateFileType(PDF_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe('application/pdf')
		})
	})

	describe('Unrecognized files', () => {
		it('should reject plain text files (no magic bytes)', async () => {
			const result = await validateFileType(TEXT_BYTES, 'text/plain')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe(null)
		})

		it('should reject empty buffers', async () => {
			const result = await validateFileType(Buffer.from([]), 'image/png')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe(null)
		})
	})

	describe('MIME type spoofing attacks', () => {
		it('should detect JPEG disguised as PNG', async () => {
			const result = await validateFileType(
				FAKE_PNG_WITH_JPEG_BYTES,
				'image/png',
			)
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe('image/jpeg')
		})

		it('should detect PDF disguised as image', async () => {
			const result = await validateFileType(PDF_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.detectedType).toBe('application/pdf')
		})
	})
})

// =============================================================================
// TESTS: validatePhotoFile
// =============================================================================

describe('validatePhotoFile', () => {
	describe('Valid photo uploads', () => {
		it('should accept valid PNG photo', async () => {
			const result = await validatePhotoFile(PNG_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		it('should accept valid JPEG photo', async () => {
			const result = await validatePhotoFile(JPEG_MAGIC_BYTES, 'image/jpeg')
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})
	})

	describe('Invalid photo uploads', () => {
		it('should reject PDF for photo (not allowed type)', async () => {
			const result = await validatePhotoFile(
				PDF_MAGIC_BYTES,
				'application/pdf',
			)
			expect(result.valid).toBe(false)
			// Error message varies based on allowed types from settings
			expect(result.error).toContain('files are allowed for photos')
		})

		it('should reject spoofed photo (JPEG claiming to be PNG)', async () => {
			const result = await validatePhotoFile(JPEG_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.error).toContain('File type mismatch')
			expect(result.error).toContain('claimed image/png')
			expect(result.error).toContain('detected image/jpeg')
		})

		it('should reject unrecognizable file type', async () => {
			const result = await validatePhotoFile(TEXT_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.error).toBe('Could not determine file type')
		})
	})
})

// =============================================================================
// TESTS: validateDocumentFile
// =============================================================================

describe('validateDocumentFile', () => {
	describe('Valid document uploads', () => {
		it('should accept valid PNG document', async () => {
			const result = await validateDocumentFile(PNG_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		it('should accept valid JPEG document', async () => {
			const result = await validateDocumentFile(JPEG_MAGIC_BYTES, 'image/jpeg')
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		it('should accept valid PDF document', async () => {
			const result = await validateDocumentFile(
				PDF_MAGIC_BYTES,
				'application/pdf',
			)
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})
	})

	describe('Invalid document uploads', () => {
		it('should reject spoofed document (PDF claiming to be PNG)', async () => {
			const result = await validateDocumentFile(PDF_MAGIC_BYTES, 'image/png')
			expect(result.valid).toBe(false)
			expect(result.error).toContain('File type mismatch')
			expect(result.error).toContain('claimed image/png')
			expect(result.error).toContain('detected application/pdf')
		})

		it('should reject unrecognizable file type', async () => {
			const result = await validateDocumentFile(TEXT_BYTES, 'application/pdf')
			expect(result.valid).toBe(false)
			expect(result.error).toBe('Could not determine file type')
		})

		it('should reject disallowed file type (e.g., executable)', async () => {
			// Even if magic bytes are detected, disallowed types are rejected
			const result = await validateDocumentFile(
				PNG_MAGIC_BYTES,
				'application/octet-stream',
			)
			expect(result.valid).toBe(false)
		})
	})
})

// =============================================================================
// TESTS: Constants
// =============================================================================

describe('Allowed file types constants', () => {
	it('ALLOWED_IMAGE_TYPES should only include PNG and JPEG', () => {
		expect(ALLOWED_IMAGE_TYPES).toContain('image/png')
		expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg')
		expect(ALLOWED_IMAGE_TYPES).toHaveLength(2)
	})

	it('ALLOWED_DOCUMENT_TYPES should include PNG, JPEG, and PDF', () => {
		expect(ALLOWED_DOCUMENT_TYPES).toContain('image/png')
		expect(ALLOWED_DOCUMENT_TYPES).toContain('image/jpeg')
		expect(ALLOWED_DOCUMENT_TYPES).toContain('application/pdf')
		expect(ALLOWED_DOCUMENT_TYPES).toHaveLength(3)
	})
})
