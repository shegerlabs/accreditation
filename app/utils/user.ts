import { useRouteLoaderData } from '@remix-run/react'
import { type loader as rootLoader } from '~/root'

export function useOptionalUser() {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	return data?.user ?? null
}

export function useUser() {
	const user = useOptionalUser()
	if (!user)
		throw new Error(
			'User not found. If the user is optional, use useOptionalUser instead.',
		)

	return user
}

type Action = 'create' | 'read' | 'update' | 'delete'

type Entity = 'user' | 'role' | 'permission' | 'tenant' | 'participant'

type Access = 'own' | 'any' | 'own,any' | 'any,own'

export type PermissionString =
	| `${Action}:${Entity}`
	| `${Action}:${Entity}:${Access}`

export function parsePermissionString(permissionString: PermissionString) {
	const [action, entity, access] = permissionString.split(':') as [
		Action,
		Entity,
		Access | undefined,
	]

	return {
		action,
		entity,
		access: access ? (access.split(',') as Array<Access>) : undefined,
	}
}

export function userHasPermission(
	user: Pick<ReturnType<typeof useUser>, 'roles'> | null,
	permission: PermissionString,
) {
	if (!user) return false
	const { action, entity, access } = parsePermissionString(permission)
	return user.roles.some(role =>
		role.permissions.some(
			permission =>
				permission.entity === entity &&
				permission.action === action &&
				(!access || access.includes(permission.access as Access)),
		),
	)
}

export function userHasRole(
	user: Pick<ReturnType<typeof useUser>, 'roles'> | null,
	role: string,
) {
	if (!user) return false
	return user.roles.some(r => r.name === role)
}

export function userHasRoles(
	user: Pick<ReturnType<typeof useUser>, 'roles'> | null,
	roles: string[],
) {
	if (!user) return false
	return roles.some(role => userHasRole(user, role))
}
