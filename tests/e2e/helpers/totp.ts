import { generateTOTP } from '@epic-web/totp'

export interface TOTPConfig {
	secret: string
	algorithm?: string
	digits?: number
	period?: number
	charSet?: string
}

/**
 * Generate a valid TOTP code for testing
 * This uses the same library as the app to ensure compatibility
 *
 * IMPORTANT: Don't pass charSet unless specifically needed.
 * The default charSet is '0123456789' which produces numeric OTP codes.
 * The base32 alphabet ('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567') is only for encoding secrets.
 */
export function generateValidTOTPCode(config: TOTPConfig): string {
	const result = generateTOTP({
		secret: config.secret,
		algorithm: config.algorithm ?? 'SHA1',
		digits: config.digits ?? 6,
		period: config.period ?? 30,
		// Don't pass charSet - use default '0123456789' for numeric codes
	})

	return result.otp
}

/**
 * Extract TOTP secret from an OTP URI
 * OTP URIs have the format: otpauth://totp/Label?secret=XXXX&...
 */
export function extractSecretFromOTPUri(otpUri: string): string | null {
	try {
		const url = new URL(otpUri)
		return url.searchParams.get('secret')
	} catch {
		return null
	}
}

/**
 * Extract TOTP parameters from an OTP URI
 */
export function extractParamsFromOTPUri(otpUri: string): TOTPConfig | null {
	try {
		const url = new URL(otpUri)
		const secret = url.searchParams.get('secret')

		if (!secret) return null

		return {
			secret,
			algorithm: url.searchParams.get('algorithm') ?? 'SHA1',
			digits: parseInt(url.searchParams.get('digits') ?? '6', 10),
			period: parseInt(url.searchParams.get('period') ?? '30', 10),
		}
	} catch {
		return null
	}
}
