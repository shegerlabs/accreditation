/**
 * Unit tests for app/utils/user.ts
 *
 * Tests the pure functions for permission and role checking,
 * and the React hooks for user access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	parsePermissionString,
	userHasPermission,
	userHasRole,
	userHasRoles,
	useOptionalUser,
	useUser,
	type PermissionString,
} from '~/utils/user'

// Mock useRouteLoaderData from @remix-run/react
const mockUseRouteLoaderData = vi.fn()
vi.mock('@remix-run/react', () => ({
	useRouteLoaderData: () => mockUseRouteLoaderData(),
}))

describe('user.ts', () => {
	// Reset mocks before each test
	beforeEach(() => {
		mockUseRouteLoaderData.mockReset()
	})

	describe('useOptionalUser', () => {
		it('should return user when data contains user', () => {
			const mockUser = {
				id: 'user-123',
				username: 'testuser',
				roles: [{ name: 'user', permissions: [] }],
			}
			mockUseRouteLoaderData.mockReturnValue({ user: mockUser })

			const result = useOptionalUser()
			expect(result).toEqual(mockUser)
		})

		it('should return null when data is undefined', () => {
			mockUseRouteLoaderData.mockReturnValue(undefined)

			const result = useOptionalUser()
			expect(result).toBeNull()
		})

		it('should return null when data has no user', () => {
			mockUseRouteLoaderData.mockReturnValue({})

			const result = useOptionalUser()
			expect(result).toBeNull()
		})

		it('should return null when user is null', () => {
			mockUseRouteLoaderData.mockReturnValue({ user: null })

			const result = useOptionalUser()
			expect(result).toBeNull()
		})

		it('should return null when user is undefined', () => {
			mockUseRouteLoaderData.mockReturnValue({ user: undefined })

			const result = useOptionalUser()
			expect(result).toBeNull()
		})
	})

	describe('useUser', () => {
		it('should return user when user exists', () => {
			const mockUser = {
				id: 'user-456',
				username: 'activeuser',
				roles: [{ name: 'admin', permissions: [] }],
			}
			mockUseRouteLoaderData.mockReturnValue({ user: mockUser })

			const result = useUser()
			expect(result).toEqual(mockUser)
		})

		it('should throw error when user is null', () => {
			mockUseRouteLoaderData.mockReturnValue({ user: null })

			expect(() => useUser()).toThrow(
				'User not found. If the user is optional, use useOptionalUser instead.',
			)
		})

		it('should throw error when data is undefined', () => {
			mockUseRouteLoaderData.mockReturnValue(undefined)

			expect(() => useUser()).toThrow(
				'User not found. If the user is optional, use useOptionalUser instead.',
			)
		})

		it('should throw error when user is undefined', () => {
			mockUseRouteLoaderData.mockReturnValue({ user: undefined })

			expect(() => useUser()).toThrow(
				'User not found. If the user is optional, use useOptionalUser instead.',
			)
		})
	})

	describe('parsePermissionString', () => {
		it('should parse action and entity without access', () => {
			const result = parsePermissionString('read:user')
			expect(result).toEqual({
				action: 'read',
				entity: 'user',
				access: undefined,
			})
		})

		it('should parse action, entity, and single access', () => {
			const result = parsePermissionString('create:user:own')
			expect(result).toEqual({
				action: 'create',
				entity: 'user',
				access: ['own'],
			})
		})

		it('should parse action, entity, and multiple access levels', () => {
			const result = parsePermissionString('update:participant:own,any')
			expect(result).toEqual({
				action: 'update',
				entity: 'participant',
				access: ['own', 'any'],
			})
		})

		it('should handle delete action', () => {
			const result = parsePermissionString('delete:role')
			expect(result).toEqual({
				action: 'delete',
				entity: 'role',
				access: undefined,
			})
		})

		it('should handle permission entity', () => {
			const result = parsePermissionString('read:permission:any')
			expect(result).toEqual({
				action: 'read',
				entity: 'permission',
				access: ['any'],
			})
		})

		it('should handle tenant entity', () => {
			const result = parsePermissionString('update:tenant:own')
			expect(result).toEqual({
				action: 'update',
				entity: 'tenant',
				access: ['own'],
			})
		})

		it('should handle any,own access order', () => {
			const result = parsePermissionString('read:user:any,own')
			expect(result).toEqual({
				action: 'read',
				entity: 'user',
				access: ['any', 'own'],
			})
		})
	})

	describe('userHasPermission', () => {
		const createMockUser = (permissions: Array<{ entity: string; action: string; access: string }>) => ({
			roles: [
				{
					name: 'test-role',
					permissions,
					menus: [],
					menuItems: [],
				},
			],
		})

		it('should return false for null user', () => {
			const result = userHasPermission(null, 'read:user')
			expect(result).toBe(false)
		})

		it('should return true when user has matching permission', () => {
			const user = createMockUser([
				{ entity: 'user', action: 'read', access: 'any' },
			])
			const result = userHasPermission(user, 'read:user')
			expect(result).toBe(true)
		})

		it('should return false when user lacks permission', () => {
			const user = createMockUser([
				{ entity: 'user', action: 'read', access: 'any' },
			])
			const result = userHasPermission(user, 'delete:user')
			expect(result).toBe(false)
		})

		it('should return true when user has permission with matching access', () => {
			const user = createMockUser([
				{ entity: 'participant', action: 'update', access: 'own' },
			])
			const result = userHasPermission(user, 'update:participant:own')
			expect(result).toBe(true)
		})

		it('should return false when user has permission but wrong access', () => {
			const user = createMockUser([
				{ entity: 'participant', action: 'update', access: 'own' },
			])
			const result = userHasPermission(user, 'update:participant:any')
			expect(result).toBe(false)
		})

		it('should return true when access includes user permission', () => {
			const user = createMockUser([
				{ entity: 'user', action: 'read', access: 'any' },
			])
			const result = userHasPermission(user, 'read:user:any')
			expect(result).toBe(true)
		})

		it('should check across multiple roles', () => {
			const user = {
				roles: [
					{
						name: 'role1',
						permissions: [{ entity: 'user', action: 'read', access: 'own' }],
						menus: [],
						menuItems: [],
					},
					{
						name: 'role2',
						permissions: [{ entity: 'participant', action: 'create', access: 'any' }],
						menus: [],
						menuItems: [],
					},
				],
			}
			expect(userHasPermission(user, 'read:user:own')).toBe(true)
			expect(userHasPermission(user, 'create:participant:any')).toBe(true)
			expect(userHasPermission(user, 'delete:user')).toBe(false)
		})

		it('should return true when checking permission without access and user has any access', () => {
			const user = createMockUser([
				{ entity: 'tenant', action: 'read', access: 'own' },
			])
			const result = userHasPermission(user, 'read:tenant')
			expect(result).toBe(true)
		})
	})

	describe('userHasRole', () => {
		const createMockUser = (roleNames: string[]) => ({
			roles: roleNames.map(name => ({
				name,
				permissions: [],
				menus: [],
				menuItems: [],
			})),
		})

		it('should return false for null user', () => {
			const result = userHasRole(null, 'admin')
			expect(result).toBe(false)
		})

		it('should return true when user has the role', () => {
			const user = createMockUser(['admin', 'user'])
			const result = userHasRole(user, 'admin')
			expect(result).toBe(true)
		})

		it('should return false when user does not have the role', () => {
			const user = createMockUser(['user'])
			const result = userHasRole(user, 'admin')
			expect(result).toBe(false)
		})

		it('should be case-sensitive', () => {
			const user = createMockUser(['Admin'])
			const result = userHasRole(user, 'admin')
			expect(result).toBe(false)
		})

		it('should handle user with no roles', () => {
			const user = { roles: [] }
			const result = userHasRole(user, 'admin')
			expect(result).toBe(false)
		})

		it('should find role among multiple roles', () => {
			const user = createMockUser(['user', 'editor', 'reviewer'])
			expect(userHasRole(user, 'editor')).toBe(true)
			expect(userHasRole(user, 'reviewer')).toBe(true)
		})
	})

	describe('userHasRoles', () => {
		const createMockUser = (roleNames: string[]) => ({
			roles: roleNames.map(name => ({
				name,
				permissions: [],
				menus: [],
				menuItems: [],
			})),
		})

		it('should return false for null user', () => {
			const result = userHasRoles(null, ['admin'])
			expect(result).toBe(false)
		})

		it('should return true when user has at least one of the roles', () => {
			const user = createMockUser(['user', 'editor'])
			const result = userHasRoles(user, ['admin', 'editor'])
			expect(result).toBe(true)
		})

		it('should return false when user has none of the roles', () => {
			const user = createMockUser(['user'])
			const result = userHasRoles(user, ['admin', 'editor'])
			expect(result).toBe(false)
		})

		it('should return true when checking single role user has', () => {
			const user = createMockUser(['admin'])
			const result = userHasRoles(user, ['admin'])
			expect(result).toBe(true)
		})

		it('should return false for empty roles array', () => {
			const user = createMockUser(['admin'])
			const result = userHasRoles(user, [])
			expect(result).toBe(false)
		})

		it('should handle user with no roles', () => {
			const user = { roles: [] }
			const result = userHasRoles(user, ['admin', 'user'])
			expect(result).toBe(false)
		})

		it('should return true when user has all requested roles', () => {
			const user = createMockUser(['admin', 'user', 'editor'])
			const result = userHasRoles(user, ['admin', 'editor'])
			expect(result).toBe(true)
		})

		it('should work with validator roles', () => {
			const user = createMockUser(['mofa-validator', 'user'])
			const result = userHasRoles(user, ['admin', 'reviewer', 'mofa-validator', 'niss-validator'])
			expect(result).toBe(true)
		})
	})
})
