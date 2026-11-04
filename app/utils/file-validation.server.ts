import { fileTypeFromBuffer } from 'file-type'
import { getSetting, SettingKeys } from './settings.server'

/**
 * Validates that a file's actual content matches its claimed MIME type.
 * This prevents MIME type spoofing attacks where malicious files are
 * disguised as safe file types.
 */
export async function validateFileType(
	buffer: Buffer,
	claimedType: string,
): Promise<{ valid: boolean; detectedType: string | null }> {
	// Convert Buffer to Uint8Array for file-type compatibility
	const uint8Array = new Uint8Array(buffer)
	const result = await fileTypeFromBuffer(uint8Array)

	// If we couldn't detect the type, be conservative and reject
	if (!result) {
		return { valid: false, detectedType: null }
	}

	// Normalize MIME types for comparison
	const normalizedClaimed = claimedType.toLowerCase()
	const normalizedDetected = result.mime.toLowerCase()

	// Check if the detected type matches the claimed type
	const valid = normalizedClaimed === normalizedDetected

	return { valid, detectedType: result.mime }
}

/**
 * Default allowed MIME types (fallback if settings not loaded)
 * @deprecated Use getAllowedImageTypes() or getAllowedDocumentTypes() instead
 */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const
export const ALLOWED_DOCUMENT_TYPES = [
	'image/png',
	'image/jpeg',
	'application/pdf',
] as const

/**
 * Get allowed image types from settings
 */
export async function getAllowedImageTypes(): Promise<string[]> {
	return getSetting<string[]>(SettingKeys.UPLOAD_ALLOWED_IMAGE_TYPES)
}

/**
 * Get allowed document types (images + PDF)
 */
export async function getAllowedDocumentTypes(): Promise<string[]> {
	const imageTypes = await getAllowedImageTypes()
	// Always include PDF for documents
	return [...imageTypes, 'application/pdf']
}

/**
 * Validates a file buffer against allowed types for photos
 */
export async function validatePhotoFile(
	buffer: Buffer,
	claimedType: string,
): Promise<{ valid: boolean; error?: string }> {
	const { valid, detectedType } = await validateFileType(buffer, claimedType)

	if (!valid) {
		if (!detectedType) {
			return { valid: false, error: 'Could not determine file type' }
		}
		return {
			valid: false,
			error: `File type mismatch: claimed ${claimedType} but detected ${detectedType}`,
		}
	}

	const allowedTypes = await getAllowedImageTypes()
	if (!allowedTypes.includes(claimedType)) {
		return {
			valid: false,
			error: `Only ${allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} files are allowed for photos`,
		}
	}

	return { valid: true }
}

/**
 * Validates a file buffer against allowed types for documents
 */
export async function validateDocumentFile(
	buffer: Buffer,
	claimedType: string,
): Promise<{ valid: boolean; error?: string }> {
	const { valid, detectedType } = await validateFileType(buffer, claimedType)

	if (!valid) {
		if (!detectedType) {
			return { valid: false, error: 'Could not determine file type' }
		}
		return {
			valid: false,
			error: `File type mismatch: claimed ${claimedType} but detected ${detectedType}`,
		}
	}

	const allowedTypes = await getAllowedDocumentTypes()
	if (!allowedTypes.includes(claimedType)) {
		return {
			valid: false,
			error: `Only ${allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} files are allowed`,
		}
	}

	return { valid: true }
}
