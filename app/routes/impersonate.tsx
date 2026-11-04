import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import {
	createImpersonationSession,
	validateImpersonationToken,
} from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { sessionStorage } from '~/utils/session.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const token = url.searchParams.get('token')

	if (!token) {
		console.error('Impersonation: No token provided')
		return redirect('/?error=invalid_token')
	}

	// Validate the token
	const payload = validateImpersonationToken(token)
	if (!payload) {
		console.error('Impersonation: Invalid or expired token')
		return redirect('/?error=invalid_token')
	}

	// Verify the user exists and belongs to the same tenant
	const user = await prisma.user.findUnique({
		where: { id: payload.userId },
		select: {
			id: true,
			tenantId: true,
			name: true,
			roles: { select: { name: true } },
		},
	})

	if (!user) {
		console.error('Impersonation: User not found')
		return redirect('/?error=user_not_found')
	}

	// Verify tenant matches
	if (user.tenantId !== payload.tenantId) {
		console.error('Impersonation: Tenant mismatch')
		return redirect('/?error=unauthorized')
	}

	// Verify user has valid roles (user or focal)
	const hasValidRole = user.roles.some(
		role => role.name === 'user' || role.name === 'focal',
	)
	if (!hasValidRole) {
		console.error('Impersonation: User does not have valid role')
		return redirect('/?error=invalid_role')
	}

	// Create the impersonation session
	const session = await createImpersonationSession({
		userId: payload.userId,
		adminId: payload.adminId,
		adminName: payload.adminName,
		returnUrl: payload.returnUrl,
		request,
	})

	if (!session) {
		console.error('Impersonation: Failed to create session')
		return redirect('/?error=session_error')
	}

	// Set the session cookie
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	cookieSession.set('sessionId', session.id)

	// Redirect to events page
	return redirect('/events', {
		headers: {
			'set-cookie': await sessionStorage.commitSession(cookieSession, {
				expires: session.expirationDate,
			}),
		},
	})
}

export default function ImpersonateRoute() {
	// This should never render as the loader always redirects
	return null
}
