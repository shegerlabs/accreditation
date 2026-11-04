import { SettingType } from '@prisma/client'
import { prisma } from './db.server'

// Cache for settings to avoid repeated database queries
const settingsCache = new Map<string, { value: unknown; expiresAt: number }>()
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes (bootstrap default)
const SHORT_CACHE_TTL = 10 * 1000 // 10 seconds for time-sensitive settings
const SHORT_TTL_KEYS = new Set(['maintenance.enabled', 'maintenance.message'])

// Get the current cache TTL (uses cached value if available, otherwise default)
function getCacheTTL(): number {
	const cacheKey = 'cache.ttlMinutes' // SettingKeys.CACHE_TTL_MINUTES value
	const cached = settingsCache.get(cacheKey)
	if (cached && cached.expiresAt > Date.now()) {
		return (cached.value as number) * 60 * 1000 // Convert minutes to milliseconds
	}
	return DEFAULT_CACHE_TTL
}

// Setting key constants organized by category
export const SettingKeys = {
	// Authentication & Security
	AUTH_MAX_LOGIN_ATTEMPTS: 'auth.maxLoginAttempts',
	AUTH_LOCKOUT_DURATION_MINUTES: 'auth.lockoutDurationMinutes',
	AUTH_AUTO_RESET_AFTER_MINUTES: 'auth.autoResetAfterMinutes',
	AUTH_MAX_LOCK_COUNT: 'auth.maxLockCount',
	AUTH_SESSION_EXPIRATION_DAYS: 'auth.sessionExpirationDays',
	AUTH_INACTIVITY_TIMEOUT_MINUTES: 'auth.inactivityTimeoutMinutes',
	AUTH_BCRYPT_SALT_ROUNDS: 'auth.bcryptSaltRounds',

	// OTP/Verification
	OTP_VALIDITY_MINUTES: 'otp.validityMinutes',

	// Email
	EMAIL_SENDER_ADDRESS: 'email.senderAddress',
	EMAIL_SEND_TIMEOUT_SECONDS: 'email.sendTimeoutSeconds',

	// File Upload
	UPLOAD_MAX_IMAGE_SIZE_MB: 'upload.maxImageSizeMB',
	UPLOAD_MAX_CSV_SIZE_MB: 'upload.maxCsvSizeMB',
	UPLOAD_ALLOWED_IMAGE_TYPES: 'upload.allowedImageTypes',

	// Cache
	CACHE_TTL_MINUTES: 'cache.ttlMinutes',

	// Pagination
	PAGINATION_DEFAULT_PAGE_SIZE: 'pagination.defaultPageSize',

	// SLA
	SLA_WARNING_THRESHOLD_PERCENT: 'sla.warningThresholdPercent',

	// Reprint
	REPRINT_MAX_COUNT: 'reprint.maxCount',
	REPRINT_WARNING_THRESHOLD: 'reprint.warningThreshold',

	// Backup
	BACKUP_RETENTION_DAYS: 'backup.retentionDays',
	BACKUP_MAX_COUNT: 'backup.maxCount',

	// Maintenance
	MAINTENANCE_MODE_ENABLED: 'maintenance.enabled',
	MAINTENANCE_MESSAGE: 'maintenance.message',
} as const

export type SettingKey = (typeof SettingKeys)[keyof typeof SettingKeys]

// Default values for all settings
export const DefaultSettings: Record<
	SettingKey,
	{
		value: unknown
		type: SettingType
		category: string
		label: string
		description: string
	}
