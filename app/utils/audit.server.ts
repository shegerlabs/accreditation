import { AuditAction, AuditEntityType, Prisma } from '@prisma/client'
import { prisma } from './db.server'

interface AuditLogOptions {
	action: AuditAction
	entityType: AuditEntityType
	entityId?: string
	description: string
	userId?: string | null
	tenantId?: string | null
	metadata?: Prisma.InputJsonValue
	ipAddress?: string
	userAgent?: string
}

export async function createAuditLog({
	action,
	entityType,
	entityId,
	description,
	userId,
	tenantId,
	metadata,
	ipAddress,
	userAgent,
}: AuditLogOptions) {
	try {
		const auditLog = await prisma.auditLog.create({
			data: {
				action,
				entityType,
				entityId,
				description,
				userId,
				tenantId,
				metadata,
				ipAddress,
				userAgent,
			},
		})

		return auditLog
	} catch (error) {
		console.error('Failed to create audit log:', error)
		return null
	}
}

// Helper function to get client IP from request
export function getClientIp(request: Request): string | undefined {
	const forwardedFor = request.headers.get('x-forwarded-for')
	if (forwardedFor) {
		return forwardedFor.split(',')[0].trim()
	}
	return undefined
}

// Helper function to get user agent from request
export function getUserAgent(request: Request): string | undefined {
	return request.headers.get('user-agent') || undefined
}

// Utility function to create audit log from request
export async function auditRequest({
	request,
	action,
	entityType,
	entityId,
	description,
	userId,
	tenantId,
	metadata,
}: Omit<AuditLogOptions, 'ipAddress' | 'userAgent'> & {
	request: Request
}) {
	return createAuditLog({
		action,
		entityType,
		entityId,
		description,
		userId,
		tenantId,
		metadata,
		ipAddress: getClientIp(request),
		userAgent: getUserAgent(request),
	})
}
