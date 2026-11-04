import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma before importing the module
vi.mock('~/utils/db.server', () => ({
	prisma: {
		auditLog: {
			create: vi.fn(),
		},
	},
}))

import { prisma } from '~/utils/db.server'
import {
	createAuditLog,
	getClientIp,
	getUserAgent,
	auditRequest,
} from '~/utils/audit.server'

describe('audit.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('getClientIp', () => {
		it('should return first IP from x-forwarded-for header', () => {
			const request = new Request('http://localhost', {
				headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1' },
			})

			expect(getClientIp(request)).toBe('192.168.1.1')
		})

		it('should trim whitespace from IP', () => {
			const request = new Request('http://localhost', {
				headers: { 'x-forwarded-for': '  192.168.1.1  ' },
			})

			expect(getClientIp(request)).toBe('192.168.1.1')
		})

		it('should return undefined when no x-forwarded-for header', () => {
			const request = new Request('http://localhost')

			expect(getClientIp(request)).toBeUndefined()
		})

		it('should handle single IP without comma', () => {
			const request = new Request('http://localhost', {
				headers: { 'x-forwarded-for': '10.0.0.1' },
			})

			expect(getClientIp(request)).toBe('10.0.0.1')
		})
	})

	describe('getUserAgent', () => {
		it('should return user-agent header value', () => {
			const request = new Request('http://localhost', {
				headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' },
			})

			expect(getUserAgent(request)).toBe('Mozilla/5.0 (Windows NT 10.0)')
		})

		it('should return undefined when no user-agent header', () => {
			const request = new Request('http://localhost')

			expect(getUserAgent(request)).toBeUndefined()
		})

		it('should return undefined for empty user-agent', () => {
			const request = new Request('http://localhost', {
				headers: { 'user-agent': '' },
			})

			expect(getUserAgent(request)).toBeUndefined()
		})
	})

	describe('createAuditLog', () => {
		const mockAuditLog = {
			id: 'audit-123',
			action: 'CREATE' as const,
			entityType: 'PARTICIPANT' as const,
			entityId: 'entity-456',
			description: 'Created participant',
			userId: 'user-789',
			tenantId: 'tenant-abc',
			metadata: { key: 'value' },
			ipAddress: '192.168.1.1',
			userAgent: 'Mozilla/5.0',
			createdAt: new Date(),
		}

		it('should create audit log with all fields', async () => {
			vi.mocked(prisma.auditLog.create).mockResolvedValue(mockAuditLog)

			const result = await createAuditLog({
				action: 'CREATE',
				entityType: 'PARTICIPANT',
				entityId: 'entity-456',
				description: 'Created participant',
				userId: 'user-789',
				tenantId: 'tenant-abc',
				metadata: { key: 'value' },
				ipAddress: '192.168.1.1',
				userAgent: 'Mozilla/5.0',
			})

			expect(prisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: 'CREATE',
					entityType: 'PARTICIPANT',
					entityId: 'entity-456',
					description: 'Created participant',
					userId: 'user-789',
					tenantId: 'tenant-abc',
					metadata: { key: 'value' },
					ipAddress: '192.168.1.1',
					userAgent: 'Mozilla/5.0',
				},
			})
			expect(result).toEqual(mockAuditLog)
		})

		it('should create audit log with only required fields', async () => {
			vi.mocked(prisma.auditLog.create).mockResolvedValue({
				...mockAuditLog,
				entityId: null,
				userId: null,
				tenantId: null,
			})

			const result = await createAuditLog({
				action: 'OTHER',
				entityType: 'EVENT',
				description: 'Viewed event list',
			})

			expect(prisma.auditLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					action: 'OTHER',
					entityType: 'EVENT',
					description: 'Viewed event list',
				}),
			})
			expect(result).toBeDefined()
		})

		it('should return null and log error on database failure', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB Error'))

			const result = await createAuditLog({
				action: 'CREATE',
				entityType: 'USER',
				description: 'Test',
			})

			expect(result).toBeNull()
			expect(consoleSpy).toHaveBeenCalledWith(
				'Failed to create audit log:',
				expect.any(Error),
			)

			consoleSpy.mockRestore()
		})
	})

	describe('auditRequest', () => {
		it('should extract IP and user-agent from request and create log', async () => {
			const mockResult = { id: 'audit-123' }
			vi.mocked(prisma.auditLog.create).mockResolvedValue(mockResult as any)

			const request = new Request('http://localhost', {
				headers: {
					'x-forwarded-for': '203.0.113.195',
					'user-agent': 'TestAgent/1.0',
				},
			})

			await auditRequest({
				request,
				action: 'UPDATE',
				entityType: 'PARTICIPANT',
				entityId: 'p-123',
				description: 'Updated participant',
				userId: 'u-456',
				tenantId: 't-789',
			})

			expect(prisma.auditLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					action: 'UPDATE',
					entityType: 'PARTICIPANT',
					entityId: 'p-123',
					description: 'Updated participant',
					userId: 'u-456',
					tenantId: 't-789',
					ipAddress: '203.0.113.195',
					userAgent: 'TestAgent/1.0',
				}),
			})
		})

		it('should handle request without headers gracefully', async () => {
			vi.mocked(prisma.auditLog.create).mockResolvedValue({
				id: 'audit-456',
			} as any)

			const request = new Request('http://localhost')

			await auditRequest({
				request,
				action: 'DELETE',
				entityType: 'INVITATION',
				description: 'Deleted invitation',
			})

			expect(prisma.auditLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					ipAddress: undefined,
					userAgent: undefined,
				}),
			})
		})
	})
})