> = {
	// Authentication & Security
	[SettingKeys.AUTH_MAX_LOGIN_ATTEMPTS]: {
		value: 5,
		type: 'NUMBER',
		category: 'auth',
		label: 'Max Login Attempts',
		description:
			'Maximum number of failed login attempts before account lockout',
	},
	[SettingKeys.AUTH_LOCKOUT_DURATION_MINUTES]: {
		value: 30,
		type: 'NUMBER',
		category: 'auth',
		label: 'Lockout Duration (minutes)',
		description:
			'How long an account remains locked after exceeding max login attempts',
	},
	[SettingKeys.AUTH_AUTO_RESET_AFTER_MINUTES]: {
		value: 60,
		type: 'NUMBER',
		category: 'auth',
		label: 'Auto Reset After (minutes)',
		description: 'Time after which failed login attempts counter resets',
	},
	[SettingKeys.AUTH_MAX_LOCK_COUNT]: {
		value: 3,
		type: 'NUMBER',
		category: 'auth',
		label: 'Max Lock Count',
		description:
			'Maximum number of automatic lockouts before requiring manual intervention',
	},
	[SettingKeys.AUTH_SESSION_EXPIRATION_DAYS]: {
		value: 30,
		type: 'NUMBER',
		category: 'auth',
		label: 'Session Expiration (days)',
		description: 'Number of days before a session expires',
	},
	[SettingKeys.AUTH_INACTIVITY_TIMEOUT_MINUTES]: {
		value: 60,
		type: 'NUMBER',
		category: 'auth',
		label: 'Inactivity Timeout (minutes)',
		description: 'Minutes of inactivity before automatic logout',
	},
	[SettingKeys.AUTH_BCRYPT_SALT_ROUNDS]: {
		value: 10,
		type: 'NUMBER',
		category: 'auth',
		label: 'Bcrypt Salt Rounds',
		description:
			'Number of salt rounds for password hashing (higher = more secure but slower)',
	},

	// OTP/Verification
	[SettingKeys.OTP_VALIDITY_MINUTES]: {
		value: 10,
		type: 'NUMBER',
		category: 'otp',
		label: 'OTP Validity (minutes)',
		description: 'How long a one-time password remains valid',
	},

	// Email
	[SettingKeys.EMAIL_SENDER_ADDRESS]: {
		value: 'DoNotReply@accreditation.africanunion.org',
		type: 'STRING',
		category: 'email',
		label: 'Sender Email Address',
		description: 'Email address used as the sender for all outgoing emails',
	},
	[SettingKeys.EMAIL_SEND_TIMEOUT_SECONDS]: {
		value: 180,
		type: 'NUMBER',
		category: 'email',
		label: 'Email Send Timeout (seconds)',
		description: 'Maximum time to wait for email delivery confirmation',
	},

	// File Upload
	[SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB]: {
		value: 3,
		type: 'NUMBER',
		category: 'upload',
		label: 'Max Image Size (MB)',
		description: 'Maximum file size for image uploads in megabytes',
	},
	[SettingKeys.UPLOAD_MAX_CSV_SIZE_MB]: {
		value: 5,
		type: 'NUMBER',
		category: 'upload',
		label: 'Max CSV Size (MB)',
		description: 'Maximum file size for CSV imports in megabytes',
	},
	[SettingKeys.UPLOAD_ALLOWED_IMAGE_TYPES]: {
		value: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
		type: 'JSON',
		category: 'upload',
		label: 'Allowed Image Types',
		description: 'List of allowed MIME types for image uploads',
	},

	// Cache
	[SettingKeys.CACHE_TTL_MINUTES]: {
		value: 5,
		type: 'NUMBER',
		category: 'cache',
		label: 'Cache TTL (minutes)',
		description: 'Time-to-live for cached data like countries and roles',
	},

	// Pagination
	[SettingKeys.PAGINATION_DEFAULT_PAGE_SIZE]: {
		value: 10,
		type: 'NUMBER',
		category: 'pagination',
		label: 'Default Page Size',
		description: 'Default number of items per page in lists',
	},

	// SLA
	[SettingKeys.SLA_WARNING_THRESHOLD_PERCENT]: {
		value: 75,
		type: 'NUMBER',
		category: 'sla',
		label: 'SLA Warning Threshold (%)',
		description:
			'Percentage of SLA duration at which warning status is triggered',
	},

	// Reprint
	[SettingKeys.REPRINT_MAX_COUNT]: {
		value: 3,
		type: 'NUMBER',
		category: 'reprint',
		label: 'Max Reprint Count',
		description: 'Maximum number of badge reprints allowed per participant',
	},
	[SettingKeys.REPRINT_WARNING_THRESHOLD]: {
		value: 2,
		type: 'NUMBER',
		category: 'reprint',
		label: 'Reprint Warning Threshold',
		description: 'Number of reprints at which warning color is shown',
	},

	// Backup
	[SettingKeys.BACKUP_RETENTION_DAYS]: {
		value: 30,
		type: 'NUMBER',
		category: 'backup',
		label: 'Backup Retention (days)',
		description: 'Number of days to retain backups before auto-cleanup',
	},
	[SettingKeys.BACKUP_MAX_COUNT]: {
		value: 10,
		type: 'NUMBER',
		category: 'backup',
		label: 'Max Backup Count',
		description: 'Maximum number of backups to keep',
	},

	// Maintenance
	[SettingKeys.MAINTENANCE_MODE_ENABLED]: {
		value: false,
		type: 'BOOLEAN',
		category: 'maintenance',
		label: 'Maintenance Mode',
		description: 'Enable maintenance mode to block non-admin users from accessing the system',
	},
	[SettingKeys.MAINTENANCE_MESSAGE]: {
		value: 'The system is temporarily unavailable while we apply updates. Please check back soon.',
		type: 'STRING',
		category: 'maintenance',
		label: 'Maintenance Message',
		description: 'Message displayed to users when maintenance mode is active',
	},
}

