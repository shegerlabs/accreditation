import { AuditAction, AuditEntityType, Password, User } from '@prisma/client'
import { json, redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { addMinutes, isBefore } from 'date-fns'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { createAuditLog } from './audit.server'
import { prisma } from './db.server'
import { combineResponses } from './misc'
import { sessionStorage } from './session.server'
import { getSetting, SettingKeys } from './settings.server'
import { parsePermissionString, PermissionString } from './user'

// Impersonation token payload structure
interface ImpersonationTokenPayload {
	userId: string // User to impersonate
	adminId: string // Admin who initiated
	adminName: string // Admin display name
	tenantId: string // Tenant ID for validation
	returnUrl?: string // Admin app URL to return to after stopping
	iat: number // Issued at
	exp: number // Expiration
}

// Session metadata structure with impersonation info
export interface SessionMetadata {
	fingerprint?: string
	isImpersonating?: boolean
	impersonatedBy?: string // Admin user ID
	impersonatedByName?: string // Admin name for display
	returnUrl?: string // Admin app URL to return to after stopping impersonation
}

export const getSessionExpirationDate = async () => {
	const sessionExpirationDays = await getSetting<number>(
		SettingKeys.AUTH_SESSION_EXPIRATION_DAYS,
	)
	const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * sessionExpirationDays
	return new Date(Date.now() + SESSION_EXPIRATION_TIME)
}

export const sessionKey = 'sessionId'

function generateFingerprint(request: Request): string {
	// Start with universally supported headers
	const components = [
		request.headers.get('user-agent') || '',
		request.headers.get('accept-language') || '',
	]

	// Add modern headers only if available
	const modernHeaders = ['sec-ch-ua', 'sec-ch-ua-platform']
	modernHeaders.forEach(header => {
		const value = request.headers.get(header)
		if (value) components.push(value)
	})

	return crypto
		.createHmac('sha256', process.env.SESSION_SECRET)
		.update(components.filter(Boolean).join('|'))
		.digest('hex')
}

export async function getUserId(request: Request) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)
	if (!sessionId) return null

	const session = await prisma.session.findUnique({
		select: { userId: true, metadata: true },
		where: { id: sessionId },
	})

	if (!session) {
		throw await logout({ request })
	}

	// Fingerprint validation to prevent session hijacking
	// Only skip in test environment to allow E2E tests with different browser contexts
	const isTestEnvironment = process.env.NODE_ENV === 'test'

	if (!isTestEnvironment) {
		const currentFingerprint = generateFingerprint(request)
		const sessionMetadata = session.metadata as { fingerprint: string } | null

		if (
			sessionMetadata?.fingerprint &&
			currentFingerprint !== sessionMetadata.fingerprint
		) {
			throw await logout({ request })
		}
	}

	return session.userId
}

export async function getUser(userId: string) {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			username: true,
			name: true,
			tenantId: true,
			image: { select: { id: true } },
			roles: {
				select: {
					name: true,
					permissions: {
						select: {
							entity: true,
							action: true,
							access: true,
						},
					},
					menus: {
						select: {
							id: true,
							name: true,
							title: true,
						},
					},
					menuItems: {
						select: {
							id: true,
							menuId: true,
							name: true,
							title: true,
							icon: true,
							link: true,
						},
					},
				},
			},
			password: false, // intentionally omit password
		},
	})
}

export async function requireAnonymous(request: Request) {
	const userId = await getUserId(request)
	if (userId) {
		throw redirect('/')
	}
}

