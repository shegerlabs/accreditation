import { z } from 'zod'

const schema = z.object({
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
	// Optional: Only required if using Resend instead of Azure Communication Services
	RESEND_API_KEY: z.string().optional(),
	// Security: Domain allowlist for X-Forwarded-Host validation (comma-separated)
	// Prevents host header injection attacks in password reset emails
	ALLOWED_DOMAINS: z.string().optional(),
	// Shared secret for admin impersonation tokens (must match admin system)
	IMPERSONATION_SECRET: z.string().min(32).optional(),
	// Admin portal URL for redirecting back after stopping impersonation
	ADMIN_PORTAL_URL: z.string().optional(),
})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export function init() {
	const parsed = schema.safeParse(process.env)

	if (parsed.success === false) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
	return {
		MODE: process.env.NODE_ENV,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