// Parse a value based on its type
function parseValue(value: string, type: SettingType): unknown {
	switch (type) {
		case 'NUMBER':
			return Number(value)
		case 'BOOLEAN':
			return value === 'true'
		case 'JSON':
			try {
				return JSON.parse(value)
			} catch {
				return value
			}
		case 'STRING':
		default:
			return value
	}
}

// Serialize a value for storage
function serializeValue(value: unknown): string {
	if (typeof value === 'object') {
		return JSON.stringify(value)
	}
	return String(value)
}

// Get cache key for a setting
function getCacheKey(key: string, tenantId: string | null): string {
	return tenantId ? `${key}:${tenantId}` : key
}

// Get a setting value with caching and tenant fallback
export async function getSetting<T = unknown>(
	key: SettingKey,
	tenantId: string | null = null,
): Promise<T> {
	const cacheKey = getCacheKey(key, tenantId)
	const now = Date.now()

	// Check cache first
	const cached = settingsCache.get(cacheKey)
	if (cached && cached.expiresAt > now) {
		return cached.value as T
	}

	// Try tenant-specific setting first, then fall back to global
	let setting = tenantId
		? await prisma.systemSetting.findFirst({
				where: { key, tenantId },
			})
		: null

	// Fall back to global setting if no tenant-specific one
	if (!setting) {
		setting = await prisma.systemSetting.findFirst({
			where: { key, tenantId: null },
		})
	}

	// Use default if not in database
	const defaultSetting = DefaultSettings[key]
	let value: unknown

	if (setting) {
		value = parseValue(setting.value, setting.type)
	} else if (defaultSetting) {
		value = defaultSetting.value
	} else {
		throw new Error(`Unknown setting key: ${key}`)
	}

	// Cache the value (use short TTL for time-sensitive keys)
	const ttl = SHORT_TTL_KEYS.has(key) ? SHORT_CACHE_TTL : getCacheTTL()
	settingsCache.set(cacheKey, {
		value,
		expiresAt: now + ttl,
	})

	return value as T
}

// Get multiple settings at once (more efficient)
export async function getSettings<T extends Record<string, unknown>>(
	keys: SettingKey[],
	tenantId: string | null = null,
): Promise<T> {
	const result: Record<string, unknown> = {}

	for (const key of keys) {
		result[key] = await getSetting(key, tenantId)
	}

	return result as T
}