export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request)
	if (!userId) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`)
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}

	return userId
}

export async function requireUser(request: Request) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		select: { id: true, username: true, tenantId: true },
		where: { id: userId },
	})
	if (!user) {
		throw await logout({ request })
	}
	return user
}

export async function login({
	username,
	password,
	request,
}: {
	username: User['username']
	password: string
	request: Request
}) {
	const user = await verifyUserPassword({ username }, password)
	if (!user) return null

	const metadata = {
		fingerprint: generateFingerprint(request),
	}

	const session = await prisma.session.create({
		select: { id: true, userId: true, expirationDate: true },
		data: {
			userId: user.id,
			expirationDate: await getSessionExpirationDate(),
			metadata,
		},
	})

	return session
}

export async function signup({
	email,
	username,
	password,
	name,
	request,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	password: string
	request: Request
}) {
	const hashedPassword = await getPasswordHash(password)

	const metadata = {
		fingerprint: generateFingerprint(request),
	}

	const session = await prisma.session.create({
		select: { id: true, expirationDate: true },
		data: {
			expirationDate: await getSessionExpirationDate(),
			metadata,
			user: {
				create: {
					email: email.toLowerCase(),
					username: username.toLowerCase(),
					name,
					roles: {
						connect: [{ name: 'user' }],
					},
					password: {
						create: {
							hash: hashedPassword,
						},
					},
				},
			},
		},
	})

	return session
}

export async function logout(
	{
		request,
		redirectTo = '/',
	}: {
		request: Request
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const sessionId = cookieSession.get(sessionKey)
	void prisma.session.delete({ where: { id: sessionId } }).catch(() => {})

	throw redirect(
		safeRedirect(redirectTo),
		combineResponses(responseInit, {
			headers: {
				'set-cookie': await sessionStorage.destroySession(cookieSession),
			},
		}),
	)
}

export async function getPasswordHash(password: string) {
	const saltRounds = await getSetting<number>(SettingKeys.AUTH_BCRYPT_SALT_ROUNDS)
	const hash = await bcrypt.hash(password, saltRounds)
	return hash
}

export async function verifyUserPassword(
	where: Pick<User, 'username'> | Pick<User, 'id'>,
	password: Password['hash'],
) {
	// Fetch auth settings from database
	const [maxLoginAttempts, lockoutDurationMinutes, autoResetAfterMinutes, maxLockCount] =
		await Promise.all([
			getSetting<number>(SettingKeys.AUTH_MAX_LOGIN_ATTEMPTS),
			getSetting<number>(SettingKeys.AUTH_LOCKOUT_DURATION_MINUTES),
			getSetting<number>(SettingKeys.AUTH_AUTO_RESET_AFTER_MINUTES),
			getSetting<number>(SettingKeys.AUTH_MAX_LOCK_COUNT),
		])

	const userWithPassword = await prisma.user.findUnique({
		where,
		select: {
			id: true,
			tenantId: true,
			status: true,
			failedLoginAttempts: true,
			lastFailedLoginAt: true,
			autoUnlockAt: true,
			lockCount: true,
			password: { select: { hash: true } },
		},
	})

	if (!userWithPassword || !userWithPassword.password) {
		return null
	}

	// Check if account is locked
	if (userWithPassword.status === 'LOCKED') {
		// If lock count is too high, require manual intervention
		if (userWithPassword.lockCount >= maxLockCount) {
			throw new Error(
				'Account is permanently locked due to multiple security violations. Please contact an administrator.',
			)
		}

		// If no auto-unlock time is set, this is a manual/permanent lock
		if (!userWithPassword.autoUnlockAt) {
			throw new Error(
				'Account is locked. Please contact an administrator.',
			)
		}

		// If auto-unlock time is in the future, block login
		if (isBefore(new Date(), userWithPassword.autoUnlockAt)) {
			throw new Error('Account is locked. Please try again later.')
		}

		// Auto-unlock time has passed - unlock the account
		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				status: 'ACTIVE',
				failedLoginAttempts: 0,
				lockedAt: null,
				lockReason: null,
				autoUnlockAt: null,
			},
		})
	}

	// Check if we should reset failed attempts due to time passed
	if (
		userWithPassword.lastFailedLoginAt &&
		isBefore(
			addMinutes(
				userWithPassword.lastFailedLoginAt,
				autoResetAfterMinutes,
			),
			new Date(),
		)
	) {
		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				failedLoginAttempts: 0,
				lastFailedLoginAt: null,
			},
		})
	}

	const isValid = await bcrypt.compare(password, userWithPassword.password.hash)

	if (!isValid) {
		// Increment failed attempts
		const failedAttempts = (userWithPassword.failedLoginAttempts || 0) + 1
		const updates = {
			failedLoginAttempts: failedAttempts,
			lastFailedLoginAt: new Date(),
			status: undefined as 'LOCKED' | undefined,
			lockedAt: undefined as Date | undefined,
			lockReason: undefined as string | undefined,
			lockCount: undefined as number | undefined,
			autoUnlockAt: undefined as Date | null | undefined,
		}

		// Lock account if max attempts reached
		if (failedAttempts >= maxLoginAttempts) {
			const finalLockCount = (userWithPassword.lockCount || 0) + 1
			updates.status = 'LOCKED'
			updates.lockedAt = new Date()
			updates.lockReason = 'Too many failed login attempts'
			updates.lockCount = finalLockCount
			updates.autoUnlockAt =
				finalLockCount >= maxLockCount
					? null // No auto-unlock for accounts locked too many times
					: addMinutes(new Date(), lockoutDurationMinutes)
		}

		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				...updates,
				status: updates.status as 'LOCKED' | undefined,
			},
		})

		// Create audit log for failed login
		await createAuditLog({
			action: AuditAction.LOGIN_FAILED,
			entityType: AuditEntityType.USER,
			entityId: userWithPassword.id,
			description: `Failed login attempt ${failedAttempts}/${maxLoginAttempts}`,
			userId: userWithPassword.id,
			tenantId: userWithPassword.tenantId,
			metadata: {
				failedAttempts,
				isLocked: failedAttempts >= maxLoginAttempts,
				lockCount: updates.lockCount || userWithPassword.lockCount || 0,
			},
		})

		if (failedAttempts >= maxLoginAttempts) {
			const message =
				(updates.lockCount || 0) >= maxLockCount
					? 'Account has been permanently locked due to multiple security violations. Please contact an administrator.'
					: `Account locked due to too many failed attempts. Please try again after ${lockoutDurationMinutes} minutes.`
			throw new Error(message)
		}

		return null
	}

	// Reset failed attempts on successful login
	if (userWithPassword.failedLoginAttempts > 0) {
		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				failedLoginAttempts: 0,
				lastFailedLoginAt: null,
			},
		})
	}

	// Create successful login audit log
	await createAuditLog({
		action: AuditAction.LOGIN,
		entityType: AuditEntityType.USER,
		entityId: userWithPassword.id,
		description: 'Successful login',
		userId: userWithPassword.id,
		tenantId: userWithPassword.tenantId,
	})

	return { id: userWithPassword.id, tenantId: userWithPassword.tenantId }
}

export async function requireUserWithPermission(
	request: Request,
	permission: PermissionString,
) {
	const userId = await requireUserId(request)
	const permissionData = parsePermissionString(permission)
	const user = await prisma.user.findFirst({
		select: { id: true },
		where: {
			id: userId,
			roles: {
				some: {
					permissions: {
						some: {
							...permissionData,
							access: permissionData.access
								? { in: permissionData.access }
								: undefined,
						},
					},
				},
			},
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredPermission: permissionData,
				message: `Unauthorized: required permissions: ${permission}`,
			},
			{ status: 403 },
		)
	}
	return user.id
}

export async function requireUserWithRole(request: Request, name: string) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true },
		where: { id: userId, roles: { some: { name } } },
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredRole: name,
				message: `Unauthorized: required role: ${name}`,
			},
			{ status: 403 },
		)
	}

	return user
}

export async function requireUserWithRoles(request: Request, roles: string[]) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true, username: true },
		where: {
			id: userId,
			roles: {
				some: {
					name: { in: roles },
				},
			},
		},
	})

	if (!user) {
		throw json(
			{
				error: 'Unauthorized',
				requiredRoles: roles,
				message: `Unauthorized: required roles: ${roles.join(', ')}`,
			},
			{ status: 403 },
		)
	}

	return user
}

export async function userIsAdmin(request: Request) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true },
		where: {
			id: userId,
			roles: {
				some: {
					name: { in: ['admin'] },
				},
			},
		},
	})

	return !!user
}

export async function userIsValidator(request: Request) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: { id: true, email: true },
		where: {
			id: userId,
			roles: {
				some: {
					name: {
						in: [
							'admin',
							'reviewer',
							'mofa-validator',
							'niss-validator',
							'mofa-printer',
						],
					},
				},
			},
		},
	})

	return !!user
}

export async function resetUserPassword({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const saltRounds = await getSetting<number>(SettingKeys.AUTH_BCRYPT_SALT_ROUNDS)
	const hashedPassword = await bcrypt.hash(password, saltRounds)

	return prisma.user.update({
		select: { id: true },
		where: { username },
		data: {
			password: {
				update: {
					hash: hashedPassword,
				},
			},
		},
	})
}

// ============================================================================
// IMPERSONATION FUNCTIONS
// ============================================================================

/**
 * Validates an impersonation token from the admin system
 */
export function validateImpersonationToken(
	token: string,
): ImpersonationTokenPayload | null {
	const secret = process.env.IMPERSONATION_SECRET
	if (!secret) {
		console.error('IMPERSONATION_SECRET not configured')
		return null
	}

	try {
		const payload = jwt.verify(token, secret) as ImpersonationTokenPayload
		return payload
	} catch (error) {
		console.error('Invalid impersonation token:', error)
		return null
	}
}

/**
 * Creates a session for impersonation
 */
export async function createImpersonationSession({
	userId,
	adminId,
	adminName,
	returnUrl,
	request,
}: {
	userId: string
	adminId: string
	adminName: string
	returnUrl?: string
	request: Request
}) {
	// Verify the user exists and has appropriate roles
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			tenantId: true,
			roles: { select: { name: true } },
		},
	})

	if (!user) {
		return null
	}

	// Check that user has 'user' or 'focal' role (can be impersonated)
	const hasValidRole = user.roles.some(
		role => role.name === 'user' || role.name === 'focal',
	)
	if (!hasValidRole) {
		return null
	}

	const metadata = {
		fingerprint: generateFingerprint(request),
		isImpersonating: true,
		impersonatedBy: adminId,
		impersonatedByName: adminName,
		returnUrl,
	}

	const session = await prisma.session.create({
		select: { id: true, userId: true, expirationDate: true },
		data: {
			userId: user.id,
			expirationDate: await getSessionExpirationDate(),
			metadata,
		},
	})

	// Create audit log for impersonation
	await createAuditLog({
		action: AuditAction.IMPERSONATE,
		entityType: AuditEntityType.USER,
		entityId: userId,
		description: `Admin started impersonating user`,
		userId: adminId,
		tenantId: user.tenantId,
		metadata: {
			impersonatedUserId: userId,
			adminId,
			adminName,
		},
	})

	return session
}

/**
 * Gets impersonation info from the current session
 */
export async function getImpersonationInfo(request: Request): Promise<{
	isImpersonating: boolean
	impersonatedBy?: string
	impersonatedByName?: string
	returnUrl?: string
} | null> {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)
	if (!sessionId) return null

	const session = await prisma.session.findUnique({
		select: { metadata: true },
		where: { id: sessionId },
	})

	if (!session) return null

	const metadata = session.metadata as SessionMetadata | null
	if (!metadata?.isImpersonating) {
		return { isImpersonating: false }
	}

	return {
		isImpersonating: true,
		impersonatedBy: metadata.impersonatedBy,
		impersonatedByName: metadata.impersonatedByName,
		returnUrl: metadata.returnUrl,
	}
}

/**
 * Ends impersonation by logging out and creating audit log
 */
export async function endImpersonation({
	request,
	redirectTo = '/',
}: {
	request: Request
	redirectTo?: string
}) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)
	let adminReturnUrl: string | undefined

	if (sessionId) {
		const session = await prisma.session.findUnique({
			select: { userId: true, metadata: true },
			where: { id: sessionId },
		})

		if (session) {
			const metadata = session.metadata as SessionMetadata | null
			if (metadata?.isImpersonating && metadata.impersonatedBy) {
				adminReturnUrl = metadata.returnUrl

				// Get user's tenant for audit log
				const user = await prisma.user.findUnique({
					where: { id: session.userId },
					select: { tenantId: true },
				})

				// Create audit log for ending impersonation
				await createAuditLog({
					action: AuditAction.IMPERSONATE_END,
					entityType: AuditEntityType.USER,
					entityId: session.userId,
					description: `Admin stopped impersonating user`,
					userId: metadata.impersonatedBy,
					tenantId: user?.tenantId,
					metadata: {
						impersonatedUserId: session.userId,
						adminId: metadata.impersonatedBy,
					},
				})
			}
		}

		void prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
	}

	// If there's an admin return URL, redirect to the admin app
	if (adminReturnUrl) {
		const adminPortalUrl = process.env.ADMIN_PORTAL_URL
		if (adminPortalUrl) {
			throw redirect(adminPortalUrl + adminReturnUrl, {
				headers: {
					'set-cookie': await sessionStorage.destroySession(cookieSession),
				},
			})
		}
	}

	throw redirect(safeRedirect(redirectTo), {
		headers: {
			'set-cookie': await sessionStorage.destroySession(cookieSession),
		},
	})
}
