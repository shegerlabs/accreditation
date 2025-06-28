import { Password, User } from '@prisma/client'
import { json, redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { addMinutes, isBefore } from 'date-fns'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { AUTH_SETTINGS } from '~/utils/constants'
import { prisma } from './db.server'
import { combineResponses } from './misc'
import { sessionStorage } from './session.server'
import { parsePermissionString, PermissionString } from './user'

const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days

export const getSessionExpirationDate = () =>
	new Date(Date.now() + SESSION_EXPIRATION_TIME)

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

	const currentFingerprint = generateFingerprint(request)
	const sessionMetadata = session.metadata as { fingerprint: string } | null

	if (
		sessionMetadata?.fingerprint &&
		currentFingerprint !== sessionMetadata.fingerprint
	) {
		throw await logout({ request })
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
			sessions: true,
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
			expirationDate: getSessionExpirationDate(),
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
			expirationDate: getSessionExpirationDate(),
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
	const hash = await bcrypt.hash(password, 10)
	return hash
}

export async function verifyUserPassword(
	where: Pick<User, 'username'> | Pick<User, 'id'>,
	password: Password['hash'],
) {
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
		if (userWithPassword.lockCount >= AUTH_SETTINGS.MAX_LOCK_COUNT) {
			throw new Error(
				'Account is permanently locked due to multiple security violations. Please contact an administrator.',
			)
		}

		if (
			userWithPassword.autoUnlockAt &&
			isBefore(new Date(), userWithPassword.autoUnlockAt)
		) {
			throw new Error('Account is locked. Please try again later.')
		} else if (
			userWithPassword.autoUnlockAt &&
			isBefore(userWithPassword.autoUnlockAt, new Date())
		) {
			// Auto-unlock the account if lockout duration has passed and lock count is below threshold
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
	}

	// Check if we should reset failed attempts due to time passed
	if (
		userWithPassword.lastFailedLoginAt &&
		isBefore(
			addMinutes(
				userWithPassword.lastFailedLoginAt,
				AUTH_SETTINGS.AUTO_RESET_AFTER,
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
		if (failedAttempts >= AUTH_SETTINGS.MAX_LOGIN_ATTEMPTS) {
			const finalLockCount = (userWithPassword.lockCount || 0) + 1
			updates.status = 'LOCKED'
			updates.lockedAt = new Date()
			updates.lockReason = 'Too many failed login attempts'
			updates.lockCount = finalLockCount
			updates.autoUnlockAt =
				finalLockCount >= AUTH_SETTINGS.MAX_LOCK_COUNT
					? null // No auto-unlock for accounts locked too many times
					: addMinutes(new Date(), AUTH_SETTINGS.LOCKOUT_DURATION)
		}

		await prisma.user.update({
			where: { id: userWithPassword.id },
			data: {
				...updates,
				status: updates.status as 'LOCKED' | undefined,
			},
		})

		// Create audit log
		await prisma.auditLog.create({
			data: {
				userId: userWithPassword.id,
				action: 'LOGIN',
				entityType: 'USER',
				entityId: userWithPassword.id,
				description: `Failed login attempt ${failedAttempts}/${AUTH_SETTINGS.MAX_LOGIN_ATTEMPTS}`,
				metadata: {
					failedAttempts,
					isLocked: failedAttempts >= AUTH_SETTINGS.MAX_LOGIN_ATTEMPTS,
					lockCount: updates.lockCount || userWithPassword.lockCount || 0,
				},
			},
		})

		if (failedAttempts >= AUTH_SETTINGS.MAX_LOGIN_ATTEMPTS) {
			const message =
				(updates.lockCount || 0) >= AUTH_SETTINGS.MAX_LOCK_COUNT
					? 'Account has been permanently locked due to multiple security violations. Please contact an administrator.'
					: `Account locked due to too many failed attempts. Please try again after ${AUTH_SETTINGS.LOCKOUT_DURATION} minutes.`
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
	await prisma.auditLog.create({
		data: {
			userId: userWithPassword.id,
			action: 'LOGIN',
			entityType: 'USER',
			entityId: userWithPassword.id,
			description: 'Successful login',
		},
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
	const hashedPassword = await bcrypt.hash(password, 10)

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