// Update a setting value
export async function updateSetting(
	key: SettingKey,
	value: unknown,
	tenantId: string | null = null,
): Promise<void> {
	const defaultSetting = DefaultSettings[key]
	if (!defaultSetting) {
		throw new Error(`Unknown setting key: ${key}`)
	}

	// Find existing setting
	const existing = await prisma.systemSetting.findFirst({
		where: { key, tenantId },
	})

	if (existing) {
		await prisma.systemSetting.update({
			where: { id: existing.id },
			data: {
				value: serializeValue(value),
				updatedAt: new Date(),
			},
		})
	} else {
		await prisma.systemSetting.create({
			data: {
				key,
				value: serializeValue(value),
				type: defaultSetting.type,
				category: defaultSetting.category,
				label: defaultSetting.label,
				description: defaultSetting.description,
				tenantId,
			},
		})
	}

	// Invalidate cache
	const cacheKey = getCacheKey(key, tenantId)
	settingsCache.delete(cacheKey)
}

// Clear the settings cache (useful when settings are bulk updated)
export function clearSettingsCache(): void {
	settingsCache.clear()
}

// Get all settings for a category
export async function getSettingsByCategory(
	category: string,
	tenantId: string | null = null,
): Promise<
	Array<{
		key: string
		value: unknown
		type: SettingType
		label: string
		description: string | null
		isDefault: boolean
	}>
> {
	// Get settings from database
	const dbSettings = await prisma.systemSetting.findMany({
		where: {
			category,
			OR: [{ tenantId }, { tenantId: null }],
		},
	})

	// Create a map for quick lookup
	const dbSettingsMap = new Map<string, (typeof dbSettings)[0]>()
	for (const setting of dbSettings) {
		// Prefer tenant-specific over global
		if (setting.tenantId === tenantId || !dbSettingsMap.has(setting.key)) {
			dbSettingsMap.set(setting.key, setting)
		}
	}

	// Build result with defaults
	const result: Array<{
		key: string
		value: unknown
		type: SettingType
		label: string
		description: string | null
		isDefault: boolean
	}> = []

	for (const [key, defaultSetting] of Object.entries(DefaultSettings)) {
		if (defaultSetting.category !== category) continue

		const dbSetting = dbSettingsMap.get(key)
		if (dbSetting) {
			result.push({
				key,
				value: parseValue(dbSetting.value, dbSetting.type),
				type: dbSetting.type,
				label: dbSetting.label,
				description: dbSetting.description,
				isDefault: false,
			})
		} else {
			result.push({
				key,
				value: defaultSetting.value,
				type: defaultSetting.type,
				label: defaultSetting.label,
				description: defaultSetting.description,
				isDefault: true,
			})
		}
	}

	return result
}

// Get all categories
export function getSettingCategories(): Array<{ id: string; label: string }> {
	const categories = new Set<string>()
	for (const setting of Object.values(DefaultSettings)) {
		categories.add(setting.category)
	}

	const categoryLabels: Record<string, string> = {
		auth: 'Authentication & Security',
		otp: 'OTP & Verification',
		email: 'Email',
		upload: 'File Uploads',
		cache: 'Cache',
		pagination: 'Pagination',
		sla: 'SLA',
		reprint: 'Badge Reprints',
		backup: 'Backups',
		maintenance: 'Maintenance',
	}

	return Array.from(categories).map((id) => ({
		id,
		label: categoryLabels[id] || id,
	}))
}

// Seed all default settings to database (run once during setup)
export async function seedDefaultSettings(): Promise<void> {
	for (const [key, setting] of Object.entries(DefaultSettings)) {
		// Check if setting already exists
		const existing = await prisma.systemSetting.findFirst({
			where: { key, tenantId: null },
		})

		if (!existing) {
			await prisma.systemSetting.create({
				data: {
					key,
					value: serializeValue(setting.value),
					type: setting.type,
					category: setting.category,
					label: setting.label,
					description: setting.description,
					tenantId: null,
				},
			})
		}
	}
}
